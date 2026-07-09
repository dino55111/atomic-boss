const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function buildCreateEventModal(title) {
  const modal = new ModalBuilder()
    .setCustomId(`create-event-modal:${title}`)
    .setTitle(`建立揪團（${title}）`);

  const startTimeInput = new TextInputBuilder()
    .setCustomId('start_time')
    .setLabel('時間')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(startTimeInput));

  return modal;
}

async function handleTitleChoiceButton(interaction) {
  const title = interaction.customId.split(':')[1];
  await interaction.showModal(buildCreateEventModal(title));
}

module.exports = { buildCreateEventModal, handleTitleChoiceButton };
