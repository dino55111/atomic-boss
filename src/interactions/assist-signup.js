const crypto = require('crypto');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
const { getEventById, addSignup, getSignups, ADD_SIGNUP_FULL, ADD_SIGNUP_DUPLICATE } = require('../db/db');
const { updateEventAnnouncement } = require('../embeds/event-embed');
const { tryAcknowledgeAndDeleteReply, tryAcknowledgeKeepMessage } = require('./ack');
const { getOptionalTextInputValue, isValidLevel } = require('./join-modal');
const { buildClassButtonRowsForCustomIds } = require('./signup-button');

const EXTERNAL_TARGET = 'external';
const POSTCREATE_FLOW = 'postcreate';

// Appends ":flow" to a customId when a flow is given, so the same assist
// chain (picker -> class -> modal) can tell apart "triggered from the
// always-on 代報名 button" from "triggered right after /boss created the
// event", without duplicating any of its signup logic.
function withFlow(customId, flow) {
  return flow ? `${customId}:${flow}` : customId;
}

function buildAssistTargetPickerRows(eventId, flow) {
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId(withFlow(`assist-user-select:${eventId}`, flow))
    .setPlaceholder('選擇伺服器成員')
    .setMinValues(1)
    .setMaxValues(1);

  const externalButton = new ButtonBuilder()
    .setCustomId(withFlow(`assist-external:${eventId}`, flow))
    .setLabel('好友沒有 Discord 帳號')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(externalButton),
  ];
}

function buildAssistClassButtonRows(eventId, target, flow) {
  return buildClassButtonRowsForCustomIds((className) =>
    withFlow(`assist-class-choice:${eventId}:${target}:${className}`, flow),
  );
}

function buildAssistJoinModal(eventId, target, className, flow) {
  const modal = new ModalBuilder()
    .setCustomId(withFlow(`assist-join-modal:${eventId}:${target}:${className}`, flow))
    .setTitle(`代報名（${className}）`);

  const rows = [];

  if (target === EXTERNAL_TARGET) {
    const nicknameInput = new TextInputBuilder()
      .setCustomId('nickname')
      .setLabel('暱稱')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(32)
      .setRequired(true);
    rows.push(new ActionRowBuilder().addComponents(nicknameInput));
  }

  const levelInput = new TextInputBuilder()
    .setCustomId('level')
    .setLabel('等級')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(3)
    .setRequired(true);

  const gameIdInput = new TextInputBuilder()
    .setCustomId('game_id')
    .setLabel('遊戲 ID')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(64)
    .setRequired(true);

  const noteInput = new TextInputBuilder()
    .setCustomId('note')
    .setLabel('備註')
    .setPlaceholder('可以填 XXX 的小號')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(false);

  rows.push(
    new ActionRowBuilder().addComponents(levelInput),
    new ActionRowBuilder().addComponents(gameIdInput),
    new ActionRowBuilder().addComponents(noteInput),
  );

  modal.addComponents(...rows);

  return modal;
}

async function handleAssistButton(interaction) {
  const [, eventId, flow] = interaction.customId.split(':');
  const payload = {
    content: '請選擇要代報名的對象：',
    components: buildAssistTargetPickerRows(eventId, flow),
  };

  // The postcreate flow reuses its own ephemeral message end-to-end rather
  // than replying with a new one each step (see buildPostCreateAssistPromptRow
  // and the postcreate branch of handleAssistJoinModal below) — update()
  // edits the message this button is already on, in place. The always-on
  // 代報名 button lives on the public signup card itself, which can't be
  // turned ephemeral in place, so that path still replies with a new message.
  if (flow === POSTCREATE_FLOW) {
    await interaction.update(payload);
  } else {
    await interaction.reply({ ...payload, ephemeral: true });
  }
}

async function handleAssistUserSelect(interaction) {
  const [, eventId, flow] = interaction.customId.split(':');
  const targetUserId = interaction.values[0];
  await interaction.update({
    content: '請選擇職業：',
    components: buildAssistClassButtonRows(eventId, targetUserId, flow),
  });
}

async function handleAssistExternalButton(interaction) {
  const [, eventId, flow] = interaction.customId.split(':');
  await interaction.update({
    content: '請選擇職業：',
    components: buildAssistClassButtonRows(eventId, EXTERNAL_TARGET, flow),
  });
}

async function handleAssistClassChoiceButton(interaction) {
  const [, eventId, target, className, flow] = interaction.customId.split(':');
  await interaction.showModal(buildAssistJoinModal(eventId, target, className, flow));
}

// Shown right after /boss creates the event in the DB (see
// create-event-modal.js). The event isn't posted to the channel yet — it
// only goes out once the creator picks "直接發布" here or "發布" below, so
// anyone who'd see the signup card sees the pre-filled roster from the start
// instead of watching people get added one at a time.
function buildPostCreateAssistPromptRow(eventId) {
  const assistButton = new ButtonBuilder()
    .setCustomId(`assist:${eventId}:${POSTCREATE_FLOW}`)
    .setLabel('預先報名')
    .setStyle(ButtonStyle.Secondary);

  const publishButton = new ButtonBuilder()
    .setCustomId(`postcreate-publish:${eventId}`)
    .setLabel('直接發布')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(assistButton, publishButton);
}

// Shown after each successful postcreate-flow signup so the creator can
// loop back into the same assist chain for the next person, or publish now.
function buildContinueOrPublishRow(eventId) {
  const continueButton = new ButtonBuilder()
    .setCustomId(`assist:${eventId}:${POSTCREATE_FLOW}`)
    .setLabel('再加一個')
    .setStyle(ButtonStyle.Secondary);

  const publishButton = new ButtonBuilder()
    .setCustomId(`postcreate-publish:${eventId}`)
    .setLabel('發布')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(continueButton, publishButton);
}

// Shown in the postcreate flow's continue/publish prompt so the creator can
// see everyone pre-filled so far, not just the one they just added.
function formatRosterList(signups) {
  return signups
    .map((s, i) => `${i + 1}. ${s.display_name}（${s.class}／等級：${s.level}／ID：${s.game_id}）`)
    .join('\n');
}

function generateExternalUserId() {
  return `ext:${crypto.randomUUID()}`;
}

async function fetchDisplayName(client, target) {
  try {
    const user = await client.users.fetch(target);
    return user.username;
  } catch (error) {
    return target;
  }
}

async function handleAssistJoinModal(interaction, db) {
  const [, eventIdRaw, target, className, flow] = interaction.customId.split(':');
  const eventId = Number.parseInt(eventIdRaw, 10);
  const event = getEventById(db, eventId);
  const isPostCreate = flow === POSTCREATE_FLOW;

  // Same reasoning as handleJoinModal: the signup itself doesn't depend on
  // this interaction's token, so it must be recorded even if the ack fails.
  // The postcreate flow keeps reusing its one message across the whole
  // pre-fill loop (see handleAssistButton), so its ack only defers — the
  // message gets edited into the next prompt below instead of deleted.
  const acked = isPostCreate
    ? await tryAcknowledgeKeepMessage(interaction)
    : await tryAcknowledgeAndDeleteReply(interaction);

  if (!event) {
    if (acked) {
      await interaction.followUp({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
    }
    return;
  }

  const level = interaction.fields.getTextInputValue('level');
  const gameId = interaction.fields.getTextInputValue('game_id');
  const note = getOptionalTextInputValue(interaction.fields, 'note');

  if (!isValidLevel(level)) {
    if (acked) {
      await interaction.followUp({ content: '等級請輸入 1~200 之間的數字', ephemeral: true });
    }
    return;
  }

  const isExternal = target === EXTERNAL_TARGET;
  const userId = isExternal ? generateExternalUserId() : target;
  const displayName = isExternal
    ? interaction.fields.getTextInputValue('nickname')
    : await fetchDisplayName(interaction.client, target);

  const result = addSignup(db, event, {
    userId,
    displayName,
    className,
    level,
    gameId,
    note,
    addedByUserId: interaction.user.id,
    isExternal,
  });

  if (result === ADD_SIGNUP_DUPLICATE) {
    return;
  }
  if (result === ADD_SIGNUP_FULL) {
    if (acked) {
      await interaction.followUp({ content: '已經額滿了', ephemeral: true });
    }
    return;
  }

  const signups = getSignups(db, event.id);

  // Before the event is published (see create-event-modal.js), there's no
  // announcement message or thread yet to update/notify — the roster just
  // accumulates in the DB and shows up fully formed once it's posted.
  if (event.thread_id) {
    await updateEventAnnouncement(interaction.client, event, signups);

    const nameSegment = isExternal ? `**${displayName}**` : `<@${userId}>`;
    const noteSegment = note ? `／備註：${note}` : '';
    const thread = await interaction.client.channels.fetch(event.thread_id);
    // Discord rejects allowed_mentions.users containing a duplicate id, which
    // happens if a helper picks themselves as the assist target.
    const mentionableUserIds = isExternal ? [interaction.user.id] : [...new Set([userId, interaction.user.id])];
    await thread.send({
      content: `${nameSegment} 已報名（職業：${className}／等級：${level}／ID：${gameId}${noteSegment}），由 <@${interaction.user.id}> 代為報名`,
      allowedMentions: { users: mentionableUserIds },
    });
  }

  if (acked && isPostCreate) {
    await interaction.editReply({
      content: `已幫 ${displayName} 報名，要繼續加人嗎？\n\n目前報名名單：\n${formatRosterList(signups)}`,
      components: [buildContinueOrPublishRow(event.id)],
    });
  }
}

module.exports = {
  EXTERNAL_TARGET,
  POSTCREATE_FLOW,
  buildAssistTargetPickerRows,
  buildAssistClassButtonRows,
  buildAssistJoinModal,
  buildPostCreateAssistPromptRow,
  buildContinueOrPublishRow,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
};
