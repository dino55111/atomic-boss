const {
  SlashCommandBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  RadioGroupBuilder,
} = require('discord.js');

const TITLE_OPTIONS = ['普拉', '普炎', '困拉', '龍王', '蝴蝶王'];

const data = new SlashCommandBuilder()
  .setName('揪團')
  .setDescription('建立一個新的揪團報名');

async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('create-event-modal')
    .setTitle('建立揪團');

  const titleRadioGroup = new RadioGroupBuilder()
    .setCustomId('title')
    .setRequired(true)
    .addOptions(TITLE_OPTIONS.map((title) => ({ label: title, value: title })));

  const titleLabel = new LabelBuilder()
    .setLabel('標題')
    .setRadioGroupComponent(titleRadioGroup);

  const capacityInput = new TextInputBuilder()
    .setCustomId('capacity')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const capacityLabel = new LabelBuilder()
    .setLabel('人數上限')
    .setTextInputComponent(capacityInput);

  const startTimeInput = new TextInputBuilder()
    .setCustomId('start_time')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const startTimeLabel = new LabelBuilder()
    .setLabel('時間')
    .setTextInputComponent(startTimeInput);

  modal.addLabelComponents(titleLabel, capacityLabel, startTimeLabel);

  await interaction.showModal(modal);
}

module.exports = { data, execute, TITLE_OPTIONS };
