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
const { tryAcknowledgeAndDeleteReply } = require('./ack');
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
  await interaction.reply({
    content: '請選擇要代報名的對象：',
    components: buildAssistTargetPickerRows(eventId, flow),
    ephemeral: true,
  });
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

// Shown right after /boss creates and posts the event (see
// create-event-modal.js), so the creator can pre-fill known members before
// anyone else sees the signup card.
function buildPostCreateAssistPromptRow(eventId) {
  const assistButton = new ButtonBuilder()
    .setCustomId(`assist:${eventId}:${POSTCREATE_FLOW}`)
    .setLabel('幫人卡位')
    .setStyle(ButtonStyle.Secondary);

  const skipButton = new ButtonBuilder()
    .setCustomId('postcreate-assist-skip')
    .setLabel('不用')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(assistButton, skipButton);
}

// Shown after each successful postcreate-flow signup so the creator can
// loop back into the same assist chain for the next person.
function buildContinueOrDoneRow(eventId) {
  const continueButton = new ButtonBuilder()
    .setCustomId(`assist:${eventId}:${POSTCREATE_FLOW}`)
    .setLabel('再加一個')
    .setStyle(ButtonStyle.Secondary);

  const doneButton = new ButtonBuilder()
    .setCustomId('postcreate-assist-done')
    .setLabel('完成')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(continueButton, doneButton);
}

async function handlePostCreateAssistSkipButton(interaction) {
  await interaction.update({ content: '好的，之後要卡位可以在訊息上按「代報名」', components: [] });
}

async function handlePostCreateAssistDoneButton(interaction) {
  await interaction.update({ content: '好的，卡位完成！', components: [] });
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

  // Same reasoning as handleJoinModal: the signup itself doesn't depend on
  // this interaction's token, so it must be recorded even if the ack fails.
  const acked = await tryAcknowledgeAndDeleteReply(interaction);

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

  if (acked && flow === POSTCREATE_FLOW) {
    await interaction.followUp({
      content: `已幫 ${displayName} 卡位，要繼續加人嗎？`,
      components: [buildContinueOrDoneRow(event.id)],
      ephemeral: true,
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
  buildContinueOrDoneRow,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
  handlePostCreateAssistSkipButton,
  handlePostCreateAssistDoneButton,
};
