const {
  ModalBuilder,
  LabelBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const SESSION_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const SESSION_BUTTONS_PER_ROW = 5;

const DATE_OPTIONS_COUNT = 7;
const WEEKDAY_CHARS = ['日', '一', '二', '三', '四', '五', '六'];
const DEFAULT_HOUR = '20';
const DEFAULT_MINUTE = '00';
const MINUTE_OPTIONS = ['00', '10', '20', '30', '40', '50'];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));

// A select menu tops out at 25 options, so a full "任意月/日" picker can't fit
// (31 possible days alone exceeds that). Scoped down to the next 7 days from
// today, which covers how far ahead this kind of raid signup actually gets
// scheduled.
function buildDateOptions(now) {
  return Array.from({ length: DATE_OPTIONS_COUNT }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const value = `${date.getMonth() + 1}/${date.getDate()}`;
    const todaySuffix = offset === 0 ? '（今天）' : '';
    return {
      label: `${value} (${WEEKDAY_CHARS[date.getDay()]})${todaySuffix}`,
      value,
      default: offset === 0,
    };
  });
}

function buildCreateEventModal(title, session, now = new Date()) {
  const modal = new ModalBuilder()
    .setCustomId(`create-event-modal:${title}:${session}`)
    .setTitle(`建立揪團（${title}）`);

  const dateSelect = new StringSelectMenuBuilder()
    .setCustomId('event_date')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(buildDateOptions(now));

  const hourSelect = new StringSelectMenuBuilder()
    .setCustomId('event_hour')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(HOUR_OPTIONS.map((hour) => ({ label: hour, value: hour, default: hour === DEFAULT_HOUR })));

  const minuteSelect = new StringSelectMenuBuilder()
    .setCustomId('event_minute')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(MINUTE_OPTIONS.map((minute) => ({ label: minute, value: minute, default: minute === DEFAULT_MINUTE })));

  modal.addLabelComponents(
    new LabelBuilder().setLabel('日期').setStringSelectMenuComponent(dateSelect),
    new LabelBuilder().setLabel('時').setStringSelectMenuComponent(hourSelect),
    new LabelBuilder().setLabel('分').setStringSelectMenuComponent(minuteSelect),
  );

  return modal;
}

function buildSessionButtonRow(title) {
  const buttons = SESSION_OPTIONS.map((session) =>
    new ButtonBuilder()
      .setCustomId(`session-choice:${title}:${session}`)
      .setLabel(`${session}場`)
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
  buildDateOptions,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
};
