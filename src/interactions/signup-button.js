const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getEventById, removeSignup, getSignups, REMOVE_SIGNUP_OK } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

function buildJoinModal(eventId) {
  const modal = new ModalBuilder()
    .setCustomId(`join-modal:${eventId}`)
    .setTitle('報名揪團');

  const classInput = new TextInputBuilder()
    .setCustomId('class')
    .setLabel('職業')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

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

  modal.addComponents(
    new ActionRowBuilder().addComponents(classInput),
    new ActionRowBuilder().addComponents(levelInput),
    new ActionRowBuilder().addComponents(gameIdInput),
  );

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

module.exports = { buildJoinModal, handleSignupButton, handleCancelButton };
