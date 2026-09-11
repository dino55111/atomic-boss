const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TITLE_CAPACITIES = {
  普拉: 6,
  普炎: 6,
  困拉: 6,
  龍王: 12,
  蝴蝶王: 6,
};

const TITLE_OPTIONS = Object.keys(TITLE_CAPACITIES);

const TITLE_EMOJIS = {
  普拉: '⏰',
  普炎: '🌋',
  困拉: '⏰',
  龍王: '🐉',
  蝴蝶王: '🦋',
};

const data = new SlashCommandBuilder()
  .setName('boss')
  .setDescription('建立一個新的揪團報名');

function buildTitleButtonRow() {
  const buttons = TITLE_OPTIONS.map((title) =>
    new ButtonBuilder()
      .setCustomId(`title-choice:${title}`)
      .setLabel(`${TITLE_EMOJIS[title]} ${title}`)
      .setStyle(ButtonStyle.Secondary),
  );

  return new ActionRowBuilder().addComponents(buttons);
}

async function execute(interaction) {
  if (interaction.channel.isThread()) {
    await interaction.reply({ content: '討論串裡不能開新的揪團，請到原本的頻道使用 /boss', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: '請選擇標題：',
    components: [buildTitleButtonRow()],
    ephemeral: true,
  });
}

module.exports = { data, execute, buildTitleButtonRow, TITLE_OPTIONS, TITLE_CAPACITIES, TITLE_EMOJIS };
