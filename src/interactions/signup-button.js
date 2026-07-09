const {
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getEventById, removeSignup, getSignups, REMOVE_SIGNUP_OK } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

const CLASS_OPTIONS = [
  '冰雷', '火毒', '主教', '箭神', '神射手', '暗影神偷',
  '夜使者', '黑騎士', '聖騎士', '英雄', '槍神', '拳霸',
];

const CLASS_BUTTONS_PER_ROW = 4;

function buildClassButtonRows(eventId) {
  const buttons = CLASS_OPTIONS.map((className) =>
    new ButtonBuilder()
      .setCustomId(`class-choice:${eventId}:${className}`)
      .setLabel(className)
      .setStyle(ButtonStyle.Secondary),
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += CLASS_BUTTONS_PER_ROW) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + CLASS_BUTTONS_PER_ROW)));
  }
  return rows;
}

function buildJoinDetailsModal(eventId, className) {
  const modal = new ModalBuilder()
    .setCustomId(`join-modal:${eventId}:${className}`)
    .setTitle(`報名揪團（${className}）`);

  const levelInput = new TextInputBuilder()
    .setCustomId('level')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const levelLabel = new LabelBuilder()
    .setLabel('等級')
    .setTextInputComponent(levelInput);

  const gameIdInput = new TextInputBuilder()
    .setCustomId('game_id')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const gameIdLabel = new LabelBuilder()
    .setLabel('遊戲 ID')
    .setTextInputComponent(gameIdInput);

  modal.addLabelComponents(levelLabel, gameIdLabel);

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

async function handleCancelButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
    return;
  }

  const result = removeSignup(db, event.id, interaction.user.id);
  if (result !== REMOVE_SIGNUP_OK) {
    await interaction.reply({ content: '你還沒有報名喔', ephemeral: true });
    return;
  }

  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const message = await interaction.channel.messages.fetch(event.message_id);
  await message.edit({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '已取消報名', ephemeral: true });
}

module.exports = {
  buildClassButtonRows,
  buildJoinDetailsModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  CLASS_OPTIONS,
};
