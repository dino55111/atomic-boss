const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function initDb(dbPath) {
  const db = new Database(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

function createEvent(db, { guildId, channelId, messageId, title, capacity, startTime, creatorId }) {
  const createdAt = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO events (guild_id, channel_id, message_id, title, capacity, start_time, creator_id, created_at)
    VALUES (@guildId, @channelId, @messageId, @title, @capacity, @startTime, @creatorId, @createdAt)
  `).run({ guildId, channelId, messageId, title, capacity, startTime, creatorId, createdAt });
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

function addSignup(db, event, { userId, displayName, className, level, gameId }) {
  const transaction = db.transaction(() => {
    if (hasSignedUp(db, event.id, userId)) {
      return ADD_SIGNUP_DUPLICATE;
    }
    if (countSignups(db, event.id) >= event.capacity) {
      return ADD_SIGNUP_FULL;
    }
    db.prepare(`
      INSERT INTO signups (event_id, user_id, display_name, class, level, game_id, signed_at)
      VALUES (@eventId, @userId, @displayName, @className, @level, @gameId, @signedAt)
    `).run({
      eventId: event.id,
      userId,
      displayName,
      className,
      level,
      gameId,
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

module.exports = {
  initDb,
  createEvent,
  getEventById,
  getEventByMessageId,
  updateEventMessageId,
  getSignups,
  countSignups,
  hasSignedUp,
  addSignup,
  removeSignup,
  ADD_SIGNUP_OK,
  ADD_SIGNUP_FULL,
  ADD_SIGNUP_DUPLICATE,
  REMOVE_SIGNUP_OK,
  REMOVE_SIGNUP_NOT_FOUND,
};
