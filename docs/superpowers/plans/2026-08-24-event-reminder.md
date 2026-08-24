# 活動開始前提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically post a reminder in an event's Discord thread 60 minutes before it starts, tagging everyone currently signed up.

**Architecture:** A new `src/reminders.js` module owns the pure date-resolution logic and the reminder-sending logic. `src/index.js` drives it with a 1-minute `setInterval` started once the Discord client is ready. Two new DB helpers (`getEventsPendingReminder`, `markEventReminded`) plus a new nullable `events.reminded_at` column track which events still need a reminder.

**Tech Stack:** Node.js, discord.js v14, better-sqlite3, Jest. No new dependencies — reminders are driven by `setInterval`, not a cron library.

**Spec:** `docs/superpowers/specs/2026-08-24-event-reminder-design.md`

## Global Constraints

- Reminder lead time is a fixed 60 minutes before an event's resolved start time (no per-event configuration).
- Poll interval is 1 minute (`REMINDER_POLL_INTERVAL_MS = 60 * 1000`), started via `setInterval` in `Events.ClientReady` — no new npm dependency.
- `events.reminded_at` is `TEXT`, nullable, `NULL` means "not yet reminded". Migration must be idempotent and safe against the existing `data.db` (same pattern as `migrateSignupsTable`/`migrateEventsTable`).
- Year resolution for `start_time` (`M/D HH:mm`, no year): build a candidate date using the year of `events.created_at`; if that candidate is more than 1 day earlier than `created_at`, add 1 year. This lives in `resolveEventStartDateTime(event)`.
- A reminder fires exactly once when `now < startAt <= now + 60min` — this single condition naturally covers both the normal 60-minute-early case and a post-restart catch-up (as long as the event hasn't started yet).
- If an event is due but has 0 signups, skip it and do **not** set `reminded_at` — leave it eligible for a later poll in case someone signs up before the event starts. Once the event actually starts, the "hasn't started yet" check makes it permanently ineligible, so this cannot loop forever.
- Reminder message (exact template): `⏰ 距離「{title}（第{session}場）」開始還有 60 分鐘（{start_time}），已報名的人記得準時出席：{mentions}` — `mentions` renders each signup the same way the roster embed does (`<@user_id>` for real members, `**{display_name}**` for external friends), and the `thread.send` call must scope `allowedMentions.users` to exactly the real (non-external) signups' user IDs — same pattern already used in `join-modal.js`, `signup-button.js`, and `assist-signup.js`.
- Each event's send attempt is isolated in its own try/catch inside the poll loop — one event's failure (e.g. a deleted thread) must not stop the rest of that poll cycle from sending. The `setInterval` callback itself must also catch/log so a rejection can't kill the timer.

---

## File Structure

- `src/db/schema.sql` — add `reminded_at TEXT` to `events` for fresh databases.
- `src/db/db.js` — `migrateRemindersColumn` (idempotent migration for existing databases), `getEventsPendingReminder`, `markEventReminded`.
- `src/reminders.js` (new) — `resolveEventStartDateTime(event)` (pure date logic), `checkAndSendReminders(client, db, now)` (the poll body), `REMINDER_LEAD_MINUTES`, `REMINDER_POLL_INTERVAL_MS`.
- `src/index.js` — starts the `setInterval` once the client is ready.

---

### Task 1: DB layer — `reminded_at` column, migration, pending/mark helpers

**Files:**
- Modify: `src/db/schema.sql`
- Modify: `src/db/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Produces: `migrateRemindersColumn(db)`, `getEventsPendingReminder(db) -> eventRow[]` (rows where `reminded_at IS NULL`), `markEventReminded(db, eventId, remindedAt)` (writes an ISO string).

- [ ] **Step 1: Write the failing tests**

Add to `tests/db.test.js`. Update the destructured import from `../src/db/db` to add the three new names:

```js
const {
  initDb,
  migrateSignupsTable,
  migrateEventsTable,
  migrateRemindersColumn,
  createEvent,
  getEventById,
  getEventByMessageId,
  updateEventMessageId,
  updateEventThreadId,
  getEventsPendingReminder,
  markEventReminded,
  getSignups,
  countSignups,
  hasSignedUp,
  addSignup,
  removeSignup,
  getSignupById,
  getSignupByEventAndUser,
  removeSignupById,
  ADD_SIGNUP_OK,
  ADD_SIGNUP_FULL,
  ADD_SIGNUP_DUPLICATE,
  REMOVE_SIGNUP_OK,
  REMOVE_SIGNUP_NOT_FOUND,
} = require('../src/db/db');
```

Add these tests inside the existing `describe('db', ...)` block, at the end (after the last `migrateEventsTable`-related test, or simply at the end of the block before the closing `});`):

```js
  test('getEventsPendingReminder returns only events without a reminded_at', () => {
    const db = makeTestDb();
    const remindedEvent = makeTestEvent(db, { messageId: 'message-1' });
    const pendingEvent = makeTestEvent(db, { messageId: 'message-2' });
    markEventReminded(db, remindedEvent.id, '2026-07-12T19:00:00.000Z');

    const pending = getEventsPendingReminder(db);
    expect(pending.map((e) => e.id)).toEqual([pendingEvent.id]);
  });

  test('markEventReminded stores the reminded_at timestamp', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    markEventReminded(db, event.id, '2026-07-12T19:00:00.000Z');

    expect(getEventById(db, event.id).reminded_at).toBe('2026-07-12T19:00:00.000Z');
  });

  test('a freshly created event has a null reminded_at', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(event.reminded_at).toBeNull();
  });

  test('migrateRemindersColumn adds the reminded_at column to an older events table', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE events (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id      TEXT NOT NULL,
        channel_id    TEXT NOT NULL,
        message_id    TEXT NOT NULL,
        thread_id     TEXT,
        title         TEXT NOT NULL,
        capacity      INTEGER NOT NULL,
        session       INTEGER NOT NULL DEFAULT 1,
        start_time    TEXT NOT NULL,
        creator_id    TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );
    `);

    migrateRemindersColumn(db);

    const columns = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['reminded_at']));
  });

  test('migrateRemindersColumn is a no-op when the column already exists', () => {
    const db = makeTestDb();
    expect(() => migrateRemindersColumn(db)).not.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/db.test.js`
Expected: FAIL — `markEventReminded`, `getEventsPendingReminder`, `migrateRemindersColumn` are not exported / not functions.

- [ ] **Step 3: Update the schema for fresh databases**

In `src/db/schema.sql`, add `reminded_at TEXT` to the `events` table (nullable, no default):

```sql
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  message_id    TEXT NOT NULL,
  thread_id     TEXT,
  title         TEXT NOT NULL,
  capacity      INTEGER NOT NULL,
  session       INTEGER NOT NULL DEFAULT 1,
  start_time    TEXT NOT NULL,
  creator_id    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  reminded_at   TEXT
);
```

- [ ] **Step 4: Add the migration and the two new DB functions**

In `src/db/db.js`, add this function right after `migrateEventsTable`:

```js
function migrateRemindersColumn(db) {
  const columns = db.prepare('PRAGMA table_info(events)').all().map((col) => col.name);
  if (!columns.includes('reminded_at')) {
    db.exec('ALTER TABLE events ADD COLUMN reminded_at TEXT');
  }
}
```

Update `initDb` to call it:

```js
function initDb(dbPath) {
  const db = new Database(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrateSignupsTable(db);
  migrateEventsTable(db);
  migrateRemindersColumn(db);
  return db;
}
```

Add these two functions right after `updateEventThreadId`:

```js
function getEventsPendingReminder(db) {
  return db.prepare('SELECT * FROM events WHERE reminded_at IS NULL ORDER BY id ASC').all();
}

function markEventReminded(db, eventId, remindedAt) {
  db.prepare('UPDATE events SET reminded_at = ? WHERE id = ?').run(remindedAt, eventId);
}
```

Update `module.exports` to add the new names:

```js
module.exports = {
  initDb,
  migrateSignupsTable,
  migrateEventsTable,
  migrateRemindersColumn,
  createEvent,
  getEventById,
  getEventByMessageId,
  updateEventMessageId,
  updateEventThreadId,
  getEventsPendingReminder,
  markEventReminded,
  getSignups,
  countSignups,
  hasSignedUp,
  addSignup,
  removeSignup,
  getSignupById,
  getSignupByEventAndUser,
  removeSignupById,
  ADD_SIGNUP_OK,
  ADD_SIGNUP_FULL,
  ADD_SIGNUP_DUPLICATE,
  REMOVE_SIGNUP_OK,
  REMOVE_SIGNUP_NOT_FOUND,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/db.test.js`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.sql src/db/db.js tests/db.test.js
git commit -m "Add reminded_at column and pending-reminder DB helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `resolveEventStartDateTime` — resolving a real Date from `M/D HH:mm` + `created_at`

**Files:**
- Create: `src/reminders.js`
- Test: `tests/reminders.test.js` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks (pure function, only needs an object shaped `{ start_time, created_at }`).
- Produces: `resolveEventStartDateTime(event) -> Date` — exported from `src/reminders.js`. Task 3 depends on this exact name and signature.

- [ ] **Step 1: Write the failing tests**

Create `tests/reminders.test.js`:

```js
const { resolveEventStartDateTime } = require('../src/reminders');

describe('resolveEventStartDateTime', () => {
  test('resolves a same-year date to the year the event was created in', () => {
    const createdAt = new Date(2026, 6, 1, 0, 0); // 2026-07-01 (month is 0-indexed)
    const event = { start_time: '7/12 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(12);
    expect(result.getHours()).toBe(20);
    expect(result.getMinutes()).toBe(0);
  });

  test('rolls over to next year when the date is more than a day before the creation date', () => {
    const createdAt = new Date(2026, 11, 28, 0, 0); // 2026-12-28
    const event = { start_time: '1/5 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(5);
  });

  test('does not roll over when the date is only slightly before the creation time on the same day', () => {
    const createdAt = new Date(2026, 6, 12, 20, 5); // 2026-07-12 20:05, 5 minutes after the chosen start time
    const event = { start_time: '7/12 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(12);
    expect(result.getHours()).toBe(20);
    expect(result.getMinutes()).toBe(0);
  });

  test('does not roll over exactly at the 1-day boundary (only strictly more than 1 day triggers it)', () => {
    const createdAt = new Date(2026, 6, 13, 20, 0); // exactly 1 day after the chosen start time
    const event = { start_time: '7/12 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(12);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/reminders.test.js`
Expected: FAIL — `Cannot find module '../src/reminders'`.

- [ ] **Step 3: Create `src/reminders.js` with the date-resolution logic**

```js
const START_TIME_PATTERN = /^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// events.start_time is "M/D HH:mm" with no year (validated at creation time by
// isValidStartTime in create-event-modal.js, so this assumes it's well-formed).
// To compare it against "now" we resolve it to a real Date: build a candidate
// using the year the event was created in, then roll forward a year if that
// candidate would land more than a day before the event was even created —
// that only happens when the chosen date was clearly meant for next year
// (e.g. an event created in December for a January session).
function resolveEventStartDateTime(event) {
  const match = START_TIME_PATTERN.exec(event.start_time);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  const createdAt = new Date(event.created_at);
  const referenceYear = createdAt.getFullYear();

  const candidate = new Date(referenceYear, month - 1, day, hour, minute);
  if (candidate.getTime() < createdAt.getTime() - ONE_DAY_MS) {
    return new Date(referenceYear + 1, month - 1, day, hour, minute);
  }
  return candidate;
}

module.exports = { resolveEventStartDateTime };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/reminders.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reminders.js tests/reminders.test.js
git commit -m "Add resolveEventStartDateTime for reminder scheduling

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `checkAndSendReminders` — the poll body

**Files:**
- Modify: `src/reminders.js`
- Modify: `tests/reminders.test.js`

**Interfaces:**
- Consumes: `resolveEventStartDateTime(event)` (Task 2), `getEventsPendingReminder(db)`, `markEventReminded(db, eventId, remindedAt)`, `getSignups(db, eventId)` (from `../db/db`, Task 1 + pre-existing).
- Produces: `checkAndSendReminders(client, db, now = new Date()) -> Promise<void>`, `REMINDER_LEAD_MINUTES` (`60`), `REMINDER_POLL_INTERVAL_MS` (`60 * 1000`) — Task 4 depends on `checkAndSendReminders` and `REMINDER_POLL_INTERVAL_MS`.

- [ ] **Step 1: Write the failing tests**

Add to the top of `tests/reminders.test.js`, above the existing `describe('resolveEventStartDateTime', ...)` block:

```js
const { initDb, createEvent, updateEventThreadId, addSignup, getEventById, markEventReminded } = require('../src/db/db');
```

And change the first import line to also pull in the new exports:

```js
const { resolveEventStartDateTime, checkAndSendReminders, REMINDER_LEAD_MINUTES } = require('../src/reminders');
```

Add this `describe` block at the end of the file:

```js
describe('checkAndSendReminders', () => {
  function makeDueEvent(db, overrides = {}) {
    const createdAt = new Date(2026, 6, 1, 0, 0); // 2026-07-01, well before the 7/12 session
    const event = createEvent(db, {
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      title: '週三夜間團',
      capacity: 5,
      session: 1,
      startTime: '7/12 20:00',
      creatorId: 'creator-1',
      ...overrides,
    });
    db.prepare('UPDATE events SET created_at = ? WHERE id = ?').run(createdAt.toISOString(), event.id);
    updateEventThreadId(db, event.id, overrides.threadId ?? 'thread-1');
    return getEventById(db, event.id);
  }

  test('sends a reminder and marks reminded_at when within the 60-minute window and someone signed up', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    const now = new Date(2026, 6, 12, 19, 30); // 30 minutes before the 20:00 start
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(client.channels.fetch).toHaveBeenCalledWith('thread-1');
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('週三夜間團（第1場）'),
      allowedMentions: { users: ['user-1'] },
    }));
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining(`${REMINDER_LEAD_MINUTES} 分鐘`),
    }));
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('<@user-1>'),
    }));
    expect(getEventById(db, event.id).reminded_at).toBe(now.toISOString());
  });

  test('renders an external signup with a bold name instead of a mention', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, {
      userId: 'ext:1', displayName: '小明', className: '法師', level: '65', gameId: 'm#1', isExternal: true,
    });
    const now = new Date(2026, 6, 12, 19, 30);
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('**小明**'),
      allowedMentions: { users: [] },
    }));
  });

  test('does not send when more than 60 minutes remain before the start', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    const now = new Date(2026, 6, 12, 18, 0); // 2 hours before the 20:00 start
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).not.toHaveBeenCalled();
    expect(getEventById(db, event.id).reminded_at).toBeNull();
  });

  test('does not send again once reminded_at is already set', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    markEventReminded(db, event.id, '2026-07-12T19:00:00.000Z');
    const now = new Date(2026, 6, 12, 19, 30);
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).not.toHaveBeenCalled();
  });

  test('skips and does not mark reminded_at when there are no signups yet', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    const now = new Date(2026, 6, 12, 19, 30);
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).not.toHaveBeenCalled();
    expect(getEventById(db, event.id).reminded_at).toBeNull();
  });

  test('still sends (catch-up) when now is later than the ideal reminder time but the event has not started', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    const now = new Date(2026, 6, 12, 19, 59); // 1 minute before start — long past the ideal 60-minute mark
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).toHaveBeenCalledTimes(1);
    expect(getEventById(db, event.id).reminded_at).toBe(now.toISOString());
  });

  test('does not send once the event has already started', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    const now = new Date(2026, 6, 12, 20, 1); // 1 minute after the 20:00 start
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).not.toHaveBeenCalled();
    expect(getEventById(db, event.id).reminded_at).toBeNull();
  });

  test('isolates a failure sending one reminder from other due events in the same poll', async () => {
    const db = initDb(':memory:');
    const failingEvent = makeDueEvent(db, { messageId: 'message-1', threadId: 'thread-bad' });
    const okEvent = makeDueEvent(db, { messageId: 'message-2', threadId: 'thread-good' });
    addSignup(db, failingEvent, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    addSignup(db, okEvent, { userId: 'user-2', displayName: 'Bob', className: '法師', level: '65', gameId: 'b#1' });
    const now = new Date(2026, 6, 12, 19, 30);
    const okThread = { send: jest.fn(async () => {}) };
    const client = {
      channels: {
        fetch: jest.fn(async (threadId) => {
          if (threadId === 'thread-bad') throw new Error('Unknown Channel');
          return okThread;
        }),
      },
    };
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(checkAndSendReminders(client, db, now)).resolves.toBeUndefined();

    expect(okThread.send).toHaveBeenCalledTimes(1);
    expect(getEventById(db, okEvent.id).reminded_at).toBe(now.toISOString());
    expect(getEventById(db, failingEvent.id).reminded_at).toBeNull();
    consoleErrorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/reminders.test.js`
Expected: FAIL — `checkAndSendReminders` and `REMINDER_LEAD_MINUTES` are not exported.

- [ ] **Step 3: Implement `checkAndSendReminders`**

In `src/reminders.js`, add this `require` at the top of the file:

```js
const { getEventsPendingReminder, markEventReminded, getSignups } = require('./db/db');
```

Add these constants and the function, after `resolveEventStartDateTime`:

```js
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
        content: `⏰ 距離「${event.title}（第${event.session}場）」開始還有 ${REMINDER_LEAD_MINUTES} 分鐘（${event.start_time}），已報名的人記得準時出席：${mentions}`,
        allowedMentions: { users: mentionableUserIds },
      });

      markEventReminded(db, event.id, now.toISOString());
    } catch (error) {
      console.error(`Failed to send reminder for event ${event.id}:`, error);
    }
  }
}

module.exports = { resolveEventStartDateTime, checkAndSendReminders, REMINDER_LEAD_MINUTES, REMINDER_POLL_INTERVAL_MS };
```

(Replace the existing `module.exports = { resolveEventStartDateTime };` line from Task 2 with this one.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/reminders.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reminders.js tests/reminders.test.js
git commit -m "Add checkAndSendReminders: send and track event-start reminders

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the poll loop into the bot's entry point

**Files:**
- Modify: `src/index.js`

**Interfaces:**
- Consumes: `checkAndSendReminders(client, db, now)`, `REMINDER_POLL_INTERVAL_MS` (both from `./reminders`, Task 3).

- [ ] **Step 1: Update `src/index.js`**

Add the import near the other local requires:

```js
const { checkAndSendReminders, REMINDER_POLL_INTERVAL_MS } = require('./reminders');
```

Replace the `Events.ClientReady` handler:

```js
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  setInterval(() => {
    checkAndSendReminders(client, db).catch((error) => {
      console.error('Error checking event reminders:', error);
    });
  }, REMINDER_POLL_INTERVAL_MS);
});
```

- [ ] **Step 2: Run the full test suite**

Run: `npx jest`
Expected: PASS — every test file in `tests/` passes. (`src/index.js` itself has no dedicated test file — this matches existing project convention; it's pure wiring with no branching logic to unit test.)

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "Start the event-reminder poll loop once the bot is ready

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Post-implementation note

`data.db` in the repo root is the bot's live database. `migrateRemindersColumn` (Task 1) makes the next `npm start` safe against it automatically — no manual migration step is required. As with the previous `session` column, it's worth restarting the bot process once after deploying this change.
