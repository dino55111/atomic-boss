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

const TITLE_COLORS = {
  普拉: 0xec7063,
  困拉: 0x922b21,
  普炎: 0xe67e22,
  龍王: 0x1b4f72,
  蝴蝶王: 0x16a085,
};

const TITLE_NOTES = {
  普拉: '拉圖進場須知：解前置\n自備物品：1D片、1雪、萬能藥、MP/HP藥水',
  普炎: '炎魔進場須知：無須前置\n自備物品：火之眼1顆(在包包內即可)、2雪、萬能藥、MP/HP藥水、櫻桃派(自行補雪)',
  困拉: '困拉進場須知：需打過普通拉圖斯\n自備物品：3雪、萬能藥、MP/HP藥水、櫻桃派(自行補雪)',
  龍王: '龍王進場須知：解前置\n自備物品：變身密藥、萬能藥、MP/HP藥水、櫻桃派(自行補雪)',
  蝴蝶王: '艾畢奈亞進場須知：解前置\n自備物品：2雪、萬能藥、MP/HP藥水、櫻桃派(自行補雪)',
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

module.exports = { data, execute, buildTitleButtonRow, TITLE_OPTIONS, TITLE_CAPACITIES, TITLE_EMOJIS, TITLE_NOTES, TITLE_COLORS };
