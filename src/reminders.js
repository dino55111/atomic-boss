const { getEventsPendingReminder, markEventReminded, getSignups } = require('./db/db');
const { resolveStartDateTime } = require('./start-time');

// events.start_time is "M/D HH:mm" with no year (validated at creation time by
// isValidStartTime in create-event-modal.js, so this assumes it's well-formed).
// Resolved to a real Date against the event's creation time — see
// resolveStartDateTime's own comment for the year-rollover reasoning.
// checkAndSendReminders' own msUntilStart <= 0 check skips anything that
// still resolves to the past.
function resolveEventStartDateTime(event) {
  return resolveStartDateTime(event.start_time, new Date(event.created_at));
}

const REMINDER_LEAD_MINUTES = 60;
const REMINDER_POLL_INTERVAL_MS = 60 * 1000;

function buildMentionSegment(signup) {
  return signup.is_external ? `**${signup.display_name}**` : `<@${signup.user_id}>`;
}

async function checkAndSendReminders(client, db, now = new Date()) {
  const leadMs = REMINDER_LEAD_MINUTES * 60 * 1000;
  const pendingEvents = getEventsPendingReminder(db);

  for (const event of pendingEvents) {
    try {
      const startAt = resolveEventStartDateTime(event);
      const msUntilStart = startAt.getTime() - now.getTime();

      if (msUntilStart <= 0 || msUntilStart > leadMs) {
        continue;
      }

      const signups = getSignups(db, event.id);
      if (signups.length === 0) {
        continue;
      }

      const mentions = signups.map(buildMentionSegment).join(' ');
      const mentionableUserIds = signups.filter((s) => !s.is_external).map((s) => s.user_id);

      const thread = await client.channels.fetch(event.thread_id);
      await thread.send({
        content: `⏰「${event.start_time} ${event.title} ${event.session}場」開始還有 1 小時，隊長請給集合頻道，已報名的人記得準時出席：${mentions}`,
        allowedMentions: { users: mentionableUserIds },
      });

      markEventReminded(db, event.id, now.toISOString());
    } catch (error) {
      console.error(`Failed to send reminder for event ${event.id}:`, error);
    }
  }
}

module.exports = {
  resolveEventStartDateTime,
  checkAndSendReminders,
  buildMentionSegment,
  REMINDER_LEAD_MINUTES,
  REMINDER_POLL_INTERVAL_MS,
};
