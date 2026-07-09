const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TITLE_OPTIONS = ['普拉', '普炎', '困拉', '龍王', '蝴蝶王'];

const data = new SlashCommandBuilder()
  .setName('揪團')
  .setDescription('建立一個新的揪團報名');

function buildTitleButtonRow() {
  const buttons = TITLE_OPTIONS.map((title) =>
    new ButtonBuilder()
      .setCustomId(`title-choice:${title}`)
      .setLabel(title)
      .setStyle(ButtonStyle.Secondary),
  );

  return new ActionRowBuilder().addComponents(buttons);
}

async function execute(interaction) {
  await interaction.reply({
    content: '請選擇標題：',
    components: [buildTitleButtonRow()],
    ephemeral: true,
  });
}

module.exports = { data, execute, buildTitleButtonRow, TITLE_OPTIONS };
