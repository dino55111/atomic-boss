const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
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
      .setRequired(true);
    rows.push(new ActionRowBuilder().addComponents(nicknameInput));
  }

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

module.exports = {
  EXTERNAL_TARGET,
  buildAssistTargetPickerRows,
  buildAssistClassButtonRows,
  buildAssistJoinModal,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
};
