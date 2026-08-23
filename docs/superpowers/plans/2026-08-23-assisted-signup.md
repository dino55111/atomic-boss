# 協助他人報名（代報名）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sign up another server member, or a friend without a Discord account, on an existing 揪團 event — and let the right people cancel those entries afterward.

**Architecture:** Two new `signups` columns (`added_by_user_id`, `is_external`) carry who assisted whom. A new `代報名` button on the event embed kicks off a parallel interaction chain (`assist-*` customIds) that mirrors the existing 報名 flow (button → class picker → modal) but first asks who the signup is for, via a `UserSelectMenu` or an "no Discord account" button. The existing 取消報名 button gains a disambiguation step (a button picker) when the clicker has more than one signup they're allowed to cancel.

**Tech Stack:** Node.js, discord.js v14 (`UserSelectMenuBuilder`, `ModalBuilder`, `ButtonBuilder`), better-sqlite3, Jest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-23-assisted-signup-design.md`.
- Migration must be idempotent and run on every `initDb()` call — safe to run against the existing production `data.db` as well as a fresh in-memory test DB.
- Non-Discord friend synthetic user IDs use the exact format `ext:<uuid>` where `<uuid>` comes from `crypto.randomUUID()`.
- Roster line format: self-signups unchanged; an assisted entry appends `／代報名：<@helper_id>`; an external-friend entry renders `**display_name**` instead of `<@user_id>`.
- Thread signup message for an assisted signup appends `，由 <@helper_id> 代為報名` to the existing message format.
- Thread cancel message appends `（由 <@canceler_id> 代為取消）` only when the canceler's ID differs from the signup's own `user_id`.
- Exact copy (must match verbatim): button labels `代報名`, `好友沒有 Discord 帳號`; picker prompts `請選擇要代報名的對象：`, `請選擇職業：`, `請選擇要取消哪一筆報名：`; confirmations `已取消報名`, `這筆報名已經不存在了`; modal field label `暱稱`.
- customId scheme: `assist:{eventId}`, `assist-user-select:{eventId}`, `assist-external:{eventId}`, `assist-class-choice:{eventId}:{target}:{className}`, `assist-join-modal:{eventId}:{target}:{className}` (where `{target}` is a real Discord user ID or the literal string `external`), `cancel-select:{eventId}:{signupId}`.
- Duplicate/full-capacity handling in the assist flow mirrors the existing self-signup flow exactly: a duplicate signup is silently ignored (no message), a full event replies with an ephemeral `已經額滿了` follow-up.

---

## File Structure

- `src/db/schema.sql` — add `added_by_user_id` and `is_external` columns to `signups` for fresh databases.
- `src/db/db.js` — idempotent migration for existing databases, `addSignup` extended with `addedByUserId`/`isExternal`, new `getSignupById`/`removeSignupById`.
- `src/embeds/event-embed.js` — roster line rendering for external/assisted entries, `代報名` button in the action row.
- `src/interactions/signup-button.js` — export a customId-parameterized class-button-grid builder for reuse; cancel-button disambiguation logic and the new picker-button handler.
- `src/interactions/join-modal.js` — export the existing `getOptionalTextInputValue` helper for reuse.
- `src/interactions/assist-signup.js` (new) — all of the 代報名 flow: target picker, class picker, modal builders, and their handlers including the DB-writing modal submission.
- `src/interaction-router.js` — route the new button, `UserSelectMenu`, and modal-submit interactions.
- `src/index.js` — wire the new handlers into `createInteractionHandler`.

---

### Task 1: Data model — assist columns, migration, DB helpers

**Files:**
- Modify: `src/db/schema.sql`
- Modify: `src/db/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Produces: `migrateSignupsTable(db)`, `getSignupById(db, id) -> signupRow | undefined`, `removeSignupById(db, id) -> REMOVE_SIGNUP_OK | REMOVE_SIGNUP_NOT_FOUND`, `addSignup(db, event, { userId, displayName, className, level, gameId, note = '', addedByUserId = null, isExternal = false })` (extends the existing signature — all new fields optional and backward compatible). Signup rows now also carry `added_by_user_id` (string or `null`) and `is_external` (`0` or `1`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/db.test.js`. First, add `const Database = require('better-sqlite3');` near the top (alongside the existing `require`s), and add `migrateSignupsTable`, `getSignupById`, `removeSignupById` to the destructured import from `../src/db/db`:

```js
const Database = require('better-sqlite3');
const {
  initDb,
  migrateSignupsTable,
  createEvent,
  getEventById,
  getEventByMessageId,
  updateEventMessageId,
  updateEventThreadId,
  getSignups,
  countSignups,
  hasSignedUp,
  addSignup,
  removeSignup,
  getSignupById,
  removeSignupById,
  ADD_SIGNUP_OK,
  ADD_SIGNUP_FULL,
  ADD_SIGNUP_DUPLICATE,
  REMOVE_SIGNUP_OK,
  REMOVE_SIGNUP_NOT_FOUND,
} = require('../src/db/db');
```

Then add these tests inside the existing `describe('db', ...)` block, after the `getSignups returns signups ordered by signup time` test:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/db.test.js`
Expected: FAIL — `migrateSignupsTable`, `getSignupById`, `removeSignupById` are not exported / not functions.

- [ ] **Step 3: Update the schema for fresh databases**

In `src/db/schema.sql`, replace the `signups` table definition:

```sql
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
```

- [ ] **Step 4: Add the migration function and wire it into `initDb`**

In `src/db/db.js`, add this function right after the `require`s (before `initDb`):

```js
function migrateSignupsTable(db) {
  const columns = db.prepare('PRAGMA table_info(signups)').all().map((col) => col.name);
  if (!columns.includes('added_by_user_id')) {
    db.exec('ALTER TABLE signups ADD COLUMN added_by_user_id TEXT');
  }
  if (!columns.includes('is_external')) {
    db.exec('ALTER TABLE signups ADD COLUMN is_external INTEGER NOT NULL DEFAULT 0');
  }
}
```

Then update `initDb` to call it:

```js
function initDb(dbPath) {
  const db = new Database(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrateSignupsTable(db);
  return db;
}
```

- [ ] **Step 5: Extend `addSignup` and add the two new lookup/delete helpers**

Replace the `addSignup` function body:

```js
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
```

Add these two functions right after `removeSignup`:

```js
function getSignupById(db, id) {
  return db.prepare('SELECT * FROM signups WHERE id = ?').get(id);
}

function removeSignupById(db, id) {
  const info = db.prepare('DELETE FROM signups WHERE id = ?').run(id);
  return info.changes > 0 ? REMOVE_SIGNUP_OK : REMOVE_SIGNUP_NOT_FOUND;
}
```

Finally, update `module.exports` to add the new names:

```js
module.exports = {
  initDb,
  migrateSignupsTable,
  createEvent,
  getEventById,
  getEventByMessageId,
  updateEventMessageId,
  updateEventThreadId,
  getSignups,
  countSignups,
  hasSignedUp,
  addSignup,
  removeSignup,
  getSignupById,
  removeSignupById,
  ADD_SIGNUP_OK,
  ADD_SIGNUP_FULL,
  ADD_SIGNUP_DUPLICATE,
  REMOVE_SIGNUP_OK,
  REMOVE_SIGNUP_NOT_FOUND,
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/db.test.js`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.sql src/db/db.js tests/db.test.js
git commit -m "Add added_by_user_id/is_external columns and signup-by-id helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Roster embed & 代報名 button

**Files:**
- Modify: `src/embeds/event-embed.js`
- Test: `tests/event-embed.test.js`

**Interfaces:**
- Consumes: signup rows shaped `{ user_id, display_name, class, level, game_id, note, added_by_user_id, is_external }` (from Task 1).
- Produces: `buildEventEmbed(event, signups)` unchanged signature; `buildActionRow(event, signupCount)` unchanged signature, now returns 3 buttons — `row.components[0]` = 報名, `row.components[1]` = 代報名 (new), `row.components[2]` = 取消報名 (index shifted from 1 to 2).

- [ ] **Step 1: Write the failing tests**

In `tests/event-embed.test.js`, add these tests inside `describe('buildEventEmbed', ...)`, after the `shows current count over capacity` test:

```js
  test('renders a bold display name instead of a mention for an external (non-Discord) signup', () => {
    const signups = [{ user_id: 'ext:1', display_name: '小明', class: '戰士', level: '70', game_id: 'ming#1', note: '', is_external: 1 }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toContain('**小明**');
    expect(rosterField.value).not.toContain('<@ext:1>');
  });

  test('appends who assisted the signup when added_by_user_id is set', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1', note: '', added_by_user_id: 'helper-1' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toContain('代報名：<@helper-1>');
  });

  test('omits the assist segment for a self-signup', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1', note: '' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).not.toContain('代報名');
  });
```

Then replace the whole `describe('buildActionRow', ...)` block with:

```js
describe('buildActionRow', () => {
  test('signup button is enabled when there is room', () => {
    const row = buildActionRow(baseEvent, 1);
    expect(row.components[0].data.disabled).toBeFalsy();
  });

  test('signup button is disabled when the event is full', () => {
    const row = buildActionRow(baseEvent, 2);
    expect(row.components[0].data.disabled).toBe(true);
  });

  test('assist button is enabled when there is room', () => {
    const row = buildActionRow(baseEvent, 1);
    expect(row.components[1].data.disabled).toBeFalsy();
  });

  test('assist button is disabled when the event is full', () => {
    const row = buildActionRow(baseEvent, 2);
    expect(row.components[1].data.disabled).toBe(true);
  });

  test('cancel button is always enabled', () => {
    const row = buildActionRow(baseEvent, 2);
    expect(row.components[2].data.disabled).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/event-embed.test.js`
Expected: FAIL — the new roster tests fail on content assertions, the `cancel button` test fails because `row.components[2]` is currently `undefined` (only 2 buttons exist).

- [ ] **Step 3: Update `buildEventEmbed`**

In `src/embeds/event-embed.js`, replace the roster-building `.map(...)` callback:

```js
        .map((s, i) => {
          const nameSegment = s.is_external ? `**${s.display_name}**` : `<@${s.user_id}>`;
          const noteSegment = s.note ? `／備註：${s.note}` : '';
          const assistSegment = s.added_by_user_id ? `／代報名：<@${s.added_by_user_id}>` : '';
          return `${i + 1}. ${nameSegment}（職業：${s.class}／等級：${s.level}／ID：${s.game_id}${noteSegment}${assistSegment}）`;
        })
```

- [ ] **Step 4: Add the 代報名 button to `buildActionRow`**

Replace `buildActionRow`:

```js
function buildActionRow(event, signupCount) {
  const isFull = signupCount >= event.capacity;

  const signupButton = new ButtonBuilder()
    .setCustomId(`signup:${event.id}`)
    .setLabel('報名')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(isFull);

  const assistButton = new ButtonBuilder()
    .setCustomId(`assist:${event.id}`)
    .setLabel('代報名')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isFull);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`cancel:${event.id}`)
    .setLabel('取消報名')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(signupButton, assistButton, cancelButton);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/event-embed.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/embeds/event-embed.js tests/event-embed.test.js
git commit -m "Add 代報名 button and assisted/external roster rendering

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Assist-signup entry UI (target picker → class picker → modal display)

**Files:**
- Modify: `src/interactions/signup-button.js`
- Create: `src/interactions/assist-signup.js`
- Test: `tests/signup-button.test.js`
- Test: `tests/assist-signup.test.js` (new)

**Interfaces:**
- Consumes: `CLASS_OPTIONS` (from `signup-button.js`, unchanged export).
- Produces: `buildClassButtonRowsForCustomIds(customIdForClass)` (new export from `signup-button.js`) — returns the same 3×4 button-row layout as `buildClassButtonRows`, but with each button's customId built by the caller-supplied function. From `assist-signup.js`: `EXTERNAL_TARGET` (`'external'`), `buildAssistTargetPickerRows(eventId)`, `buildAssistClassButtonRows(eventId, target)`, `buildAssistJoinModal(eventId, target, className)`, `handleAssistButton(interaction)`, `handleAssistUserSelect(interaction)`, `handleAssistExternalButton(interaction)`, `handleAssistClassChoiceButton(interaction)`. (`handleAssistJoinModal` — the DB-writing submit handler — is added in Task 4, but `buildAssistJoinModal`'s shape is finalized here since `handleAssistClassChoiceButton` needs it.)

- [ ] **Step 1: Write the failing test for the refactored class-button builder**

In `tests/signup-button.test.js`, update the import to add `buildClassButtonRowsForCustomIds`:

```js
const {
  buildClassButtonRows,
  buildClassButtonRowsForCustomIds,
  buildJoinDetailsModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  CLASS_OPTIONS,
} = require('../src/interactions/signup-button');
```

Add this test after the `describe('buildClassButtonRows', ...)` block:

```js
describe('buildClassButtonRowsForCustomIds', () => {
  test('builds the same 3x4 grid using a caller-supplied customId per class', () => {
    const rows = buildClassButtonRowsForCustomIds((className) => `custom:${className}`);
    expect(rows).toHaveLength(3);
    expect(rows[0].components[0].data.custom_id).toBe(`custom:${CLASS_OPTIONS[0]}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/signup-button.test.js`
Expected: FAIL — `buildClassButtonRowsForCustomIds` is not a function.

- [ ] **Step 3: Refactor `signup-button.js` to extract the parameterized builder**

Replace `buildClassButtonRows`:

```js
function buildClassButtonRowsForCustomIds(customIdForClass) {
  const buttons = CLASS_OPTIONS.map((className) =>
    new ButtonBuilder()
      .setCustomId(customIdForClass(className))
      .setLabel(className)
      .setStyle(ButtonStyle.Secondary),
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += CLASS_BUTTONS_PER_ROW) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + CLASS_BUTTONS_PER_ROW)));
  }
  return rows;
}

function buildClassButtonRows(eventId) {
  return buildClassButtonRowsForCustomIds((className) => `class-choice:${eventId}:${className}`);
}
```

Add `buildClassButtonRowsForCustomIds` to `module.exports`:

```js
module.exports = {
  buildClassButtonRows,
  buildClassButtonRowsForCustomIds,
  buildJoinDetailsModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  CLASS_OPTIONS,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/signup-button.test.js`
Expected: PASS (all tests, including the pre-existing `buildClassButtonRows` ones — its output is unchanged).

- [ ] **Step 5: Write the failing tests for the new assist-signup module**

Create `tests/assist-signup.test.js`:

```js
const {
  EXTERNAL_TARGET,
  buildAssistTargetPickerRows,
  buildAssistClassButtonRows,
  buildAssistJoinModal,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
} = require('../src/interactions/assist-signup');
const { CLASS_OPTIONS } = require('../src/interactions/signup-button');

describe('buildAssistTargetPickerRows', () => {
  test('returns a user-select row and an external-friend button row', () => {
    const rows = buildAssistTargetPickerRows(42);
    expect(rows).toHaveLength(2);
    expect(rows[0].components[0].data.custom_id).toBe('assist-user-select:42');
    expect(rows[1].components[0].data.custom_id).toBe('assist-external:42');
  });
});

describe('buildAssistClassButtonRows', () => {
  test('embeds the event id and target user id in each class button customId', () => {
    const rows = buildAssistClassButtonRows(42, 'user-9');
    expect(rows).toHaveLength(3);
    expect(rows[0].components[0].data.custom_id).toBe(`assist-class-choice:42:user-9:${CLASS_OPTIONS[0]}`);
  });

  test('uses the literal "external" target for a non-Discord friend', () => {
    const rows = buildAssistClassButtonRows(42, EXTERNAL_TARGET);
    expect(rows[0].components[0].data.custom_id).toBe(`assist-class-choice:42:external:${CLASS_OPTIONS[0]}`);
  });
});

describe('buildAssistJoinModal', () => {
  test('has 3 fields (等級／遊戲 ID／備註) when assisting a real member', () => {
    const modal = buildAssistJoinModal(42, 'user-9', '冰雷');
    expect(modal.data.custom_id).toBe('assist-join-modal:42:user-9:冰雷');
    expect(modal.components).toHaveLength(3);
    expect(modal.components[0].components[0].data.label).toBe('等級');
  });

  test('has an extra 暱稱 field first when assisting a non-Discord friend', () => {
    const modal = buildAssistJoinModal(42, EXTERNAL_TARGET, '冰雷');
    expect(modal.data.custom_id).toBe('assist-join-modal:42:external:冰雷');
    expect(modal.components).toHaveLength(4);
    expect(modal.components[0].components[0].data.label).toBe('暱稱');
    expect(modal.components[1].components[0].data.label).toBe('等級');
  });
});

describe('handleAssistButton', () => {
  test('replies with an ephemeral target-picker for the clicked event', async () => {
    const interaction = { customId: 'assist:42', reply: jest.fn(async () => {}) };
    await handleAssistButton(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const replyPayload = interaction.reply.mock.calls[0][0];
    expect(replyPayload.ephemeral).toBe(true);
    expect(replyPayload.components[0].components[0].data.custom_id).toBe('assist-user-select:42');
  });
});

describe('handleAssistUserSelect', () => {
  test('updates the message to the class picker for the selected member', async () => {
    const interaction = { customId: 'assist-user-select:42', values: ['user-9'], update: jest.fn(async () => {}) };
    await handleAssistUserSelect(interaction);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const payload = interaction.update.mock.calls[0][0];
    expect(payload.components[0].components[0].data.custom_id).toBe(`assist-class-choice:42:user-9:${CLASS_OPTIONS[0]}`);
  });
});

describe('handleAssistExternalButton', () => {
  test('updates the message to the class picker for the external target', async () => {
    const interaction = { customId: 'assist-external:42', update: jest.fn(async () => {}) };
    await handleAssistExternalButton(interaction);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const payload = interaction.update.mock.calls[0][0];
    expect(payload.components[0].components[0].data.custom_id).toBe(`assist-class-choice:42:external:${CLASS_OPTIONS[0]}`);
  });
});

describe('handleAssistClassChoiceButton', () => {
  test('shows the assist join-details modal for the chosen event, target and class', async () => {
    const interaction = { customId: 'assist-class-choice:42:user-9:冰雷', showModal: jest.fn() };
    await handleAssistClassChoiceButton(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('assist-join-modal:42:user-9:冰雷');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx jest tests/assist-signup.test.js`
Expected: FAIL — `src/interactions/assist-signup.js` doesn't exist yet.

- [ ] **Step 7: Create `src/interactions/assist-signup.js`**

```js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
const { buildClassButtonRowsForCustomIds } = require('./signup-button');

const EXTERNAL_TARGET = 'external';

function buildAssistTargetPickerRows(eventId) {
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId(`assist-user-select:${eventId}`)
    .setPlaceholder('選擇伺服器成員')
    .setMinValues(1)
    .setMaxValues(1);

  const externalButton = new ButtonBuilder()
    .setCustomId(`assist-external:${eventId}`)
    .setLabel('好友沒有 Discord 帳號')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(externalButton),
  ];
}

function buildAssistClassButtonRows(eventId, target) {
  return buildClassButtonRowsForCustomIds((className) => `assist-class-choice:${eventId}:${target}:${className}`);
}

function buildAssistJoinModal(eventId, target, className) {
  const modal = new ModalBuilder()
    .setCustomId(`assist-join-modal:${eventId}:${target}:${className}`)
    .setTitle(`代報名（${className}）`);

  const rows = [];

  if (target === EXTERNAL_TARGET) {
    const nicknameInput = new TextInputBuilder()
      .setCustomId('nickname')
      .setLabel('暱稱')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    rows.push(new ActionRowBuilder().addComponents(nicknameInput));
  }

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

  const noteInput = new TextInputBuilder()
    .setCustomId('note')
    .setLabel('備註')
    .setPlaceholder('可以填 XXX 的小號')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  rows.push(
    new ActionRowBuilder().addComponents(levelInput),
    new ActionRowBuilder().addComponents(gameIdInput),
    new ActionRowBuilder().addComponents(noteInput),
  );

  modal.addComponents(...rows);

  return modal;
}

async function handleAssistButton(interaction) {
  const eventId = interaction.customId.split(':')[1];
  await interaction.reply({
    content: '請選擇要代報名的對象：',
    components: buildAssistTargetPickerRows(eventId),
    ephemeral: true,
  });
}

async function handleAssistUserSelect(interaction) {
  const eventId = interaction.customId.split(':')[1];
  const targetUserId = interaction.values[0];
  await interaction.update({
    content: '請選擇職業：',
    components: buildAssistClassButtonRows(eventId, targetUserId),
  });
}

async function handleAssistExternalButton(interaction) {
  const eventId = interaction.customId.split(':')[1];
  await interaction.update({
    content: '請選擇職業：',
    components: buildAssistClassButtonRows(eventId, EXTERNAL_TARGET),
  });
}

async function handleAssistClassChoiceButton(interaction) {
  const [, eventId, target, className] = interaction.customId.split(':');
  await interaction.showModal(buildAssistJoinModal(eventId, target, className));
}

module.exports = {
  EXTERNAL_TARGET,
  buildAssistTargetPickerRows,
  buildAssistClassButtonRows,
  buildAssistJoinModal,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
};
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest tests/assist-signup.test.js tests/signup-button.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/interactions/signup-button.js src/interactions/assist-signup.js tests/signup-button.test.js tests/assist-signup.test.js
git commit -m "Add 代報名 target/class picker UI (assist-signup entry flow)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Assist join-modal submission (DB write)

**Files:**
- Modify: `src/interactions/join-modal.js`
- Modify: `src/interactions/assist-signup.js`
- Test: `tests/join-modal.test.js`
- Test: `tests/assist-signup.test.js`

**Interfaces:**
- Consumes: `getOptionalTextInputValue(fields, customId)` (exported from `join-modal.js` in this task), `tryAcknowledgeAndDeleteReply` (from `./ack`), `getEventById`, `addSignup`, `getSignups`, `ADD_SIGNUP_FULL`, `ADD_SIGNUP_DUPLICATE` (from `../db/db`), `buildEventEmbed`, `buildActionRow` (from `../embeds/event-embed`), `EXTERNAL_TARGET` (from this file, Task 3).
- Produces: `handleAssistJoinModal(interaction, db)` — added to `assist-signup.js`'s exports.

- [ ] **Step 1: Write the failing test for the exported helper**

In `tests/join-modal.test.js`, change the top import to:

```js
const { handleJoinModal, getOptionalTextInputValue } = require('../src/interactions/join-modal');
```

Add this new `describe` block at the end of the file (before the final closing of the file):

```js
describe('getOptionalTextInputValue', () => {
  test('returns the field value when present', () => {
    const fields = { fields: new Map([['note', { value: 'hi' }]]) };
    expect(getOptionalTextInputValue(fields, 'note')).toBe('hi');
  });

  test('returns an empty string when the field is absent', () => {
    const fields = { fields: new Map() };
    expect(getOptionalTextInputValue(fields, 'note')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/join-modal.test.js`
Expected: FAIL — `getOptionalTextInputValue` is `undefined`.

- [ ] **Step 3: Export `getOptionalTextInputValue` from `join-modal.js`**

In `src/interactions/join-modal.js`, change the final line:

```js
module.exports = { handleJoinModal, getOptionalTextInputValue };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/join-modal.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `handleAssistJoinModal`**

In `tests/assist-signup.test.js`, add to the top imports:

```js
const { initDb, createEvent, updateEventThreadId, getSignups, addSignup } = require('../src/db/db');
const {
  EXTERNAL_TARGET,
  buildAssistTargetPickerRows,
  buildAssistClassButtonRows,
  buildAssistJoinModal,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
} = require('../src/interactions/assist-signup');
```

Add these helpers and the new `describe` block at the end of the file:

```js
function makeEvent(db, overrides = {}) {
  const event = createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 2,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
  updateEventThreadId(db, event.id, 'thread-1');
  return event;
}

function makeAssistModalInteraction({ customId, helperId, fieldValues, fetchedUser, fetchedMessage, thread }) {
  const fieldEntries = new Map(Object.entries(fieldValues).map(([id, value]) => [id, { value }]));
  return {
    customId,
    user: { id: helperId, username: helperId },
    fields: {
      getTextInputValue: (id) => {
        if (!fieldEntries.has(id)) {
          throw new Error(`Required field with custom id "${id}" not found.`);
        }
        return fieldEntries.get(id).value;
      },
      fields: fieldEntries,
    },
    deferUpdate: jest.fn(async () => {}),
    deleteReply: jest.fn(async () => {}),
    followUp: jest.fn(async () => {}),
    channel: { messages: { fetch: jest.fn(async () => fetchedMessage) } },
    client: {
      channels: { fetch: jest.fn(async () => thread) },
      users: { fetch: jest.fn(async () => fetchedUser) },
    },
  };
}

describe('handleAssistJoinModal', () => {
  test('signs up a real member under their own user id, tagged with who assisted them', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:user-9:冰雷`,
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1' },
      fetchedUser: { username: 'IceGuy' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleAssistJoinModal(interaction, db);

    expect(interaction.client.users.fetch).toHaveBeenCalledWith('user-9');
    const [signup] = getSignups(db, event.id);
    expect(signup).toMatchObject({ user_id: 'user-9', display_name: 'IceGuy', added_by_user_id: 'helper-1', is_external: 0 });
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('<@user-9>'));
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('由 <@helper-1> 代為報名'));
  });

  test('signs up a non-Discord friend under a synthetic external id with the typed nickname', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:external:冰雷`,
      helperId: 'helper-1',
      fieldValues: { nickname: '小明', level: '70', game_id: 'ming#1' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleAssistJoinModal(interaction, db);

    expect(interaction.client.users.fetch).not.toHaveBeenCalled();
    const [signup] = getSignups(db, event.id);
    expect(signup).toMatchObject({ display_name: '小明', added_by_user_id: 'helper-1', is_external: 1 });
    expect(signup.user_id.startsWith('ext:')).toBe(true);
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('**小明**'));
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('由 <@helper-1> 代為報名'));
  });

  test('replies with a follow-up and does nothing when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = makeAssistModalInteraction({
      customId: 'assist-join-modal:999:user-9:冰雷',
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1' },
    });

    await handleAssistJoinModal(interaction, db);

    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  test('replies with a follow-up and does not sign up when the event is full', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 1 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a' });

    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:user-9:冰雷`,
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1' },
      fetchedUser: { username: 'IceGuy' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleAssistJoinModal(interaction, db);

    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: '已經額滿了', ephemeral: true }));
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx jest tests/assist-signup.test.js`
Expected: FAIL — `handleAssistJoinModal` is `undefined`.

- [ ] **Step 7: Implement `handleAssistJoinModal` in `assist-signup.js`**

Add these `require`s to the top of `src/interactions/assist-signup.js` (merge with the existing `discord.js` require):

```js
const crypto = require('crypto');
const { getEventById, addSignup, getSignups, ADD_SIGNUP_FULL, ADD_SIGNUP_DUPLICATE } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');
const { tryAcknowledgeAndDeleteReply } = require('./ack');
const { getOptionalTextInputValue } = require('./join-modal');
```

Add this function after `handleAssistClassChoiceButton`:

```js
function generateExternalUserId() {
  return `ext:${crypto.randomUUID()}`;
}

async function handleAssistJoinModal(interaction, db) {
  const [, eventIdRaw, target, className] = interaction.customId.split(':');
  const eventId = Number.parseInt(eventIdRaw, 10);
  const event = getEventById(db, eventId);

  // Same reasoning as handleJoinModal: the signup itself doesn't depend on
  // this interaction's token, so it must be recorded even if the ack fails.
  const acked = await tryAcknowledgeAndDeleteReply(interaction);

  if (!event) {
    if (acked) {
      await interaction.followUp({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
    }
    return;
  }

  const level = interaction.fields.getTextInputValue('level');
  const gameId = interaction.fields.getTextInputValue('game_id');
  const note = getOptionalTextInputValue(interaction.fields, 'note');

  const isExternal = target === EXTERNAL_TARGET;
  const userId = isExternal ? generateExternalUserId() : target;
  const displayName = isExternal
    ? interaction.fields.getTextInputValue('nickname')
    : (await interaction.client.users.fetch(target)).username;

  const result = addSignup(db, event, {
    userId,
    displayName,
    className,
    level,
    gameId,
    note,
    addedByUserId: interaction.user.id,
    isExternal,
  });

  if (result === ADD_SIGNUP_DUPLICATE) {
    return;
  }
  if (result === ADD_SIGNUP_FULL) {
    if (acked) {
      await interaction.followUp({ content: '已經額滿了', ephemeral: true });
    }
    return;
  }

  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const message = await interaction.channel.messages.fetch(event.message_id);
  await message.edit({ embeds: [embed], components: [row] });

  const nameSegment = isExternal ? `**${displayName}**` : `<@${userId}>`;
  const noteSegment = note ? `／備註：${note}` : '';
  const thread = await interaction.client.channels.fetch(event.thread_id);
  await thread.send(`${nameSegment} 已報名（職業：${className}／等級：${level}／ID：${gameId}${noteSegment}），由 <@${interaction.user.id}> 代為報名`);
}
```

Update `module.exports` to add `handleAssistJoinModal`:

```js
module.exports = {
  EXTERNAL_TARGET,
  buildAssistTargetPickerRows,
  buildAssistClassButtonRows,
  buildAssistJoinModal,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
};
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest tests/assist-signup.test.js tests/join-modal.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/interactions/join-modal.js src/interactions/assist-signup.js tests/join-modal.test.js tests/assist-signup.test.js
git commit -m "Write assisted signups to the DB and announce them in the thread

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Cancel disambiguation

**Files:**
- Modify: `src/interactions/signup-button.js`
- Test: `tests/signup-button.test.js`

**Interfaces:**
- Consumes: `getSignupById`, `removeSignupById` (from `../db/db`, Task 1).
- Produces: `handleCancelButton(interaction, db)` — same signature, now handles 0/1/N cancellable signups; `handleCancelSelectButton(interaction, db)` — new export, handles the `cancel-select:{eventId}:{signupId}` button click.

- [ ] **Step 1: Write the failing tests**

In `tests/signup-button.test.js`, update the imports at the top:

```js
const { initDb, createEvent, updateEventThreadId, addSignup, getSignups } = require('../src/db/db');
const {
  buildClassButtonRows,
  buildClassButtonRowsForCustomIds,
  buildJoinDetailsModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
  CLASS_OPTIONS,
} = require('../src/interactions/signup-button');
```

Add these tests at the end of the file (after the existing `describe('handleCancelButton', ...)` block, before the file ends):

```js
describe('handleCancelButton with multiple cancellable signups', () => {
  test('shows a picker when the clicker has more than one cancellable signup', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 5 });
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, { userId: 'helper-1', displayName: 'Helper', className: '戰士', level: '70', gameId: 'h#1' });
    addSignup(db, event, {
      userId: 'ext:1', displayName: '小明', className: '法師', level: '65', gameId: 'm#1',
      addedByUserId: 'helper-1', isExternal: true,
    });

    const interaction = { customId: `cancel:${event.id}`, user: { id: 'helper-1' }, reply: jest.fn(async () => {}) };

    await handleCancelButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const payload = interaction.reply.mock.calls[0][0];
    expect(payload.ephemeral).toBe(true);
    expect(payload.content).toBe('請選擇要取消哪一筆報名：');
    expect(payload.components[0].components).toHaveLength(2);
  });

  test('the event creator can cancel an external signup added by someone else', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 5, creatorId: 'creator-1' });
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, {
      userId: 'ext:1', displayName: '小明', className: '法師', level: '65', gameId: 'm#1',
      addedByUserId: 'helper-1', isExternal: true,
    });

    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = {
      customId: `cancel:${event.id}`,
      user: { id: 'creator-1' },
      reply: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn(async () => editedMessage) } },
      client: { channels: { fetch: jest.fn(async () => thread) } },
    };

    await handleCancelButton(interaction, db);

    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('**小明**'));
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('由 <@creator-1> 代為取消'));
    expect(getSignups(db, event.id)).toHaveLength(0);
  });
});

describe('handleCancelSelectButton', () => {
  test('cancels the chosen signup and updates the picker message', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 5 });
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, {
      userId: 'ext:1', displayName: '小明', className: '法師', level: '65', gameId: 'm#1',
      addedByUserId: 'helper-1', isExternal: true,
    });
    const [signup] = getSignups(db, event.id);

    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = {
      customId: `cancel-select:${event.id}:${signup.id}`,
      user: { id: 'helper-1' },
      update: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn(async () => editedMessage) } },
      client: { channels: { fetch: jest.fn(async () => thread) } },
    };

    await handleCancelSelectButton(interaction, db);

    expect(getSignups(db, event.id)).toHaveLength(0);
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({ content: '已取消報名' }));
  });

  test('gracefully updates the message when the signup was already removed', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 5 });

    const interaction = {
      customId: `cancel-select:${event.id}:999`,
      user: { id: 'helper-1' },
      update: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn() } },
    };

    await handleCancelSelectButton(interaction, db);

    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({ content: '這筆報名已經不存在了' }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/signup-button.test.js`
Expected: FAIL — `handleCancelSelectButton` is `undefined`; the multi-candidate tests fail because the current `handleCancelButton` only ever looks at the clicker's own `user_id`.

- [ ] **Step 3: Rewrite the cancel logic in `signup-button.js`**

Replace the `require('../db/db')` line at the top:

```js
const {
  getEventById,
  getSignups,
  getSignupById,
  removeSignupById,
} = require('../db/db');
```

Replace the entire `handleCancelButton` function (and everything after it, down to `module.exports`) with:

```js
const CANCEL_BUTTONS_PER_ROW = 5;

function findCancellableSignups(signups, event, userId) {
  const isCreator = userId === event.creator_id;
  const seen = new Set();
  const candidates = [];
  for (const signup of signups) {
    const isOwn = signup.user_id === userId;
    const isAddedByMe = signup.added_by_user_id === userId;
    const isExternalAsCreator = isCreator && !!signup.is_external;
    if ((isOwn || isAddedByMe || isExternalAsCreator) && !seen.has(signup.id)) {
      seen.add(signup.id);
      candidates.push(signup);
    }
  }
  return candidates;
}

function buildCancelChoiceRows(eventId, candidates) {
  const buttons = candidates.map((signup) =>
    new ButtonBuilder()
      .setCustomId(`cancel-select:${eventId}:${signup.id}`)
      .setLabel(`${signup.display_name}（${signup.class}）`.slice(0, 80))
      .setStyle(ButtonStyle.Secondary),
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += CANCEL_BUTTONS_PER_ROW) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + CANCEL_BUTTONS_PER_ROW)));
  }
  return rows;
}

async function applyCancellation(interaction, db, event, signup) {
  removeSignupById(db, signup.id);

  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const message = await interaction.channel.messages.fetch(event.message_id);
  await message.edit({ embeds: [embed], components: [row] });

  const nameSegment = signup.is_external ? `**${signup.display_name}**` : `<@${signup.user_id}>`;
  const assistSegment = interaction.user.id === signup.user_id ? '' : `（由 <@${interaction.user.id}> 代為取消）`;
  const thread = await interaction.client.channels.fetch(event.thread_id);
  await thread.send(`${nameSegment} 已取消報名${assistSegment}`);
}

async function handleCancelButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
    return;
  }

  const signups = getSignups(db, event.id);
  const candidates = findCancellableSignups(signups, event, interaction.user.id);

  if (candidates.length === 0) {
    await interaction.deferUpdate();
    return;
  }

  if (candidates.length > 1) {
    await interaction.reply({
      content: '請選擇要取消哪一筆報名：',
      components: buildCancelChoiceRows(event.id, candidates),
      ephemeral: true,
    });
    return;
  }

  await applyCancellation(interaction, db, event, candidates[0]);
  await interaction.reply({ content: '已取消報名', ephemeral: true });
}

async function handleCancelSelectButton(interaction, db) {
  const [, eventIdRaw, signupIdRaw] = interaction.customId.split(':');
  const eventId = Number.parseInt(eventIdRaw, 10);
  const signupId = Number.parseInt(signupIdRaw, 10);
  const event = getEventById(db, eventId);
  const signup = event && getSignupById(db, signupId);

  if (!event || !signup) {
    await interaction.update({ content: '這筆報名已經不存在了', components: [] });
    return;
  }

  await applyCancellation(interaction, db, event, signup);
  await interaction.update({ content: '已取消報名', components: [] });
}

module.exports = {
  buildClassButtonRows,
  buildClassButtonRowsForCustomIds,
  buildJoinDetailsModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
  CLASS_OPTIONS,
};
```

(`buildEventEmbed`/`buildActionRow` are already imported at the top of the file from the original code — leave that `require('../embeds/event-embed')` line as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/signup-button.test.js`
Expected: PASS (all tests, including the 3 pre-existing `handleCancelButton` tests — their single-candidate behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/interactions/signup-button.js tests/signup-button.test.js
git commit -m "Let a signup's assister or the event creator cancel it too

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire the router and the bot entry point

**Files:**
- Modify: `src/interaction-router.js`
- Modify: `src/index.js`
- Test: `tests/interaction-router.test.js`

**Interfaces:**
- Consumes: `handleAssistButton`, `handleAssistUserSelect`, `handleAssistExternalButton`, `handleAssistClassChoiceButton`, `handleAssistJoinModal` (from `./interactions/assist-signup`, Tasks 3–4); `handleCancelSelectButton` (from `./interactions/signup-button`, Task 5).
- Produces: `createInteractionHandler({ ... })` accepts 5 new handler options (`handleAssistButton`, `handleAssistUserSelect`, `handleAssistExternalButton`, `handleAssistClassChoiceButton`, `handleAssistJoinModal`, `handleCancelSelectButton`) and routes `interaction.isUserSelectMenu()` interactions.

- [ ] **Step 1: Write the failing tests**

In `tests/interaction-router.test.js`, update `makeBaseInteraction` to default `isUserSelectMenu` to `false` (existing tests don't set it, and the router will now call it unconditionally):

```js
function makeBaseInteraction(overrides = {}) {
  return {
    isChatInputCommand: () => false,
    isUserSelectMenu: () => false,
    isButton: () => false,
    isModalSubmit: () => false,
    ...overrides,
  };
}
```

Update `makeHandlers` to include the new handler mocks:

```js
function makeHandlers(overrides = {}) {
  return {
    commands: new Map(),
    db: {},
    handleCreateEventModal: jest.fn(),
    handleJoinModal: jest.fn(),
    handleSignupButton: jest.fn(),
    handleClassChoiceButton: jest.fn(),
    handleTitleChoiceButton: jest.fn(),
    handleCancelButton: jest.fn(),
    handleCancelSelectButton: jest.fn(),
    handleAssistButton: jest.fn(),
    handleAssistUserSelect: jest.fn(),
    handleAssistExternalButton: jest.fn(),
    handleAssistClassChoiceButton: jest.fn(),
    handleAssistJoinModal: jest.fn(),
    ...overrides,
  };
}
```

Add these tests at the end of the `describe('createInteractionHandler', ...)` block:

```js
  test('routes assist-user-select menu submissions to handleAssistUserSelect', async () => {
    const handleAssistUserSelect = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleAssistUserSelect }));
    const interaction = makeBaseInteraction({ isUserSelectMenu: () => true, customId: 'assist-user-select:1' });

    await handle(interaction);

    expect(handleAssistUserSelect).toHaveBeenCalledWith(interaction);
  });

  test('routes assist button clicks to handleAssistButton', async () => {
    const handleAssistButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleAssistButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'assist:1' });

    await handle(interaction);

    expect(handleAssistButton).toHaveBeenCalledWith(interaction);
  });

  test('routes assist-external button clicks to handleAssistExternalButton', async () => {
    const handleAssistExternalButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleAssistExternalButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'assist-external:1' });

    await handle(interaction);

    expect(handleAssistExternalButton).toHaveBeenCalledWith(interaction);
  });

  test('routes assist-class-choice button clicks to handleAssistClassChoiceButton', async () => {
    const handleAssistClassChoiceButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleAssistClassChoiceButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'assist-class-choice:1:user-9:冰雷' });

    await handle(interaction);

    expect(handleAssistClassChoiceButton).toHaveBeenCalledWith(interaction);
  });

  test('routes cancel-select button clicks to handleCancelSelectButton with the db', async () => {
    const handleCancelSelectButton = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleCancelSelectButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'cancel-select:1:5' });

    await handle(interaction);

    expect(handleCancelSelectButton).toHaveBeenCalledWith(interaction, db);
  });

  test('routes assist-join-modal submissions to handleAssistJoinModal with the db', async () => {
    const handleAssistJoinModal = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleAssistJoinModal }));
    const interaction = makeBaseInteraction({ isModalSubmit: () => true, customId: 'assist-join-modal:1:user-9:冰雷' });

    await handle(interaction);

    expect(handleAssistJoinModal).toHaveBeenCalledWith(interaction, db);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/interaction-router.test.js`
Expected: FAIL — new routes aren't wired up yet; also existing button/modal tests may now throw if `isUserSelectMenu` isn't called safely (verify after Step 3).

- [ ] **Step 3: Update `src/interaction-router.js`**

Replace the whole file:

```js
function createInteractionHandler({
  commands,
  db,
  handleCreateEventModal,
  handleJoinModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleTitleChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
}) {
  return async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    if (interaction.isUserSelectMenu()) {
      const [action] = interaction.customId.split(':');
      if (action === 'assist-user-select') await handleAssistUserSelect(interaction);
      return;
    }

    if (interaction.isButton()) {
      const [action] = interaction.customId.split(':');
      if (action === 'signup') await handleSignupButton(interaction);
      if (action === 'class-choice') await handleClassChoiceButton(interaction);
      if (action === 'title-choice') await handleTitleChoiceButton(interaction);
      if (action === 'cancel') await handleCancelButton(interaction, db);
      if (action === 'cancel-select') await handleCancelSelectButton(interaction, db);
      if (action === 'assist') await handleAssistButton(interaction);
      if (action === 'assist-external') await handleAssistExternalButton(interaction);
      if (action === 'assist-class-choice') await handleAssistClassChoiceButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('create-event-modal:')) {
        await handleCreateEventModal(interaction, db);
        return;
      }
      if (interaction.customId.startsWith('join-modal:')) {
        await handleJoinModal(interaction, db);
        return;
      }
      if (interaction.customId.startsWith('assist-join-modal:')) {
        await handleAssistJoinModal(interaction, db);
      }
    }
  };
}

module.exports = { createInteractionHandler };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/interaction-router.test.js`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Wire the new handlers into `src/index.js`**

Replace the top of `src/index.js` (everything up to `const client = ...` stays after these changes):

```js
require('dotenv').config();
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { initDb } = require('./db/db');
const createEventCommand = require('./commands/create-event');
const { handleCreateEventModal } = require('./interactions/create-event-modal');
const { handleJoinModal } = require('./interactions/join-modal');
const {
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
} = require('./interactions/signup-button');
const { handleTitleChoiceButton } = require('./interactions/title-choice-button');
const {
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
} = require('./interactions/assist-signup');
const { createInteractionHandler } = require('./interaction-router');

const db = initDb(path.join(__dirname, '..', 'data.db'));
const commands = new Map([[createEventCommand.data.name, createEventCommand]]);

const handleInteraction = createInteractionHandler({
  commands,
  db,
  handleCreateEventModal,
  handleJoinModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleTitleChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
});
```

(Leave the rest of the file — the `client`, `Events.ClientReady`, `Events.InteractionCreate`, and `client.login(...)` lines — unchanged.)

- [ ] **Step 6: Run the full test suite**

Run: `npx jest`
Expected: PASS — every test file in `tests/` passes.

- [ ] **Step 7: Commit**

```bash
git add src/interaction-router.js src/index.js tests/interaction-router.test.js
git commit -m "Wire the 代報名 flow and cancel picker into the interaction router

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Post-implementation note

`data.db` in the repo root is the bot's live database. `migrateSignupsTable` (Task 1) makes the next `npm start` safe against it — no manual migration step is required — but it's worth restarting the bot process once after deploying this change so the columns exist before anyone clicks 代報名.
