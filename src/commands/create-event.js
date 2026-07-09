const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('揪團')
  .setDescription('建立一個新的揪團報名');

async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('create-event-modal')
    .setTitle('建立揪團');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('標題')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const capacityInput = new TextInputBuilder()
    .setCustomId('capacity')
    .setLabel('人數上限')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const startTimeInput = new TextInputBuilder()
    .setCustomId('start_time')
    .setLabel('時間')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(capacityInput),
    new ActionRowBuilder().addComponents(startTimeInput),
  );

  await interaction.showModal(modal);
}

module.exports = { data, execute };
