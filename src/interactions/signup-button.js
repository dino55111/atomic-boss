const {
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  RadioGroupBuilder,
} = require('discord.js');
const { getEventById, removeSignup, getSignups, REMOVE_SIGNUP_OK } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

const CLASS_OPTIONS = [
  '冰雷', '火毒', '主教', '箭神', '神射手', '暗影神偷',
  '夜使者', '黑騎士', '聖騎士', '英雄', '槍神', '拳霸',
];

function buildJoinModal(eventId) {
  const modal = new ModalBuilder()
    .setCustomId(`join-modal:${eventId}`)
    .setTitle('報名揪團');

  // Discord's RadioGroup component caps out at 10 options, so the 12 classes
  // are split across two optional groups; handleJoinModal enforces that
  // exactly one of the two ends up selected.
  const classOptions1 = CLASS_OPTIONS.slice(0, 6);
  const classOptions2 = CLASS_OPTIONS.slice(6);

  const classRadioGroup1 = new RadioGroupBuilder()
    .setCustomId('class_1')
    .addOptions(classOptions1.map((className) => ({ label: className, value: className })));

  const classLabel1 = new LabelBuilder()
    .setLabel('職業（1/2）')
    .setRadioGroupComponent(classRadioGroup1);

  const classRadioGroup2 = new RadioGroupBuilder()
    .setCustomId('class_2')
    .addOptions(classOptions2.map((className) => ({ label: className, value: className })));

  const classLabel2 = new LabelBuilder()
    .setLabel('職業（2/2）')
    .setRadioGroupComponent(classRadioGroup2);

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

  modal.addLabelComponents(classLabel1, classLabel2, levelLabel, gameIdLabel);

  return modal;
}

async function handleSignupButton(interaction) {
  const eventId = interaction.customId.split(':')[1];
  await interaction.showModal(buildJoinModal(eventId));
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

module.exports = { buildJoinModal, handleSignupButton, handleCancelButton, CLASS_OPTIONS };
