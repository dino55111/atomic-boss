CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  message_id    TEXT NOT NULL,
  thread_id     TEXT,
  thread_message_id TEXT,
  title         TEXT NOT NULL,
  capacity      INTEGER NOT NULL,
  session       INTEGER NOT NULL DEFAULT 1,
  start_time    TEXT NOT NULL,
  creator_id    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  reminded_at   TEXT,
  cleaned_at    TEXT
);

CREATE TABLE IF NOT EXISTS signups (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id          INTEGER NOT NULL REFERENCES events(id),
  user_id           TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  class             TEXT NOT NULL,
  level             TEXT NOT NULL,
  game_id           TEXT NOT NULL,
  note              TEXT NOT NULL DEFAULT '',
  added_by_user_id  TEXT,
  is_external       INTEGER NOT NULL DEFAULT 0,
  signed_at         TEXT NOT NULL,
  UNIQUE(event_id, user_id)
);
