const Database = require('better-sqlite3');
const {
  initDb,
  migrateSignupsTable,
  migrateEventsTable,
  migrateRemindersColumn,
  migrateCleanupColumn,
  createEvent,
  getEventById,
  getEventByMessageId,
  updateEventMessageId,
  updateEventThreadId,
  getEventsPendingReminder,
  markEventReminded,
  getEventsPendingCleanup,
  markEventCleaned,
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

function makeTestDb() {
  return initDb(':memory:');
}

function makeTestEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '揪團測試',
    capacity: 2,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}

describe('db', () => {
  test('createEvent then getEventById returns the same event', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(getEventById(db, event.id)).toMatchObject({ title: '揪團測試', capacity: 2 });
  });

  test('getEventByMessageId finds event by message id', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(getEventByMessageId(db, 'message-1').id).toBe(event.id);
  });

  test('updateEventMessageId updates the stored message id', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    updateEventMessageId(db, event.id, 'message-2');
    expect(getEventById(db, event.id).message_id).toBe('message-2');
  });

  test('updateEventThreadId updates the stored thread id', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(getEventById(db, event.id).thread_id).toBeNull();
    updateEventThreadId(db, event.id, 'thread-1');
    expect(getEventById(db, event.id).thread_id).toBe('thread-1');
  });

  test('addSignup adds a signup and countSignups reflects it', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    const result = addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1', note: '本尊的小號' });
    expect(result).toBe(ADD_SIGNUP_OK);
    expect(countSignups(db, event.id)).toBe(1);
    expect(hasSignedUp(db, event.id, 'user-1')).toBe(true);

    const [signup] = getSignups(db, event.id);
    expect(signup.note).toBe('本尊的小號');
  });

  test('addSignup defaults note to an empty string when omitted', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });

    const [signup] = getSignups(db, event.id);
    expect(signup.note).toBe('');
  });

  test('addSignup returns DUPLICATE when the same user signs up twice', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    const result = addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    expect(result).toBe(ADD_SIGNUP_DUPLICATE);
    expect(countSignups(db, event.id)).toBe(1);
  });

  test('addSignup returns FULL when capacity is reached', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db, { capacity: 1 });
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    const result = addSignup(db, event, { userId: 'user-2', displayName: 'Bob', className: '法師', level: '65', gameId: 'bob#1' });
    expect(result).toBe(ADD_SIGNUP_FULL);
    expect(countSignups(db, event.id)).toBe(1);
  });

  test('removeSignup removes an existing signup', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    const result = removeSignup(db, event.id, 'user-1');
    expect(result).toBe(REMOVE_SIGNUP_OK);
    expect(countSignups(db, event.id)).toBe(0);
  });

  test('removeSignup returns NOT_FOUND when the user never signed up', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    const result = removeSignup(db, event.id, 'user-1');
    expect(result).toBe(REMOVE_SIGNUP_NOT_FOUND);
  });

  test('getSignups returns signups ordered by signup time', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db, { capacity: 5 });
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    addSignup(db, event, { userId: 'user-2', displayName: 'Bob', className: '法師', level: '65', gameId: 'bob#1' });
    const signups = getSignups(db, event.id);
    expect(signups.map((s) => s.user_id)).toEqual(['user-1', 'user-2']);
  });

  test('addSignup records added_by_user_id and is_external for an assisted signup', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, {
      userId: 'ext:abc-123',
      displayName: '小明',
      className: '戰士',
      level: '70',
      gameId: 'ming#1',
      addedByUserId: 'helper-1',
      isExternal: true,
    });

    const [signup] = getSignups(db, event.id);
    expect(signup.added_by_user_id).toBe('helper-1');
    expect(signup.is_external).toBe(1);
  });

  test('addSignup defaults added_by_user_id to null and is_external to 0 for a self-signup', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });

    const [signup] = getSignups(db, event.id);
    expect(signup.added_by_user_id).toBeNull();
    expect(signup.is_external).toBe(0);
  });

  test('getSignupById returns the matching signup', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    const [signup] = getSignups(db, event.id);

    expect(getSignupById(db, signup.id)).toMatchObject({ id: signup.id, user_id: 'user-1' });
  });

  test('getSignupById returns undefined when the signup does not exist', () => {
    const db = makeTestDb();
    expect(getSignupById(db, 999)).toBeUndefined();
  });

  test('removeSignupById removes the matching signup', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    const [signup] = getSignups(db, event.id);

    const result = removeSignupById(db, signup.id);
    expect(result).toBe(REMOVE_SIGNUP_OK);
    expect(countSignups(db, event.id)).toBe(0);
  });

  test('removeSignupById returns NOT_FOUND when the signup does not exist', () => {
    const db = makeTestDb();
    expect(removeSignupById(db, 999)).toBe(REMOVE_SIGNUP_NOT_FOUND);
  });

  test('migrateSignupsTable adds the assist columns to an older signups table', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE events (id INTEGER PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT NOT NULL, thread_id TEXT, title TEXT NOT NULL, capacity INTEGER NOT NULL, start_time TEXT NOT NULL, creator_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE signups (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id      INTEGER NOT NULL REFERENCES events(id),
        user_id       TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        class         TEXT NOT NULL,
        level         TEXT NOT NULL,
        game_id       TEXT NOT NULL,
        note          TEXT NOT NULL DEFAULT '',
        signed_at     TEXT NOT NULL,
        UNIQUE(event_id, user_id)
      );
    `);

    migrateSignupsTable(db);

    const columns = db.prepare('PRAGMA table_info(signups)').all().map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['added_by_user_id', 'is_external']));
  });

  test('migrateSignupsTable is a no-op when the columns already exist', () => {
    const db = makeTestDb();
    expect(() => migrateSignupsTable(db)).not.toThrow();
  });

  test('getSignupByEventAndUser returns the matching signup', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, {
      userId: 'user-9',
      displayName: 'IceGuy',
      className: '冰雷',
      level: '70',
      gameId: 'ice#1',
      addedByUserId: 'helper-1',
    });

    const signup = getSignupByEventAndUser(db, event.id, 'user-9');
    expect(signup).toMatchObject({ user_id: 'user-9', added_by_user_id: 'helper-1' });
  });

  test('getSignupByEventAndUser returns undefined when there is no signup for that user', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(getSignupByEventAndUser(db, event.id, 'user-9')).toBeUndefined();
  });

  test('createEvent stores the chosen session number', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db, { session: 3 });
    expect(event.session).toBe(3);
  });

  test('createEvent defaults session to 1 when omitted', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(event.session).toBe(1);
  });

  test('migrateEventsTable adds the session column to an older events table', () => {
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
        start_time    TEXT NOT NULL,
        creator_id    TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );
    `);

    migrateEventsTable(db);

    const columns = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['session']));
  });

  test('migrateEventsTable is a no-op when the column already exists', () => {
    const db = makeTestDb();
    expect(() => migrateEventsTable(db)).not.toThrow();
  });

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

  test('getEventsPendingCleanup returns only events without a cleaned_at', () => {
    const db = makeTestDb();
    const cleanedEvent = makeTestEvent(db, { messageId: 'message-1' });
    const pendingEvent = makeTestEvent(db, { messageId: 'message-2' });
    markEventCleaned(db, cleanedEvent.id, '2026-07-12T22:00:00.000Z');

    const pending = getEventsPendingCleanup(db);
    expect(pending.map((e) => e.id)).toEqual([pendingEvent.id]);
  });

  test('markEventCleaned stores the cleaned_at timestamp', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    markEventCleaned(db, event.id, '2026-07-12T22:00:00.000Z');

    expect(getEventById(db, event.id).cleaned_at).toBe('2026-07-12T22:00:00.000Z');
  });

  test('a freshly created event has a null cleaned_at', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(event.cleaned_at).toBeNull();
  });

  test('migrateCleanupColumn adds the cleaned_at column to an older events table', () => {
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
        created_at    TEXT NOT NULL,
        reminded_at   TEXT
      );
    `);

    migrateCleanupColumn(db);

    const columns = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['cleaned_at']));
  });

  test('migrateCleanupColumn is a no-op when the column already exists', () => {
    const db = makeTestDb();
    expect(() => migrateCleanupColumn(db)).not.toThrow();
  });
});
