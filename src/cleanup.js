const { getEventsPendingCleanup, markEventCleaned } = require('./db/db');
const { resolveEventStartDateTime } = require('./reminders');
const { isAlreadyGoneError } = require('./discord-errors');

// "結束" has no explicit tracking of its own — an event is considered over
// CLEANUP_DELAY_MS after its start_time, same as the reminder's lead time is
// measured from start_time.
const CLEANUP_DELAY_MS = 2 * 60 * 60 * 1000;
const CLEANUP_POLL_INTERVAL_MS = 60 * 1000;

async function deleteIfPresent(fetchAndDelete) {
  try {
    await fetchAndDelete();
  } catch (error) {
    // A resource that's already gone (deleted by hand, or a previous poll
    // got partway through before failing) means the cleanup's goal is
    // already met, so this is treated as success rather than retried forever.
    if (!isAlreadyGoneError(error)) {
      throw error;
    }
  }
}

async function checkAndCleanupEvents(client, db, now = new Date()) {
  const pendingEvents = getEventsPendingCleanup(db);

  for (const event of pendingEvents) {
    try {
      const startAt = resolveEventStartDateTime(event);
      const msSinceStart = now.getTime() - startAt.getTime();

      if (msSinceStart < CLEANUP_DELAY_MS) {
        continue;
      }

      await deleteIfPresent(async () => {
        const channel = await client.channels.fetch(event.channel_id);
        const message = await channel.messages.fetch(event.message_id);
        await message.delete();
      });

      if (event.thread_id) {
        await deleteIfPresent(async () => {
          const thread = await client.channels.fetch(event.thread_id);
          await thread.delete();
        });
      }

      markEventCleaned(db, event.id, now.toISOString());
    } catch (error) {
      console.error(`Failed to clean up event ${event.id}:`, error);
    }
  }
}

module.exports = { checkAndCleanupEvents, deleteIfPresent, CLEANUP_DELAY_MS, CLEANUP_POLL_INTERVAL_MS };
