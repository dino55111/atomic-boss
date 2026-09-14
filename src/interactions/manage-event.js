const {
  ModalBuilder,
  LabelBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getEventById, getSignups, updateEventStartTime, markEventCleaned, markEventReminded } = require('../db/db');
const { updateEventAnnouncement } = require('../embeds/event-embed');
const { isValidStartTime } = require('./create-event-modal');
const { buildDateOptions, HOUR_OPTIONS, MINUTE_OPTIONS } = require('./title-choice-button');
const { tryAcknowledgeAndDeleteReply } = require('./ack');
const { buildMentionSegment } = require('../reminders');
const { deleteIfPresent } = require('../cleanup');
const { isAlreadyGoneError } = require('../discord-errors');

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

async function handleEditTimeButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: NOT_FOUND_MESSAGE, ephemeral: true });
    return;
  }

  if (!(await requireCreator(interaction, event))) return;

  await interaction.showModal(buildEditTimeModal(event.id, event.start_time));
}

async function notifyThreadOfNewTime(client, event, startTime, signups) {
  if (!event.thread_id) return;

  try {
    const thread = await client.channels.fetch(event.thread_id);
    await thread.setName(`${startTime} ${event.title} ${event.session}場`.slice(0, 100));

    const mentions = signups.map(buildMentionSegment).join(' ');
    const mentionableUserIds = signups.filter((s) => !s.is_external).map((s) => s.user_id);
    await thread.send({
      content: `⏰ 開團時間已改為 ${startTime}，已報名的人請留意：${mentions || '（目前尚無人報名）'}`,
      allowedMentions: { users: mentionableUserIds },
    });
  } catch (error) {
    if (!isAlreadyGoneError(error)) throw error;
  }
}

async function handleEditTimeModal(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const date = interaction.fields.getStringSelectValues('event_date')[0];
  const hour = interaction.fields.getStringSelectValues('event_hour')[0];
  const minute = interaction.fields.getStringSelectValues('event_minute')[0];
  const startTime = `${date} ${hour}:${minute}`;

  // Multiple slow steps follow (DB write, two message edits, thread rename,
  // thread notification) — ack immediately so none of that races Discord's
  // 3-second interaction window, same reasoning as handleCreateEventModal.
  const acked = await tryAcknowledgeAndDeleteReply(interaction);

  if (!isValidStartTime(startTime)) {
    if (acked) {
      await interaction.followUp({ content: '時間格式錯誤，請重新點選「⏰ 改時間」設定', ephemeral: true });
    }
    return;
  }

  const event = getEventById(db, eventId);
  if (!event) {
    if (acked) {
      await interaction.followUp({ content: NOT_FOUND_MESSAGE, ephemeral: true });
    }
    return;
  }

  updateEventStartTime(db, event.id, startTime);
  const updatedEvent = getEventById(db, event.id);
  const signups = getSignups(db, event.id);

  await updateEventAnnouncement(interaction.client, updatedEvent, signups);
  await notifyThreadOfNewTime(interaction.client, event, startTime, signups);

  if (acked) {
    await interaction.followUp({ content: '已更新時間', ephemeral: true });
  }
}

function buildCancelConfirmRow(eventId) {
  const confirmButton = new ButtonBuilder()
    .setCustomId(`cancel-event-confirm:${eventId}`)
    .setLabel('確定取消')
    .setStyle(ButtonStyle.Danger);

  const abortButton = new ButtonBuilder()
    .setCustomId('cancel-event-abort')
    .setLabel('算了')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(confirmButton, abortButton);
}

async function handleCancelEventButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: NOT_FOUND_MESSAGE, ephemeral: true });
    return;
  }

  if (!(await requireCreator(interaction, event))) return;

  await interaction.reply({
    content: '確定要取消整個揪團嗎？此動作無法復原',
    components: [buildCancelConfirmRow(event.id)],
    ephemeral: true,
  });
}

async function handleCancelEventAbortButton(interaction) {
  await interaction.update({ content: '已取消操作', components: [] });
}

async function notifyThreadOfCancellation(client, event, signups) {
  if (!event.thread_id) return;

  try {
    const thread = await client.channels.fetch(event.thread_id);
    const mentions = signups.map(buildMentionSegment).join(' ');
    const mentionableUserIds = signups.filter((s) => !s.is_external).map((s) => s.user_id);
    await thread.send({
      content: `本次揪團已由團主取消${mentions ? `，已報名的人請留意：${mentions}` : ''}`,
      allowedMentions: { users: mentionableUserIds },
    });
  } catch (error) {
    if (!isAlreadyGoneError(error)) throw error;
  }
}

async function handleCancelEventConfirmButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);

  // interaction.update is itself the ack for this button click; everything
  // below (notify, delete, DB writes) happens after and doesn't need this
  // interaction's token again.
  await interaction.update({ content: '正在取消揪團…', components: [] });

  const event = getEventById(db, eventId);
  if (!event) return;

  const signups = getSignups(db, event.id);
  await notifyThreadOfCancellation(interaction.client, event, signups);

  await deleteIfPresent(async () => {
    const channel = await interaction.client.channels.fetch(event.channel_id);
    const message = await channel.messages.fetch(event.message_id);
    await message.delete();
  });

  if (event.thread_id) {
    await deleteIfPresent(async () => {
      const thread = await interaction.client.channels.fetch(event.thread_id);
      await thread.delete();
    });
  }

  const cancelledAt = new Date().toISOString();
  markEventCleaned(db, event.id, cancelledAt);
  if (!event.reminded_at) {
    markEventReminded(db, event.id, cancelledAt);
  }
}

module.exports = {
  NOT_FOUND_MESSAGE,
  requireCreator,
  buildEditTimeModal,
  handleEditTimeButton,
  handleEditTimeModal,
  buildCancelConfirmRow,
  handleCancelEventButton,
  handleCancelEventConfirmButton,
  handleCancelEventAbortButton,
};
