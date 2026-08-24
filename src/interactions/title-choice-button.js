const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const SESSION_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const SESSION_BUTTONS_PER_ROW = 5;

function buildCreateEventModal(title, session) {
  const modal = new ModalBuilder()
    .setCustomId(`create-event-modal:${title}:${session}`)
    .setTitle(`建立揪團（${title}）`);

  const startTimeInput = new TextInputBuilder()
    .setCustomId('start_time')
    .setLabel('時間')
    .setPlaceholder('月/日 時:分，例如 7/12 20:00')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(startTimeInput));

  return modal;
}

function buildSessionButtonRow(title) {
  const buttons = SESSION_OPTIONS.map((session) =>
    new ButtonBuilder()
      .setCustomId(`session-choice:${title}:${session}`)
      .setLabel(`第${session}場`)
      .setStyle(ButtonStyle.Secondary),
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += SESSION_BUTTONS_PER_ROW) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + SESSION_BUTTONS_PER_ROW)));
  }
  return rows;
}

async function handleTitleChoiceButton(interaction) {
  const title = interaction.customId.split(':')[1];
  await interaction.update({
    content: '請選擇場次：',
    components: buildSessionButtonRow(title),
  });
}

async function handleSessionChoiceButton(interaction) {
  const [, title, session] = interaction.customId.split(':');
  await interaction.showModal(buildCreateEventModal(title, session));
}

module.exports = {
  buildCreateEventModal,
  buildSessionButtonRow,
  handleTitleChoiceButton,
  handleSessionChoiceButton,
  SESSION_OPTIONS,
};
