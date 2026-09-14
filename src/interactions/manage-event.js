const {
  ModalBuilder,
  LabelBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { buildDateOptions, HOUR_OPTIONS, MINUTE_OPTIONS } = require('./title-choice-button');

const NOT_FOUND_MESSAGE = '找不到這個揪團，可能已經被刪除了';

async function requireCreator(interaction, event) {
  if (interaction.user.id !== event.creator_id) {
    await interaction.reply({ content: '只有團主能操作', ephemeral: true });
    return false;
  }
  return true;
}

function parseStartTime(startTime) {
  const [date, time] = startTime.split(' ');
  const [hour, minute] = time.split(':');
  return { date, hour, minute };
}

function buildEditTimeModal(eventId, currentStartTime, now = new Date()) {
  const { date: currentDate, hour: currentHour, minute: currentMinute } = parseStartTime(currentStartTime);

  const modal = new ModalBuilder()
    .setCustomId(`edit-time-modal:${eventId}`)
    .setTitle('修改揪團時間');

  const dateOptions = buildDateOptions(now).map((option) => ({ ...option, default: option.value === currentDate }));
  // buildDateOptions only offers the next 7 days, so an event whose current
  // date has already rolled out of that window (or is stale data) has no
  // matching option — fall back to marking today as default, same as the
  // create flow always does.
  if (!dateOptions.some((option) => option.default)) {
    dateOptions[0] = { ...dateOptions[0], default: true };
  }

  const dateSelect = new StringSelectMenuBuilder()
    .setCustomId('event_date')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(dateOptions);

  const hourSelect = new StringSelectMenuBuilder()
    .setCustomId('event_hour')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(HOUR_OPTIONS.map((hour) => ({ label: hour, value: hour, default: hour === currentHour })));

  const minuteSelect = new StringSelectMenuBuilder()
    .setCustomId('event_minute')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(MINUTE_OPTIONS.map((minute) => ({ label: minute, value: minute, default: minute === currentMinute })));

  modal.addLabelComponents(
    new LabelBuilder().setLabel('日期').setStringSelectMenuComponent(dateSelect),
    new LabelBuilder().setLabel('時').setStringSelectMenuComponent(hourSelect),
    new LabelBuilder().setLabel('分').setStringSelectMenuComponent(minuteSelect),
  );

  return modal;
}

module.exports = {
  NOT_FOUND_MESSAGE,
  requireCreator,
  buildEditTimeModal,
};
