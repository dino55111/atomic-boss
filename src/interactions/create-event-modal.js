const { createEvent, getEventById, getSignups, updateEventMessageId, updateEventThreadId, updateEventThreadMessageId } = require('../db/db');
const { buildEventEmbed, buildActionRow, buildManagementRow } = require('../embeds/event-embed');
const { TITLE_CAPACITIES } = require('../commands/create-event');
const { tryAcknowledgeAndDeleteReply } = require('./ack');
const { buildPostCreateAssistPromptRow } = require('./assist-signup');
const { START_TIME_PATTERN, resolveStartDateTime, formatStartTimeWithWeekday } = require('../start-time');

const NOT_FOUND_MESSAGE = '找不到這個揪團，可能已經被刪除了';

function isValidStartTime(rawStartTime) {
  const match = START_TIME_PATTERN.exec(rawStartTime);
  if (!match) {
    return false;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  return month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isFutureStartTime(rawStartTime, now = new Date()) {
  const candidate = resolveStartDateTime(rawStartTime, now);
  return candidate !== null && candidate.getTime() > now.getTime();
}

// Posts the event to its channel (with whatever's already in its roster —
// the creator may have pre-filled members before this ever runs), creates
// its thread, and records the resulting ids. Takes a channel rather than a
// client so it can be driven from either handleCreateEventModal's ack-failed
// fallback (interaction.channel doesn't depend on the interaction's token)
// or the postcreate "發布" button, without either depending on the other.
async function publishEvent(channel, db, event, now = new Date()) {
  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);
  const managementRow = buildManagementRow(event.id);

  const message = await channel.send({ embeds: [embed], components: [row, managementRow] });
  updateEventMessageId(db, event.id, message.id);

  const thread = await message.startThread({
    name: `${formatStartTimeWithWeekday(event.start_time, now)} ${event.title} ${event.session}場`.slice(0, 100),
  });
  updateEventThreadId(db, event.id, thread.id);

  // Anyone pre-filled before this event was published (see assist-signup.js's
  // postcreate flow) never had a thread to be @mentioned into yet — unlike
  // every post-publish signup, which joins the thread as a side effect of
  // being mentioned in a thread message. Add them explicitly now that the
  // thread exists. External signups have no real Discord user to add.
  await Promise.all(
    signups.filter((signup) => !signup.is_external).map((signup) => thread.members.add(signup.user_id).catch(() => {})),
  );

  // Discord doesn't reliably let you click the buttons on a thread's starter
  // message from within the thread itself (they work fine from the main
  // channel) — see updateEventAnnouncement. Posting an independent copy of
  // just the buttons (no embed — the main channel copy already shows it)
  // straight into the thread gives it working buttons too.
  const threadMessage = await thread.send({ components: [row, managementRow] });
  updateEventThreadMessageId(db, event.id, threadMessage.id);
}

async function handleCreateEventModal(interaction, db, now = new Date()) {
  const [, title, sessionRaw] = interaction.customId.split(':');
  const session = Number.parseInt(sessionRaw, 10);
  const date = interaction.fields.getStringSelectValues('event_date')[0];
  const hour = interaction.fields.getStringSelectValues('event_hour')[0];
  const minute = interaction.fields.getStringSelectValues('event_minute')[0];
  const startTime = `${date} ${hour}:${minute}`;
  const capacity = TITLE_CAPACITIES[title];

  // If the ack fails (stale interaction), we can no longer message the user
  // via this interaction, but the event itself must still be created — that
  // doesn't depend on this interaction's token. Without a live interaction
  // to prompt the creator, it's published immediately instead of waiting for
  // them to finish pre-filling (interaction.channel.send() doesn't depend on
  // the interaction's token either, for the same reason).
  const acked = await tryAcknowledgeAndDeleteReply(interaction);

  if (!isValidStartTime(startTime)) {
    if (acked) {
      await interaction.followUp({
        content: '時間格式錯誤，請用「月/日 時:分」的格式重新使用 /boss 建立，例如 7/12 20:00',
        ephemeral: true,
      });
    }
    return;
  }

  if (!isFutureStartTime(startTime, now)) {
    if (acked) {
      await interaction.followUp({
        content: '所選時間已經過去，請選擇現在之後的時間重新使用 /boss 建立',
        ephemeral: true,
      });
    }
    return;
  }

  const event = createEvent(db, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: 'pending',
    title,
    capacity,
    session,
    startTime,
    creatorId: interaction.user.id,
  });

  if (!acked) {
    await publishEvent(interaction.channel, db, event, now);
    return;
  }

  await interaction.followUp({
    content: '揪團資料已建立，要先預先報名再發布嗎？',
    components: [buildPostCreateAssistPromptRow(event.id)],
    ephemeral: true,
  });
}

async function handlePostCreatePublishButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.update({ content: NOT_FOUND_MESSAGE, components: [] });
    return;
  }

  // A leftover button from an earlier step in this same flow (e.g. the
  // "預先報名" prompt a couple of steps back) can still be visible and
  // clickable after the creator already published via a later one.
  if (event.thread_id) {
    await interaction.update({ content: '已經發布過了', components: [] });
    return;
  }

  // The pre-fill flow keeps reusing one ephemeral message end-to-end (see
  // assist-signup.js's handleAssistButton/handleAssistJoinModal) rather than
  // replacing it each step, so there's only ever this one message to drop —
  // same deferUpdate()+deleteReply() pattern ack.js uses for a modal's
  // origin message.
  await interaction.deferUpdate();
  await interaction.deleteReply();
  await publishEvent(interaction.channel, db, event);
}

module.exports = {
  handleCreateEventModal,
  isValidStartTime,
  isFutureStartTime,
  publishEvent,
  handlePostCreatePublishButton,
};
