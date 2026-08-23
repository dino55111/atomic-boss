const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const {
  getEventById,
  getSignups,
  getSignupById,
  removeSignupById,
} = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

const CLASS_OPTIONS = [
  '冰雷', '火毒', '主教', '箭神', '神射手', '暗影神偷',
  '夜使者', '黑騎士', '聖騎士', '英雄', '槍神', '拳霸',
];

const CLASS_BUTTONS_PER_ROW = 4;

function buildClassButtonRowsForCustomIds(customIdForClass) {
  const buttons = CLASS_OPTIONS.map((className) =>
    new ButtonBuilder()
      .setCustomId(customIdForClass(className))
      .setLabel(className)
      .setStyle(ButtonStyle.Secondary),
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += CLASS_BUTTONS_PER_ROW) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + CLASS_BUTTONS_PER_ROW)));
  }
  return rows;
}

function buildClassButtonRows(eventId) {
  return buildClassButtonRowsForCustomIds((className) => `class-choice:${eventId}:${className}`);
}

function buildJoinDetailsModal(eventId, className) {
  const modal = new ModalBuilder()
    .setCustomId(`join-modal:${eventId}:${className}`)
    .setTitle(`報名揪團（${className}）`);

  const levelInput = new TextInputBuilder()
    .setCustomId('level')
    .setLabel('等級')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const gameIdInput = new TextInputBuilder()
    .setCustomId('game_id')
    .setLabel('遊戲 ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const noteInput = new TextInputBuilder()
    .setCustomId('note')
    .setLabel('備註')
    .setPlaceholder('可以填 XXX 的小號')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(levelInput),
    new ActionRowBuilder().addComponents(gameIdInput),
    new ActionRowBuilder().addComponents(noteInput),
  );

  return modal;
}

async function handleSignupButton(interaction) {
  const eventId = interaction.customId.split(':')[1];
  await interaction.reply({
    content: '請選擇職業：',
    components: buildClassButtonRows(eventId),
    ephemeral: true,
  });
}

async function handleClassChoiceButton(interaction) {
  const [, eventId, className] = interaction.customId.split(':');
  await interaction.showModal(buildJoinDetailsModal(eventId, className));
}

const CANCEL_BUTTONS_PER_ROW = 5;

function findCancellableSignups(signups, event, userId) {
  const isCreator = userId === event.creator_id;
  const seen = new Set();
  const candidates = [];
  for (const signup of signups) {
    const isOwn = signup.user_id === userId;
    const isAddedByMe = signup.added_by_user_id === userId;
    const isExternalAsCreator = isCreator && !!signup.is_external;
    if ((isOwn || isAddedByMe || isExternalAsCreator) && !seen.has(signup.id)) {
      seen.add(signup.id);
      candidates.push(signup);
    }
  }
  return candidates;
}

function buildCancelChoiceRows(eventId, candidates) {
  const buttons = candidates.map((signup) =>
    new ButtonBuilder()
      .setCustomId(`cancel-select:${eventId}:${signup.id}`)
      .setLabel(`${signup.display_name}（${signup.class}）`.slice(0, 80))
      .setStyle(ButtonStyle.Secondary),
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += CANCEL_BUTTONS_PER_ROW) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + CANCEL_BUTTONS_PER_ROW)));
  }
  return rows;
}

async function applyCancellation(interaction, db, event, signup) {
  removeSignupById(db, signup.id);

  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const message = await interaction.channel.messages.fetch(event.message_id);
  await message.edit({ embeds: [embed], components: [row] });

  const nameSegment = signup.is_external ? `**${signup.display_name}**` : `<@${signup.user_id}>`;
  const assistSegment = interaction.user.id === signup.user_id ? '' : `（由 <@${interaction.user.id}> 代為取消）`;
  const thread = await interaction.client.channels.fetch(event.thread_id);
  await thread.send(`${nameSegment} 已取消報名${assistSegment}`);
}

async function handleCancelButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
    return;
  }

  const signups = getSignups(db, event.id);
  const candidates = findCancellableSignups(signups, event, interaction.user.id);

  if (candidates.length === 0) {
    await interaction.deferUpdate();
    return;
  }

  if (candidates.length > 1) {
    await interaction.reply({
      content: '請選擇要取消哪一筆報名：',
      components: buildCancelChoiceRows(event.id, candidates),
      ephemeral: true,
    });
    return;
  }

  await applyCancellation(interaction, db, event, candidates[0]);
  await interaction.reply({ content: '已取消報名', ephemeral: true });
}

async function handleCancelSelectButton(interaction, db) {
  const [, eventIdRaw, signupIdRaw] = interaction.customId.split(':');
  const eventId = Number.parseInt(eventIdRaw, 10);
  const signupId = Number.parseInt(signupIdRaw, 10);
  const event = getEventById(db, eventId);
  const signup = event && getSignupById(db, signupId);

  if (!event || !signup) {
    await interaction.update({ content: '這筆報名已經不存在了', components: [] });
    return;
  }

  await applyCancellation(interaction, db, event, signup);
  await interaction.update({ content: '已取消報名', components: [] });
}

module.exports = {
  buildClassButtonRows,
  buildClassButtonRowsForCustomIds,
  buildJoinDetailsModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
  CLASS_OPTIONS,
};
