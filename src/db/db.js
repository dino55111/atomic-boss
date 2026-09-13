const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function migrateSignupsTable(db) {
  const columns = db.prepare('PRAGMA table_info(signups)').all().map((col) => col.name);
  if (!columns.includes('added_by_user_id')) {
    db.exec('ALTER TABLE signups ADD COLUMN added_by_user_id TEXT');
  }
  if (!columns.includes('is_external')) {
    db.exec('ALTER TABLE signups ADD COLUMN is_external INTEGER NOT NULL DEFAULT 0');
  }
}

function migrateEventsTable(db) {
  const columns = db.prepare('PRAGMA table_info(events)').all().map((col) => col.name);
  if (!columns.includes('session')) {
    db.exec('ALTER TABLE events ADD COLUMN session INTEGER NOT NULL DEFAULT 1');
  }
}

function migrateRemindersColumn(db) {
  const columns = db.prepare('PRAGMA table_info(events)').all().map((col) => col.name);
  if (!columns.includes('reminded_at')) {
    db.exec('ALTER TABLE events ADD COLUMN reminded_at TEXT');
  }
}

function migrateCleanupColumn(db) {
  const columns = db.prepare('PRAGMA table_info(events)').all().map((col) => col.name);
  if (!columns.includes('cleaned_at')) {
    db.exec('ALTER TABLE events ADD COLUMN cleaned_at TEXT');
  }
}

function migrateThreadMessageIdColumn(db) {
  const columns = db.prepare('PRAGMA table_info(events)').all().map((col) => col.name);
  if (!columns.includes('thread_message_id')) {
    db.exec('ALTER TABLE events ADD COLUMN thread_message_id TEXT');
  }
}

function initDb(dbPath) {
  const db = new Database(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrateSignupsTable(db);
  migrateEventsTable(db);
  migrateRemindersColumn(db);
  migrateCleanupColumn(db);
  migrateThreadMessageIdColumn(db);
  return db;
}

function createEvent(db, { guildId, channelId, messageId, title, capacity, session = 1, startTime, creatorId }) {
  const createdAt = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO events (guild_id, channel_id, message_id, title, capacity, session, start_time, creator_id, created_at)
    VALUES (@guildId, @channelId, @messageId, @title, @capacity, @session, @startTime, @creatorId, @createdAt)
  `).run({ guildId, channelId, messageId, title, capacity, session, startTime, creatorId, createdAt });
  return getEventById(db, info.lastInsertRowid);
}

function getEventById(db, id) {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
}

function getEventByMessageId(db, messageId) {
  return db.prepare('SELECT * FROM events WHERE message_id = ?').get(messageId);
}

function updateEventMessageId(db, eventId, messageId) {
  db.prepare('UPDATE events SET message_id = ? WHERE id = ?').run(messageId, eventId);
}

function updateEventThreadId(db, eventId, threadId) {
  db.prepare('UPDATE events SET thread_id = ? WHERE id = ?').run(threadId, eventId);
}

function updateEventThreadMessageId(db, eventId, threadMessageId) {
  db.prepare('UPDATE events SET thread_message_id = ? WHERE id = ?').run(threadMessageId, eventId);
}

function getActiveEventsByGuild(db, guildId) {
  return db.prepare('SELECT * FROM events WHERE guild_id = ? AND cleaned_at IS NULL ORDER BY id ASC').all(guildId);
}

function getEventsPendingReminder(db) {
  return db.prepare('SELECT * FROM events WHERE reminded_at IS NULL ORDER BY id ASC').all();
}

function markEventReminded(db, eventId, remindedAt) {
  db.prepare('UPDATE events SET reminded_at = ? WHERE id = ?').run(remindedAt, eventId);
}

function getEventsPendingCleanup(db) {
  return db.prepare('SELECT * FROM events WHERE cleaned_at IS NULL ORDER BY id ASC').all();
}

function markEventCleaned(db, eventId, cleanedAt) {
  db.prepare('UPDATE events SET cleaned_at = ? WHERE id = ?').run(cleanedAt, eventId);
}

function getSignups(db, eventId) {
  return db.prepare('SELECT * FROM signups WHERE event_id = ? ORDER BY signed_at ASC, id ASC').all(eventId);
}

function countSignups(db, eventId) {
  return db.prepare('SELECT COUNT(*) AS count FROM signups WHERE event_id = ?').get(eventId).count;
}

function hasSignedUp(db, eventId, userId) {
  return !!db.prepare('SELECT 1 FROM signups WHERE event_id = ? AND user_id = ?').get(eventId, userId);
}

const ADD_SIGNUP_OK = 'OK';
const ADD_SIGNUP_FULL = 'FULL';
const ADD_SIGNUP_DUPLICATE = 'DUPLICATE';

function addSignup(db, event, {
  userId,
  displayName,
  className,
  level,
  gameId,
  note = '',
  addedByUserId = null,
  isExternal = false,
}) {
  const transaction = db.transaction(() => {
    if (hasSignedUp(db, event.id, userId)) {
      return ADD_SIGNUP_DUPLICATE;
    }
    if (countSignups(db, event.id) >= event.capacity) {
      return ADD_SIGNUP_FULL;
    }
    db.prepare(`
      INSERT INTO signups (event_id, user_id, display_name, class, level, game_id, note, added_by_user_id, is_external, signed_at)
      VALUES (@eventId, @userId, @displayName, @className, @level, @gameId, @note, @addedByUserId, @isExternal, @signedAt)
    `).run({
      eventId: event.id,
      userId,
      displayName,
      className,
      level,
      gameId,
      note,
      addedByUserId,
      isExternal: isExternal ? 1 : 0,
      signedAt: new Date().toISOString(),
    });
    return ADD_SIGNUP_OK;
  });
  return transaction();
}

const REMOVE_SIGNUP_OK = 'OK';
const REMOVE_SIGNUP_NOT_FOUND = 'NOT_FOUND';

function removeSignup(db, eventId, userId) {
  const info = db.prepare('DELETE FROM signups WHERE event_id = ? AND user_id = ?').run(eventId, userId);
  return info.changes > 0 ? REMOVE_SIGNUP_OK : REMOVE_SIGNUP_NOT_FOUND;
}

function getSignupById(db, id) {
  return db.prepare('SELECT * FROM signups WHERE id = ?').get(id);
}

function getSignupByEventAndUser(db, eventId, userId) {
  return db.prepare('SELECT * FROM signups WHERE event_id = ? AND user_id = ?').get(eventId, userId);
}

function removeSignupById(db, id) {
  const info = db.prepare('DELETE FROM signups WHERE id = ?').run(id);
  return info.changes > 0 ? REMOVE_SIGNUP_OK : REMOVE_SIGNUP_NOT_FOUND;
}

module.exports = {
  initDb,
  migrateSignupsTable,
  migrateEventsTable,
  migrateRemindersColumn,
  migrateCleanupColumn,
  migrateThreadMessageIdColumn,
  createEvent,
  getActiveEventsByGuild,
  getEventById,
  getEventByMessageId,
  updateEventMessageId,
  updateEventThreadId,
  updateEventThreadMessageId,
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
};
