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
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');
const { tryAcknowledgeAndDeleteReply } = require('./ack');
const { getOptionalTextInputValue } = require('./join-modal');
const { buildClassButtonRowsForCustomIds } = require('./signup-button');

const EXTERNAL_TARGET = 'external';

function buildAssistTargetPickerRows(eventId) {
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId(`assist-user-select:${eventId}`)
    .setPlaceholder('選擇伺服器成員')
    .setMinValues(1)
    .setMaxValues(1);

  const externalButton = new ButtonBuilder()
    .setCustomId(`assist-external:${eventId}`)
    .setLabel('好友沒有 Discord 帳號')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(externalButton),
  ];
}

function buildAssistClassButtonRows(eventId, target) {
  return buildClassButtonRowsForCustomIds((className) => `assist-class-choice:${eventId}:${target}:${className}`);
}

function buildAssistJoinModal(eventId, target, className) {
  const modal = new ModalBuilder()
    .setCustomId(`assist-join-modal:${eventId}:${target}:${className}`)
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
    .setMaxLength(32)
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
  const eventId = interaction.customId.split(':')[1];
  await interaction.reply({
    content: '請選擇要代報名的對象：',
    components: buildAssistTargetPickerRows(eventId),
    ephemeral: true,
  });
}

async function handleAssistUserSelect(interaction) {
  const eventId = interaction.customId.split(':')[1];
  const targetUserId = interaction.values[0];
  await interaction.update({
    content: '請選擇職業：',
    components: buildAssistClassButtonRows(eventId, targetUserId),
  });
}

async function handleAssistExternalButton(interaction) {
  const eventId = interaction.customId.split(':')[1];
  await interaction.update({
    content: '請選擇職業：',
    components: buildAssistClassButtonRows(eventId, EXTERNAL_TARGET),
  });
}

async function handleAssistClassChoiceButton(interaction) {
  const [, eventId, target, className] = interaction.customId.split(':');
  await interaction.showModal(buildAssistJoinModal(eventId, target, className));
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
  const [, eventIdRaw, target, className] = interaction.customId.split(':');
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
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const message = await interaction.channel.messages.fetch(event.message_id);
  await message.edit({ embeds: [embed], components: [row] });

  const nameSegment = isExternal ? `**${displayName}**` : `<@${userId}>`;
  const noteSegment = note ? `／備註：${note}` : '';
  const thread = await interaction.client.channels.fetch(event.thread_id);
  const mentionableUserIds = isExternal ? [interaction.user.id] : [userId, interaction.user.id];
  await thread.send({
    content: `${nameSegment} 已報名（職業：${className}／等級：${level}／ID：${gameId}${noteSegment}），由 <@${interaction.user.id}> 代為報名`,
    allowedMentions: { users: mentionableUserIds },
  });
}

module.exports = {
  EXTERNAL_TARGET,
  buildAssistTargetPickerRows,
  buildAssistClassButtonRows,
  buildAssistJoinModal,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
};
