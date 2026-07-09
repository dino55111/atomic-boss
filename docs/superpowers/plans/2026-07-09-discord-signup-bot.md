# Discord 揪團報名機器人 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Discord bot where members create "揪團" (team-up) events via a Slash Command + Modal, others join via a button + Modal (submitting class/level/game ID), and the bot tracks capacity, roster, and cancellations in SQLite.

**Architecture:** A discord.js v14 bot with a thin `interaction-router` that dispatches `InteractionCreate` events to command/button/modal handlers. All persistence goes through a small `db.js` wrapper around `better-sqlite3`. Embed/button rendering is a pure function so it can be unit tested without a live Discord connection.

**Tech Stack:** Node.js, discord.js v14, better-sqlite3, dotenv, Jest.

## Global Constraints

- Slash command name: `揪團`
- Data columns and table names exactly as defined in Task 2 (`events`, `signups`)
- Ephemeral reply copy must match verbatim (used across handlers):
  - `人數上限必須是正整數，請重新使用 /揪團 建立`
  - `找不到這個揪團，可能已經被刪除了`
  - `你已經報名囉`
  - `已經額滿了`
  - `報名成功！`
  - `你還沒有報名喔`
  - `已取消報名`
- Button `customId` format: `signup:<eventId>` and `cancel:<eventId>`
- Modal `customId` format: `create-event-modal` and `join-modal:<eventId>`
- `.env` variables: `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`
- Any member may run `/揪團` (no role restriction) — matches the spec's stated assumption
- Signup button is disabled (not clickable-then-rejected) once capacity is reached — matches the spec's stated assumption

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`
- Test: `tests/smoke.test.js`

**Interfaces:**
- Produces: an `npm test` command that runs Jest, and `npm start` / `npm run deploy-commands` scripts used by later tasks.

- [ ] **Step 1: Initialize the Node project**

```bash
cd /Users/dino.chang/project/atomic-boss
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install discord.js better-sqlite3 dotenv
npm install --save-dev jest
```

- [ ] **Step 3: Edit `package.json` scripts**

Open the generated `package.json` and set the `scripts` field to:

```json
{
  "scripts": {
    "start": "node src/index.js",
    "deploy-commands": "node scripts/deploy-commands.js",
    "test": "jest"
  }
}
```

- [ ] **Step 4: Create `.env.example`**

```
BOT_TOKEN=
CLIENT_ID=
GUILD_ID=
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
.env
data.db
*.db
```

- [ ] **Step 6: Create `README.md`**

```markdown
# 揪團報名機器人

## 設定

1. `npm install`
2. `cp .env.example .env`，填入 `BOT_TOKEN`、`CLIENT_ID`、`GUILD_ID`
3. `npm run deploy-commands`（註冊 `/揪團` 指令）
4. `npm start`

## 測試

`npm test`
```

- [ ] **Step 7: Write a smoke test to confirm Jest is wired up**

```javascript
// tests/smoke.test.js
test('jest is configured correctly', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 8: Run the test suite**

Run: `npm test`
Expected: 1 passed test (`tests/smoke.test.js`)

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore README.md tests/smoke.test.js
git commit -m "chore: scaffold Node.js project with Jest"
```

---

## Task 2: Database layer

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Consumes: nothing (base layer)
- Produces (used by Tasks 5, 6, 7):
  - `initDb(dbPath: string) -> Database`
  - `createEvent(db, { guildId, channelId, messageId, title, capacity, startTime, creatorId }) -> event`
  - `getEventById(db, id) -> event | undefined`
  - `getEventByMessageId(db, messageId) -> event | undefined`
  - `updateEventMessageId(db, eventId, messageId) -> void`
  - `getSignups(db, eventId) -> signup[]`
  - `countSignups(db, eventId) -> number`
  - `hasSignedUp(db, eventId, userId) -> boolean`
  - `addSignup(db, event, { userId, displayName, className, level, gameId }) -> 'OK' | 'FULL' | 'DUPLICATE'`
  - `removeSignup(db, eventId, userId) -> 'OK' | 'NOT_FOUND'`
  - Constants: `ADD_SIGNUP_OK`, `ADD_SIGNUP_FULL`, `ADD_SIGNUP_DUPLICATE`, `REMOVE_SIGNUP_OK`, `REMOVE_SIGNUP_NOT_FOUND`
  - `event` row shape: `{ id, guild_id, channel_id, message_id, title, capacity, start_time, creator_id, created_at }`
  - `signup` row shape: `{ id, event_id, user_id, display_name, class, level, game_id, signed_at }`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/db.test.js
const {
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

  test('addSignup adds a signup and countSignups reflects it', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    const result = addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    expect(result).toBe(ADD_SIGNUP_OK);
    expect(countSignups(db, event.id)).toBe(1);
    expect(hasSignedUp(db, event.id, 'user-1')).toBe(true);
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/db.test.js`
Expected: FAIL with `Cannot find module '../src/db/db'`

- [ ] **Step 3: Create the schema**

```sql
-- src/db/schema.sql
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  message_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  capacity      INTEGER NOT NULL,
  start_time    TEXT NOT NULL,
  creator_id    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER NOT NULL REFERENCES events(id),
  user_id       TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  class         TEXT NOT NULL,
  level         TEXT NOT NULL,
  game_id       TEXT NOT NULL,
  signed_at     TEXT NOT NULL,
  UNIQUE(event_id, user_id)
);
```

- [ ] **Step 4: Implement the db module**

```javascript
// src/db/db.js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/db.test.js`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.sql src/db/db.js tests/db.test.js
git commit -m "feat: add SQLite-backed events/signups data layer"
```

---

## Task 3: Embed and button rendering

**Files:**
- Create: `src/embeds/event-embed.js`
- Test: `tests/event-embed.test.js`

**Interfaces:**
- Consumes: `event` and `signup` row shapes from Task 2 (does not import `db.js`)
- Produces (used by Tasks 5, 6, 7):
  - `buildEventEmbed(event, signups) -> EmbedBuilder`
  - `buildActionRow(event, signupCount) -> ActionRowBuilder` with `customId`s `signup:<event.id>` and `cancel:<event.id>`; the signup button is `.setDisabled(true)` when `signupCount >= event.capacity`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/event-embed.test.js
const { buildEventEmbed, buildActionRow } = require('../src/embeds/event-embed');

const baseEvent = { id: 1, title: '週三夜間團', capacity: 2, start_time: '7/12 20:00' };

describe('buildEventEmbed', () => {
  test('shows placeholder text when there are no signups', () => {
    const embed = buildEventEmbed(baseEvent, []);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toBe('目前尚無人報名');
  });

  test('lists each signup with class, level and game id', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toContain('<@user-1>');
    expect(rosterField.value).toContain('戰士');
    expect(rosterField.value).toContain('70');
    expect(rosterField.value).toContain('alice#1');
  });

  test('shows current count over capacity', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const countField = embed.data.fields.find((f) => f.name === '人數');
    expect(countField.value).toBe('1 / 2');
  });
});

describe('buildActionRow', () => {
  test('signup button is enabled when there is room', () => {
    const row = buildActionRow(baseEvent, 1);
    expect(row.components[0].data.disabled).toBeFalsy();
  });

  test('signup button is disabled when the event is full', () => {
    const row = buildActionRow(baseEvent, 2);
    expect(row.components[0].data.disabled).toBe(true);
  });

  test('cancel button is always enabled', () => {
    const row = buildActionRow(baseEvent, 2);
    expect(row.components[1].data.disabled).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/event-embed.test.js`
Expected: FAIL with `Cannot find module '../src/embeds/event-embed'`

- [ ] **Step 3: Implement the embed/button builders**

```javascript
// src/embeds/event-embed.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildEventEmbed(event, signups) {
  const roster = signups.length === 0
    ? '目前尚無人報名'
    : signups
        .map((s, i) => `${i + 1}. <@${s.user_id}>（職業：${s.class}／等級：${s.level}／ID：${s.game_id}）`)
        .join('\n');

  return new EmbedBuilder()
    .setTitle(event.title)
    .addFields(
      { name: '時間', value: event.start_time, inline: true },
      { name: '人數', value: `${signups.length} / ${event.capacity}`, inline: true },
      { name: '名單', value: roster },
    )
    .setColor(signups.length >= event.capacity ? 0xe74c3c : 0x2ecc71);
}

function buildActionRow(event, signupCount) {
  const isFull = signupCount >= event.capacity;

  const signupButton = new ButtonBuilder()
    .setCustomId(`signup:${event.id}`)
    .setLabel('報名')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(isFull);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`cancel:${event.id}`)
    .setLabel('取消報名')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(signupButton, cancelButton);
}

module.exports = { buildEventEmbed, buildActionRow };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/event-embed.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/embeds/event-embed.js tests/event-embed.test.js
git commit -m "feat: add event embed and button rendering"
```

---

## Task 4: `/揪團` slash command (create-event modal trigger)

**Files:**
- Create: `src/commands/create-event.js`
- Test: `tests/create-event-command.test.js`

**Interfaces:**
- Consumes: `discord.js` builders only
- Produces (used by Task 8): a command module `{ data, execute }` where `data.name === '揪團'` and `execute(interaction)` calls `interaction.showModal(...)` with `customId: 'create-event-modal'` and 3 text input fields with `customId`s `title`, `capacity`, `start_time`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/create-event-command.test.js
const { data, execute } = require('../src/commands/create-event');

describe('create-event command', () => {
  test('command name is 揪團', () => {
    expect(data.name).toBe('揪團');
  });

  test('execute shows a modal with the create-event-modal customId and 3 inputs', async () => {
    const interaction = { showModal: jest.fn() };
    await execute(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('create-event-modal');
    expect(modal.components).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/create-event-command.test.js`
Expected: FAIL with `Cannot find module '../src/commands/create-event'`

- [ ] **Step 3: Implement the command**

```javascript
// src/commands/create-event.js
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('揪團')
  .setDescription('建立一個新的揪團報名');

async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('create-event-modal')
    .setTitle('建立揪團');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('標題')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const capacityInput = new TextInputBuilder()
    .setCustomId('capacity')
    .setLabel('人數上限')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const startTimeInput = new TextInputBuilder()
    .setCustomId('start_time')
    .setLabel('時間')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(capacityInput),
    new ActionRowBuilder().addComponents(startTimeInput),
  );

  await interaction.showModal(modal);
}

module.exports = { data, execute };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/create-event-command.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/create-event.js tests/create-event-command.test.js
git commit -m "feat: add /揪團 slash command with create-event modal"
```

---

## Task 5: Create-event modal submit handler

**Files:**
- Create: `src/interactions/create-event-modal.js`
- Test: `tests/create-event-modal.test.js`

**Interfaces:**
- Consumes: `createEvent`, `getEventById`, `updateEventMessageId` from Task 2; `buildEventEmbed`, `buildActionRow` from Task 3
- Produces (used by Task 8): `handleCreateEventModal(interaction, db) -> Promise<void>`, and `parseCapacity(raw: string) -> number | null`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/create-event-modal.test.js
const { initDb, getEventById } = require('../src/db/db');
const { handleCreateEventModal, parseCapacity } = require('../src/interactions/create-event-modal');

function makeInteraction(fieldValues) {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'creator-1' },
    fields: { getTextInputValue: (id) => fieldValues[id] },
    reply: jest.fn(async () => {}),
    fetchReply: jest.fn(async () => ({ id: 'message-1' })),
  };
}

describe('parseCapacity', () => {
  test('parses a valid positive integer string', () => {
    expect(parseCapacity('5')).toBe(5);
  });

  test('rejects zero, negative, and non-numeric input', () => {
    expect(parseCapacity('0')).toBeNull();
    expect(parseCapacity('-1')).toBeNull();
    expect(parseCapacity('abc')).toBeNull();
  });
});

describe('handleCreateEventModal', () => {
  test('creates an event, posts the embed, and stores the resulting message id', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '週三夜間團', capacity: '3', start_time: '7/12 20:00' });

    await handleCreateEventModal(interaction, db);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const replyPayload = interaction.reply.mock.calls[0][0];
    expect(replyPayload.embeds).toHaveLength(1);
    expect(replyPayload.components).toHaveLength(1);

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '週三夜間團', capacity: 3, message_id: 'message-1' });
  });

  test('replies with an error and does not create an event when capacity is invalid', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '週三夜間團', capacity: 'not-a-number', start_time: '7/12 20:00' });

    await handleCreateEventModal(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(getEventById(db, 1)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/create-event-modal.test.js`
Expected: FAIL with `Cannot find module '../src/interactions/create-event-modal'`

- [ ] **Step 3: Implement the handler**

```javascript
// src/interactions/create-event-modal.js
const { createEvent, updateEventMessageId } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

function parseCapacity(rawCapacity) {
  const capacity = Number.parseInt(rawCapacity, 10);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return null;
  }
  return capacity;
}

async function handleCreateEventModal(interaction, db) {
  const title = interaction.fields.getTextInputValue('title');
  const rawCapacity = interaction.fields.getTextInputValue('capacity');
  const startTime = interaction.fields.getTextInputValue('start_time');

  const capacity = parseCapacity(rawCapacity);
  if (capacity === null) {
    await interaction.reply({ content: '人數上限必須是正整數，請重新使用 /揪團 建立', ephemeral: true });
    return;
  }

  const event = createEvent(db, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: 'pending',
    title,
    capacity,
    startTime,
    creatorId: interaction.user.id,
  });

  const embed = buildEventEmbed(event, []);
  const row = buildActionRow(event, 0);

  await interaction.reply({ embeds: [embed], components: [row] });
  const message = await interaction.fetchReply();
  updateEventMessageId(db, event.id, message.id);
}

module.exports = { handleCreateEventModal, parseCapacity };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/create-event-modal.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/interactions/create-event-modal.js tests/create-event-modal.test.js
git commit -m "feat: handle create-event modal submission"
```

---

## Task 6: Join modal submit handler

**Files:**
- Create: `src/interactions/join-modal.js`
- Test: `tests/join-modal.test.js`

**Interfaces:**
- Consumes: `getEventById`, `addSignup`, `getSignups`, `ADD_SIGNUP_OK`, `ADD_SIGNUP_FULL`, `ADD_SIGNUP_DUPLICATE` from Task 2; `buildEventEmbed`, `buildActionRow` from Task 3
- Produces (used by Task 8): `handleJoinModal(interaction, db) -> Promise<void>`, reading `interaction.customId` of the form `join-modal:<eventId>`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/join-modal.test.js
const { initDb, createEvent } = require('../src/db/db');
const { handleJoinModal } = require('../src/interactions/join-modal');

function makeEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 1,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}

function makeInteraction({ eventId, userId, fieldValues, fetchedMessage }) {
  return {
    customId: `join-modal:${eventId}`,
    user: { id: userId, username: userId },
    fields: { getTextInputValue: (id) => fieldValues[id] },
    reply: jest.fn(async () => {}),
    channel: { messages: { fetch: jest.fn(async () => fetchedMessage) } },
  };
}

describe('handleJoinModal', () => {
  test('adds the signup and edits the original message', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const interaction = makeInteraction({
      eventId: event.id,
      userId: 'user-1',
      fieldValues: { class: '戰士', level: '70', game_id: 'alice#1' },
      fetchedMessage: editedMessage,
    });

    await handleJoinModal(interaction, db);

    expect(editedMessage.edit).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '報名成功！' }));
  });

  test('replies with an ephemeral message when the user already signed up', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const fieldValues = { class: '戰士', level: '70', game_id: 'alice#1' };

    await handleJoinModal(makeInteraction({ eventId: event.id, userId: 'user-1', fieldValues, fetchedMessage: editedMessage }), db);
    const interaction2 = makeInteraction({ eventId: event.id, userId: 'user-1', fieldValues, fetchedMessage: editedMessage });

    await handleJoinModal(interaction2, db);

    expect(interaction2.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '你已經報名囉', ephemeral: true }));
  });

  test('replies with an ephemeral message when the event is full', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 1 });
    const editedMessage = { edit: jest.fn(async () => {}) };

    await handleJoinModal(makeInteraction({ eventId: event.id, userId: 'user-1', fieldValues: { class: '戰士', level: '70', game_id: 'a' }, fetchedMessage: editedMessage }), db);
    const interaction2 = makeInteraction({ eventId: event.id, userId: 'user-2', fieldValues: { class: '法師', level: '65', game_id: 'b' }, fetchedMessage: editedMessage });

    await handleJoinModal(interaction2, db);

    expect(interaction2.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '已經額滿了', ephemeral: true }));
  });

  test('replies with an error when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ eventId: 999, userId: 'user-1', fieldValues: { class: 'x', level: 'y', game_id: 'z' }, fetchedMessage: {} });

    await handleJoinModal(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/join-modal.test.js`
Expected: FAIL with `Cannot find module '../src/interactions/join-modal'`

- [ ] **Step 3: Implement the handler**

```javascript
// src/interactions/join-modal.js
const { getEventById, addSignup, getSignups, ADD_SIGNUP_FULL, ADD_SIGNUP_DUPLICATE } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

async function handleJoinModal(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
    return;
  }

  const className = interaction.fields.getTextInputValue('class');
  const level = interaction.fields.getTextInputValue('level');
  const gameId = interaction.fields.getTextInputValue('game_id');

  const result = addSignup(db, event, {
    userId: interaction.user.id,
    displayName: interaction.user.username,
    className,
    level,
    gameId,
  });

  if (result === ADD_SIGNUP_DUPLICATE) {
    await interaction.reply({ content: '你已經報名囉', ephemeral: true });
    return;
  }
  if (result === ADD_SIGNUP_FULL) {
    await interaction.reply({ content: '已經額滿了', ephemeral: true });
    return;
  }

  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const message = await interaction.channel.messages.fetch(event.message_id);
  await message.edit({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '報名成功！', ephemeral: true });
}

module.exports = { handleJoinModal };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/join-modal.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/interactions/join-modal.js tests/join-modal.test.js
git commit -m "feat: handle join-modal submission with capacity/duplicate checks"
```

---

## Task 7: Signup/cancel button handlers

**Files:**
- Create: `src/interactions/signup-button.js`
- Test: `tests/signup-button.test.js`

**Interfaces:**
- Consumes: `getEventById`, `removeSignup`, `getSignups`, `REMOVE_SIGNUP_OK` from Task 2; `buildEventEmbed`, `buildActionRow` from Task 3
- Produces (used by Task 8): `buildJoinModal(eventId) -> ModalBuilder` (customId `join-modal:<eventId>`), `handleSignupButton(interaction) -> Promise<void>`, `handleCancelButton(interaction, db) -> Promise<void>`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/signup-button.test.js
const { initDb, createEvent, addSignup } = require('../src/db/db');
const { buildJoinModal, handleSignupButton, handleCancelButton } = require('../src/interactions/signup-button');

function makeEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 2,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}

describe('buildJoinModal', () => {
  test('customId embeds the event id and has 3 inputs', () => {
    const modal = buildJoinModal(42);
    expect(modal.data.custom_id).toBe('join-modal:42');
    expect(modal.components).toHaveLength(3);
  });
});

describe('handleSignupButton', () => {
  test('shows the join modal for the clicked event', async () => {
    const interaction = { customId: 'signup:42', showModal: jest.fn() };
    await handleSignupButton(interaction);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.showModal.mock.calls[0][0].data.custom_id).toBe('join-modal:42');
  });
});

describe('handleCancelButton', () => {
  test('removes an existing signup and edits the message', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });

    const editedMessage = { edit: jest.fn(async () => {}) };
    const interaction = {
      customId: `cancel:${event.id}`,
      user: { id: 'user-1' },
      reply: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn(async () => editedMessage) } },
    };

    await handleCancelButton(interaction, db);

    expect(editedMessage.edit).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '已取消報名' }));
  });

  test('replies with an ephemeral message when the user never signed up', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const interaction = {
      customId: `cancel:${event.id}`,
      user: { id: 'user-1' },
      reply: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn() } },
    };

    await handleCancelButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '你還沒有報名喔', ephemeral: true }));
  });

  test('replies with an error when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = {
      customId: 'cancel:999',
      user: { id: 'user-1' },
      reply: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn() } },
    };

    await handleCancelButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/signup-button.test.js`
Expected: FAIL with `Cannot find module '../src/interactions/signup-button'`

- [ ] **Step 3: Implement the handlers**

```javascript
// src/interactions/signup-button.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getEventById, removeSignup, getSignups, REMOVE_SIGNUP_OK } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

function buildJoinModal(eventId) {
  const modal = new ModalBuilder()
    .setCustomId(`join-modal:${eventId}`)
    .setTitle('報名揪團');

  const classInput = new TextInputBuilder()
    .setCustomId('class')
    .setLabel('職業')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const levelInput = new TextInputBuilder()
    .setCustomId('level')
    .setLabel('等級')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const gameIdInput = new TextInputBuilder()
    .setCustomId('game_id')
    .setLabel('遊戲 ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(classInput),
    new ActionRowBuilder().addComponents(levelInput),
    new ActionRowBuilder().addComponents(gameIdInput),
  );

  return modal;
}

async function handleSignupButton(interaction) {
  const eventId = interaction.customId.split(':')[1];
  await interaction.showModal(buildJoinModal(eventId));
}

async function handleCancelButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
    return;
  }

  const result = removeSignup(db, event.id, interaction.user.id);
  if (result !== REMOVE_SIGNUP_OK) {
    await interaction.reply({ content: '你還沒有報名喔', ephemeral: true });
    return;
  }

  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const message = await interaction.channel.messages.fetch(event.message_id);
  await message.edit({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '已取消報名', ephemeral: true });
}

module.exports = { buildJoinModal, handleSignupButton, handleCancelButton };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/signup-button.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/interactions/signup-button.js tests/signup-button.test.js
git commit -m "feat: handle signup/cancel button clicks"
```

---

## Task 8: Interaction router

**Files:**
- Create: `src/interaction-router.js`
- Test: `tests/interaction-router.test.js`

**Interfaces:**
- Consumes: command modules `{ execute }` keyed by name in a `Map`, and the four handler functions from Tasks 5, 6, 7 (`handleCreateEventModal`, `handleJoinModal`, `handleSignupButton`, `handleCancelButton`), injected so this module never imports discord.js Client code
- Produces (used by Task 9): `createInteractionHandler({ commands, db, handleCreateEventModal, handleJoinModal, handleSignupButton, handleCancelButton }) -> (interaction) => Promise<void>`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/interaction-router.test.js
const { createInteractionHandler } = require('../src/interaction-router');

function makeBaseInteraction(overrides = {}) {
  return {
    isChatInputCommand: () => false,
    isButton: () => false,
    isModalSubmit: () => false,
    ...overrides,
  };
}

describe('createInteractionHandler', () => {
  test('routes chat input commands to the matching command handler', async () => {
    const execute = jest.fn(async () => {});
    const commands = new Map([['揪團', { execute }]]);
    const handle = createInteractionHandler({ commands, db: {}, handleCreateEventModal: jest.fn(), handleJoinModal: jest.fn(), handleSignupButton: jest.fn(), handleCancelButton: jest.fn() });
    const interaction = makeBaseInteraction({ isChatInputCommand: () => true, commandName: '揪團' });

    await handle(interaction);

    expect(execute).toHaveBeenCalledWith(interaction);
  });

  test('routes signup button clicks to handleSignupButton', async () => {
    const handleSignupButton = jest.fn(async () => {});
    const handle = createInteractionHandler({ commands: new Map(), db: {}, handleCreateEventModal: jest.fn(), handleJoinModal: jest.fn(), handleSignupButton, handleCancelButton: jest.fn() });
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'signup:1' });

    await handle(interaction);

    expect(handleSignupButton).toHaveBeenCalledWith(interaction);
  });

  test('routes cancel button clicks to handleCancelButton with the db', async () => {
    const handleCancelButton = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler({ commands: new Map(), db, handleCreateEventModal: jest.fn(), handleJoinModal: jest.fn(), handleSignupButton: jest.fn(), handleCancelButton });
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'cancel:1' });

    await handle(interaction);

    expect(handleCancelButton).toHaveBeenCalledWith(interaction, db);
  });

  test('routes the create-event-modal submission to handleCreateEventModal', async () => {
    const handleCreateEventModal = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler({ commands: new Map(), db, handleCreateEventModal, handleJoinModal: jest.fn(), handleSignupButton: jest.fn(), handleCancelButton: jest.fn() });
    const interaction = makeBaseInteraction({ isModalSubmit: () => true, customId: 'create-event-modal' });

    await handle(interaction);

    expect(handleCreateEventModal).toHaveBeenCalledWith(interaction, db);
  });

  test('routes join-modal submissions to handleJoinModal', async () => {
    const handleJoinModal = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler({ commands: new Map(), db, handleCreateEventModal: jest.fn(), handleJoinModal, handleSignupButton: jest.fn(), handleCancelButton: jest.fn() });
    const interaction = makeBaseInteraction({ isModalSubmit: () => true, customId: 'join-modal:1' });

    await handle(interaction);

    expect(handleJoinModal).toHaveBeenCalledWith(interaction, db);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/interaction-router.test.js`
Expected: FAIL with `Cannot find module '../src/interaction-router'`

- [ ] **Step 3: Implement the router**

```javascript
// src/interaction-router.js
function createInteractionHandler({ commands, db, handleCreateEventModal, handleJoinModal, handleSignupButton, handleCancelButton }) {
  return async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      const [action] = interaction.customId.split(':');
      if (action === 'signup') await handleSignupButton(interaction);
      if (action === 'cancel') await handleCancelButton(interaction, db);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'create-event-modal') {
        await handleCreateEventModal(interaction, db);
        return;
      }
      if (interaction.customId.startsWith('join-modal:')) {
        await handleJoinModal(interaction, db);
      }
    }
  };
}

module.exports = { createInteractionHandler };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/interaction-router.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/interaction-router.js tests/interaction-router.test.js
git commit -m "feat: add interaction router dispatching to command/button/modal handlers"
```

---

## Task 9: Bot entry point and command deployment script

**Files:**
- Create: `src/index.js`
- Create: `scripts/deploy-commands.js`

**Interfaces:**
- Consumes: `initDb` from Task 2, `createEventCommand` from Task 4, `handleCreateEventModal` from Task 5, `handleJoinModal` from Task 6, `handleSignupButton`/`handleCancelButton` from Task 7, `createInteractionHandler` from Task 8
- Produces: the running bot process (`npm start`) and the command registration script (`npm run deploy-commands`). No unit tests — these are wiring/side-effect scripts verified manually in Task 10.

- [ ] **Step 1: Implement the entry point**

```javascript
// src/index.js
require('dotenv').config();
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { initDb } = require('./db/db');
const createEventCommand = require('./commands/create-event');
const { handleCreateEventModal } = require('./interactions/create-event-modal');
const { handleJoinModal } = require('./interactions/join-modal');
const { handleSignupButton, handleCancelButton } = require('./interactions/signup-button');
const { createInteractionHandler } = require('./interaction-router');

const db = initDb(path.join(__dirname, '..', 'data.db'));
const commands = new Map([[createEventCommand.data.name, createEventCommand]]);

const handleInteraction = createInteractionHandler({
  commands,
  db,
  handleCreateEventModal,
  handleJoinModal,
  handleSignupButton,
  handleCancelButton,
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction).catch((error) => {
    console.error('Error handling interaction:', error);
  });
});

client.login(process.env.BOT_TOKEN);
```

- [ ] **Step 2: Implement the command deployment script**

```javascript
// scripts/deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const createEventCommand = require('../src/commands/create-event');

const commands = [createEventCommand.data.toJSON()];

const rest = new REST().setToken(process.env.BOT_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands },
  );
  console.log('Slash commands registered.');
})();
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: All test suites pass (Tasks 1–8's tests)

- [ ] **Step 4: Commit**

```bash
git add src/index.js scripts/deploy-commands.js
git commit -m "feat: wire up bot entry point and slash command deployment script"
```

---

## Task 10: Manual end-to-end verification

**Files:** none (manual verification against a real Discord test server)

**Interfaces:** none — this task exercises Tasks 1–9 together.

- [ ] **Step 1: Configure a test bot application**

Create a Discord application + bot at the Discord Developer Portal, invite it to a test server with `applications.commands` and `bot` scopes, and fill `.env` with `BOT_TOKEN`, `CLIENT_ID`, and the test server's `GUILD_ID`.

- [ ] **Step 2: Register the slash command**

Run: `npm run deploy-commands`
Expected: Console prints `Slash commands registered.`

- [ ] **Step 3: Start the bot**

Run: `npm start`
Expected: Console prints `Logged in as <bot tag>`

- [ ] **Step 4: Golden path — create an event**

In the test server, run `/揪團`, fill in title `週三夜間團`, capacity `2`, time `7/12 20:00`, submit.
Expected: Bot posts an Embed with 0/2, empty roster placeholder, and enabled 報名/取消報名 buttons.

- [ ] **Step 5: Golden path — sign up**

Click 報名, fill in class/level/game ID, submit.
Expected: Ephemeral `報名成功！`; the Embed updates to 1/2 with your entry listed.

- [ ] **Step 6: Golden path — reach capacity**

Sign up with a second Discord account (or ask another tester) to reach 2/2.
Expected: Embed shows 2/2; the 報名 button becomes disabled/greyed out for everyone.

- [ ] **Step 7: Golden path — cancel and re-open a slot**

Click 取消報名 as one of the signed-up users.
Expected: Ephemeral `已取消報名`; Embed drops to 1/2; 報名 button becomes clickable again.

- [ ] **Step 8: Edge case — duplicate signup**

While still signed up, click 報名 again and submit the modal.
Expected: Ephemeral `你已經報名囉`; roster count unchanged.

- [ ] **Step 9: Edge case — cancel without signing up**

As a user who never signed up, click 取消報名.
Expected: Ephemeral `你還沒有報名喔`.

- [ ] **Step 10: Edge case — capacity of 1**

Create a second event with capacity `1`, sign up once.
Expected: Button disables immediately after the first signup.

- [ ] **Step 11: Persistence check**

Stop the bot (`Ctrl+C`), restart with `npm start`, then click 取消報名 on the event created in Step 4.
Expected: The cancellation succeeds and the Embed updates correctly, proving the roster survived the restart.
