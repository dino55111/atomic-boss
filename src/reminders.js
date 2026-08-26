const { getEventsPendingReminder, markEventReminded, getSignups } = require('./db/db');

const START_TIME_PATTERN = /^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/;
const ROLLOVER_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000;

// events.start_time is "M/D HH:mm" with no year (validated at creation time by
// isValidStartTime in create-event-modal.js, so this assumes it's well-formed).
// To compare it against "now" we resolve it to a real Date: build a candidate
// using the year the event was created in, then roll forward a year if that
// candidate would land more than ~180 days before the event was even created.
// That large a gap only happens when the chosen date was clearly meant for
// next year (e.g. an event created in December for a January session, ~11
// months later). A same-month typo or a start_time that's simply a few days
// or weeks in the past (e.g. a test event, a mistyped date) stays well under
// this threshold, so it is left in the past rather than rolled forward —
// checkAndSendReminders' own msUntilStart <= 0 check then skips it forever.
function resolveEventStartDateTime(event) {
  const match = START_TIME_PATTERN.exec(event.start_time);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  const createdAt = new Date(event.created_at);
  const referenceYear = createdAt.getFullYear();

  const candidate = new Date(referenceYear, month - 1, day, hour, minute);
  if (candidate.getTime() < createdAt.getTime() - ROLLOVER_THRESHOLD_MS) {
    return new Date(referenceYear + 1, month - 1, day, hour, minute);
  }
  return candidate;
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
        content: `⏰ 距離「${event.title}（${event.session}場）」開始還有 ${REMINDER_LEAD_MINUTES} 分鐘（${event.start_time}），已報名的人記得準時出席：${mentions}`,
        allowedMentions: { users: mentionableUserIds },
      });

      markEventReminded(db, event.id, now.toISOString());
    } catch (error) {
      console.error(`Failed to send reminder for event ${event.id}:`, error);
    }
  }
}

module.exports = { resolveEventStartDateTime, checkAndSendReminders, REMINDER_LEAD_MINUTES, REMINDER_POLL_INTERVAL_MS };
