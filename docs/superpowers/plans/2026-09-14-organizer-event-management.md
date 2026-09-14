# 團主管理揪團（改時間／取消揪團）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a boss event's creator (團主) edit its start time or cancel the whole event from two new buttons on the signup card.

**Architecture:** Two new customId-routed interactions (`edit-time` → modal → DB update + re-render; `cancel-event` → ephemeral confirm → notify + delete) added as a new `src/interactions/manage-event.js` module, wired through the existing `interaction-router.js` dispatch table exactly like every other button/modal handler in this codebase. No new tables; reuses `events.reminded_at` / `events.cleaned_at`.

**Tech Stack:** Node.js, discord.js v14, better-sqlite3, Jest.

**Spec:** `docs/superpowers/specs/2026-09-14-organizer-event-management-design.md`

## Global Constraints

- Editable event fields: `start_time` only. Session/title/capacity stay fixed. Cancel removes the whole event (message + thread), no partial/reversible "cancelled" state.
- Both new actions are triggered by buttons on the shared signup card (not a slash command); the buttons are visible to everyone, permission (`interaction.user.id === event.creator_id`) is checked at click time with an ephemeral rejection for non-creators.
- Cancelling deletes the announcement message and the thread immediately (same as `cleanup.js`'s post-event cleanup), after posting a notice mentioning signed-up members into the thread.
- Editing the time resets `reminded_at` to `NULL` so the 60-minutes-before reminder can fire again for the new time.
- Every interaction handler that does multiple slow `await`s (DB + several Discord API calls) must ack the interaction immediately (`tryAcknowledgeAndDeleteReply` for modal submits, `interaction.update` for the cancel-confirm button) before doing that work, matching `handleCreateEventModal`'s existing reasoning.
- Follow existing code conventions: customId format `action:eventId[:...]`, `getEventById` + not-found ephemeral reply pattern from `handleCancelButton`, `isAlreadyGoneError`/`deleteIfPresent`/`editIfPresent` for messages or threads that may already be gone.

---

## Task 1: DB — `updateEventStartTime`

**Files:**
- Modify: `src/db/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Produces: `updateEventStartTime(db, eventId, startTime)` — `UPDATE events SET start_time = ?, reminded_at = NULL WHERE id = ?`. No return value (matches `updateEventThreadId` etc.).

- [ ] **Step 1: Write the failing tests**

Add to `tests/db.test.js` (needs `updateEventStartTime` added to the destructured import at the top and `markEventReminded` is already imported):

```js
  test('updateEventStartTime updates start_time and resets reminded_at to null', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    markEventReminded(db, event.id, '2026-07-12T19:00:00.000Z');

    updateEventStartTime(db, event.id, '7/13 21:30');

    const updated = getEventById(db, event.id);
    expect(updated.start_time).toBe('7/13 21:30');
    expect(updated.reminded_at).toBeNull();
  });

  test('updateEventStartTime leaves reminded_at null when it was already null', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);

    updateEventStartTime(db, event.id, '7/13 21:30');

    expect(getEventById(db, event.id).reminded_at).toBeNull();
  });
```

Add `updateEventStartTime` to the `require('../src/db/db')` destructure at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/db.test.js -t updateEventStartTime`
Expected: FAIL — `updateEventStartTime is not a function`

- [ ] **Step 3: Implement**

In `src/db/db.js`, add after `updateEventThreadMessageId`:

```js
function updateEventStartTime(db, eventId, startTime) {
  db.prepare('UPDATE events SET start_time = ?, reminded_at = NULL WHERE id = ?').run(startTime, eventId);
}
```

Add `updateEventStartTime` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/db.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/db/db.js tests/db.test.js
git commit -m "Add updateEventStartTime db helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Signup card — second button row (`buildManagementRow`)

**Files:**
- Modify: `src/embeds/event-embed.js`
- Test: `tests/event-embed.test.js`

**Interfaces:**
- Produces: `buildManagementRow(eventId)` — returns an `ActionRowBuilder` with two buttons: `edit-time:<eventId>` (label `⏰ 改時間`, `ButtonStyle.Secondary`) and `cancel-event:<eventId>` (label `🗑️ 取消揪團`, `ButtonStyle.Danger`).
- `updateEventAnnouncement`'s rendered payload now has `components: [row, managementRow]` instead of `components: [row]` — every caller that reads `payload.components` needs to expect length 2, not 1.

- [ ] **Step 1: Write the failing test for `buildManagementRow`**

Add to `tests/event-embed.test.js`, after the `describe('buildActionRow', ...)` block. Also add `const { ButtonStyle } = require('discord.js');` near the top of the file and `buildManagementRow` to the destructured import from `../src/embeds/event-embed`.

```js
describe('buildManagementRow', () => {
  test('has an edit-time button (Secondary) and a cancel-event button (Danger), both scoped to the event id', () => {
    const row = buildManagementRow(42);
    expect(row.components).toHaveLength(2);

    const [editTime, cancelEvent] = row.components;
    expect(editTime.data.custom_id).toBe('edit-time:42');
    expect(editTime.data.label).toBe('⏰ 改時間');
    expect(editTime.data.style).toBe(ButtonStyle.Secondary);

    expect(cancelEvent.data.custom_id).toBe('cancel-event:42');
    expect(cancelEvent.data.label).toBe('🗑️ 取消揪團');
    expect(cancelEvent.data.style).toBe(ButtonStyle.Danger);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/event-embed.test.js -t buildManagementRow`
Expected: FAIL — `buildManagementRow is not a function`

- [ ] **Step 3: Implement `buildManagementRow`**

In `src/embeds/event-embed.js`, add after `buildActionRow`:

```js
function buildManagementRow(eventId) {
  const editTimeButton = new ButtonBuilder()
    .setCustomId(`edit-time:${eventId}`)
    .setLabel('⏰ 改時間')
    .setStyle(ButtonStyle.Secondary);

  const cancelEventButton = new ButtonBuilder()
    .setCustomId(`cancel-event:${eventId}`)
    .setLabel('🗑️ 取消揪團')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(editTimeButton, cancelEventButton);
}
```

Add `buildManagementRow` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/event-embed.test.js -t buildManagementRow`
Expected: PASS

- [ ] **Step 5: Update the existing `updateEventAnnouncement` test to expect two rows (make it fail first)**

In `tests/event-embed.test.js`, change line 193 (inside `'fetches the announcement message and edits it with the rebuilt embed and row'`):

```js
    expect(payload.components).toHaveLength(1);
```
to:
```js
    expect(payload.components).toHaveLength(2);
```

- [ ] **Step 6: Run test to verify it now fails**

Run: `npx jest tests/event-embed.test.js -t "fetches the announcement message"`
Expected: FAIL — received length 1, expected 2 (implementation not changed yet)

- [ ] **Step 7: Wire `buildManagementRow` into `updateEventAnnouncement`**

In `src/embeds/event-embed.js`, inside `updateEventAnnouncement`, change:

```js
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);
  const payload = { embeds: [embed], components: [row] };
```
to:
```js
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);
  const managementRow = buildManagementRow(event.id);
  const payload = { embeds: [embed], components: [row, managementRow] };
```

- [ ] **Step 8: Run the full file to verify everything passes**

Run: `npx jest tests/event-embed.test.js`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add src/embeds/event-embed.js tests/event-embed.test.js
git commit -m "Add a second signup-card button row for organizer management actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Wire the management row into event creation

**Files:**
- Modify: `src/interactions/create-event-modal.js`
- Test: `tests/create-event-modal.test.js`

**Interfaces:**
- Consumes: `buildManagementRow(eventId)` from Task 2.

- [ ] **Step 1: Update the existing tests to expect two component rows (make them fail first)**

In `tests/create-event-modal.test.js`, change both:
```js
    expect(sentPayload.components).toHaveLength(1);
```
and
```js
    expect(threadPayload.components).toHaveLength(1);
```
to `toHaveLength(2)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/create-event-modal.test.js -t "posts the embed to the channel"`
Expected: FAIL — received length 1, expected 2

- [ ] **Step 3: Implement**

In `src/interactions/create-event-modal.js`:

1. Change the import line:
```js
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');
```
to:
```js
const { buildEventEmbed, buildActionRow, buildManagementRow } = require('../embeds/event-embed');
```

2. In `handleCreateEventModal`, change:
```js
  const embed = buildEventEmbed(event, []);
  const row = buildActionRow(event, 0);

  const message = await interaction.channel.send({ embeds: [embed], components: [row] });
  updateEventMessageId(db, event.id, message.id);

  const thread = await message.startThread({ name: `${startTime} ${title} ${session}場`.slice(0, 100) });
  updateEventThreadId(db, event.id, thread.id);

  const threadMessage = await thread.send({ embeds: [embed], components: [row] });
```
to:
```js
  const embed = buildEventEmbed(event, []);
  const row = buildActionRow(event, 0);
  const managementRow = buildManagementRow(event.id);

  const message = await interaction.channel.send({ embeds: [embed], components: [row, managementRow] });
  updateEventMessageId(db, event.id, message.id);

  const thread = await message.startThread({ name: `${startTime} ${title} ${session}場`.slice(0, 100) });
  updateEventThreadId(db, event.id, thread.id);

  const threadMessage = await thread.send({ embeds: [embed], components: [row, managementRow] });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/create-event-modal.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/interactions/create-event-modal.js tests/create-event-modal.test.js
git commit -m "Include the management button row when posting a new event's signup card

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `manage-event.js` — creator check and the edit-time modal builder

**Files:**
- Modify: `src/interactions/title-choice-button.js` (export reusable option builders)
- Test: `tests/title-choice-button.test.js`
- Create: `src/interactions/manage-event.js`
- Test: `tests/manage-event.test.js`

**Interfaces:**
- Consumes: `buildDateOptions(now)`, `HOUR_OPTIONS`, `MINUTE_OPTIONS` (existing logic in `title-choice-button.js`, currently private).
- Produces: `requireCreator(interaction, event)` — resolves `true` when `interaction.user.id === event.creator_id`; otherwise sends `{ content: '只有團主能操作', ephemeral: true }` via `interaction.reply` and resolves `false`.
- Produces: `buildEditTimeModal(eventId, currentStartTime, now = new Date())` — a `ModalBuilder` with customId `edit-time-modal:<eventId>`, title `修改揪團時間`, and the same date/hour/minute `LabelBuilder` + `StringSelectMenuBuilder` layout as `buildCreateEventModal`, pre-selecting the option matching `currentStartTime` (falling back to today's date when it's outside the 7-day window).

- [ ] **Step 1: Export the reusable option builders**

In `src/interactions/title-choice-button.js`, add `buildDateOptions`, `HOUR_OPTIONS`, `MINUTE_OPTIONS` to `module.exports`:

```js
module.exports = {
  buildCreateEventModal,
  buildSessionButtonRow,
  handleTitleChoiceButton,
  handleSessionChoiceButton,
  SESSION_OPTIONS,
  buildDateOptions,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
};
```

- [ ] **Step 2: Write a small direct test proving the export**

Add to `tests/title-choice-button.test.js` (add `buildDateOptions, HOUR_OPTIONS, MINUTE_OPTIONS` to the top import):

```js
describe('reusable option builders (exported for the edit-time modal)', () => {
  test('buildDateOptions, HOUR_OPTIONS, and MINUTE_OPTIONS are exported', () => {
    expect(typeof buildDateOptions).toBe('function');
    expect(HOUR_OPTIONS).toHaveLength(24);
    expect(MINUTE_OPTIONS).toEqual(['00', '10', '20', '30', '40', '50']);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx jest tests/title-choice-button.test.js`
Expected: PASS (export was a pure addition, nothing to fail first here)

- [ ] **Step 4: Write the failing tests for `requireCreator` and `buildEditTimeModal`**

Create `tests/manage-event.test.js`:

```js
const {
  requireCreator,
  buildEditTimeModal,
} = require('../src/interactions/manage-event');

describe('requireCreator', () => {
  test('resolves true and does not reply when the clicker is the creator', async () => {
    const interaction = { user: { id: 'creator-1' }, reply: jest.fn(async () => {}) };
    const event = { creator_id: 'creator-1' };

    const result = await requireCreator(interaction, event);

    expect(result).toBe(true);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  test('replies ephemeral and resolves false when the clicker is not the creator', async () => {
    const interaction = { user: { id: 'someone-else' }, reply: jest.fn(async () => {}) };
    const event = { creator_id: 'creator-1' };

    const result = await requireCreator(interaction, event);

    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith({ content: '只有團主能操作', ephemeral: true });
  });
});

describe('buildEditTimeModal', () => {
  const now = new Date(2026, 8, 5); // Sat 2026-09-05

  test('customId embeds the event id, title mentions editing the time', () => {
    const modal = buildEditTimeModal(42, '9/6 21:30', now);
    expect(modal.data.custom_id).toBe('edit-time-modal:42');
    expect(modal.data.title).toBe('修改揪團時間');
  });

  test('has three label components wrapping the date, hour, and minute selects', () => {
    const modal = buildEditTimeModal(42, '9/6 21:30', now);
    expect(modal.components).toHaveLength(3);
    expect(modal.components.map((label) => label.data.label)).toEqual(['日期', '時', '分']);
    expect(modal.components.map((label) => label.data.component.data.custom_id)).toEqual([
      'event_date',
      'event_hour',
      'event_minute',
    ]);
  });

  test('pre-selects the date, hour, and minute matching the current start time', () => {
    const modal = buildEditTimeModal(42, '9/6 21:30', now);
    const [dateSelect, hourSelect, minuteSelect] = modal.components.map((label) => label.data.component);

    expect(dateSelect.options.find((o) => o.data.default).data.value).toBe('9/6');
    expect(dateSelect.options.filter((o) => o.data.default)).toHaveLength(1);
    expect(hourSelect.options.find((o) => o.data.default).data.value).toBe('21');
    expect(minuteSelect.options.find((o) => o.data.default).data.value).toBe('30');
  });

  test('falls back to selecting today when the current date is outside the 7-day window', () => {
    const modal = buildEditTimeModal(42, '1/1 21:30', now);
    const dateSelect = modal.components[0].data.component;

    expect(dateSelect.options.filter((o) => o.data.default)).toHaveLength(1);
    expect(dateSelect.options.find((o) => o.data.default).data.value).toBe('9/5');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx jest tests/manage-event.test.js`
Expected: FAIL — `Cannot find module '../src/interactions/manage-event'`

- [ ] **Step 6: Implement**

Create `src/interactions/manage-event.js`:

```js
const {
  ModalBuilder,
  LabelBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { buildDateOptions, HOUR_OPTIONS, MINUTE_OPTIONS } = require('./title-choice-button');

const NOT_FOUND_MESSAGE = '找不到這個揪團，可能已經被刪除了';

async function requireCreator(interaction, event) {
  if (interaction.user.id !== event.creator_id) {
    await interaction.reply({ content: '只有團主能操作', ephemeral: true });
    return false;
  }
  return true;
}

function parseStartTime(startTime) {
  const [date, time] = startTime.split(' ');
  const [hour, minute] = time.split(':');
  return { date, hour, minute };
}

function buildEditTimeModal(eventId, currentStartTime, now = new Date()) {
  const { date: currentDate, hour: currentHour, minute: currentMinute } = parseStartTime(currentStartTime);

  const modal = new ModalBuilder()
    .setCustomId(`edit-time-modal:${eventId}`)
    .setTitle('修改揪團時間');

  const dateOptions = buildDateOptions(now).map((option) => ({ ...option, default: option.value === currentDate }));
  // buildDateOptions only offers the next 7 days, so an event whose current
  // date has already rolled out of that window (or is stale data) has no
  // matching option — fall back to marking today as default, same as the
  // create flow always does.
  if (!dateOptions.some((option) => option.default)) {
    dateOptions[0] = { ...dateOptions[0], default: true };
  }

  const dateSelect = new StringSelectMenuBuilder()
    .setCustomId('event_date')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(dateOptions);

  const hourSelect = new StringSelectMenuBuilder()
    .setCustomId('event_hour')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(HOUR_OPTIONS.map((hour) => ({ label: hour, value: hour, default: hour === currentHour })));

  const minuteSelect = new StringSelectMenuBuilder()
    .setCustomId('event_minute')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(MINUTE_OPTIONS.map((minute) => ({ label: minute, value: minute, default: minute === currentMinute })));

  modal.addLabelComponents(
    new LabelBuilder().setLabel('日期').setStringSelectMenuComponent(dateSelect),
    new LabelBuilder().setLabel('時').setStringSelectMenuComponent(hourSelect),
    new LabelBuilder().setLabel('分').setStringSelectMenuComponent(minuteSelect),
  );

  return modal;
}

module.exports = {
  NOT_FOUND_MESSAGE,
  requireCreator,
  buildEditTimeModal,
};
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest tests/manage-event.test.js tests/title-choice-button.test.js`
Expected: PASS (all tests)

- [ ] **Step 8: Commit**

```bash
git add src/interactions/title-choice-button.js src/interactions/manage-event.js tests/title-choice-button.test.js tests/manage-event.test.js
git commit -m "Add requireCreator permission check and the edit-time modal builder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Edit-time flow (`handleEditTimeButton`, `handleEditTimeModal`)

**Files:**
- Modify: `src/reminders.js` (export `buildMentionSegment`)
- Modify: `src/interactions/manage-event.js`
- Test: `tests/manage-event.test.js`

**Interfaces:**
- Consumes: `buildMentionSegment(signup)` from `src/reminders.js`; `getEventById`, `getSignups`, `updateEventStartTime` from `src/db/db.js`; `updateEventAnnouncement` from `src/embeds/event-embed.js`; `isValidStartTime` from `src/interactions/create-event-modal.js`; `tryAcknowledgeAndDeleteReply` from `src/interactions/ack.js`; `isAlreadyGoneError` from `src/discord-errors.js`; `requireCreator`, `buildEditTimeModal`, `NOT_FOUND_MESSAGE` from Task 4.
- Produces: `handleEditTimeButton(interaction, db)`, `handleEditTimeModal(interaction, db)`.

- [ ] **Step 1: Export `buildMentionSegment` from `reminders.js`**

In `src/reminders.js`, change the final line:
```js
module.exports = { resolveEventStartDateTime, checkAndSendReminders, REMINDER_LEAD_MINUTES, REMINDER_POLL_INTERVAL_MS };
```
to:
```js
module.exports = {
  resolveEventStartDateTime,
  checkAndSendReminders,
  buildMentionSegment,
  REMINDER_LEAD_MINUTES,
  REMINDER_POLL_INTERVAL_MS,
};
```

(No new test needed here — `buildMentionSegment` already has behavioral coverage via `checkAndSendReminders`' existing tests in `tests/reminders.test.js`; this is a pure export addition, verified indirectly by Step 4 below actually calling it.)

- [ ] **Step 2: Write the failing tests for `handleEditTimeButton`**

Add to `tests/manage-event.test.js`. First add these imports/helpers near the top (below the existing `require`):

```js
const { initDb, getEventById, createEvent, updateEventThreadId, updateEventThreadMessageId, addSignup, markEventReminded } = require('../src/db/db');
const { handleEditTimeButton, handleEditTimeModal } = require('../src/interactions/manage-event');

function makeEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 5,
    session: 3,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}
```

(Also add `handleEditTimeButton, handleEditTimeModal` to the existing `require('../src/interactions/manage-event')` destructure at the top of the file instead of a second require line.)

```js
describe('handleEditTimeButton', () => {
  test('shows the edit-time modal when the clicker is the creator', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '9/6 21:30' });
    const interaction = {
      customId: `edit-time:${event.id}`,
      user: { id: 'creator-1' },
      showModal: jest.fn(),
      reply: jest.fn(async () => {}),
    };

    await handleEditTimeButton(interaction, db);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.showModal.mock.calls[0][0].data.custom_id).toBe(`edit-time-modal:${event.id}`);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  test('replies ephemeral without showing the modal when the clicker is not the creator', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const interaction = {
      customId: `edit-time:${event.id}`,
      user: { id: 'someone-else' },
      showModal: jest.fn(),
      reply: jest.fn(async () => {}),
    };

    await handleEditTimeButton(interaction, db);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({ content: '只有團主能操作', ephemeral: true });
  });

  test('replies with an error when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = {
      customId: 'edit-time:999',
      user: { id: 'creator-1' },
      showModal: jest.fn(),
      reply: jest.fn(async () => {}),
    };

    await handleEditTimeButton(interaction, db);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/manage-event.test.js -t handleEditTimeButton`
Expected: FAIL — `handleEditTimeButton is not a function`

- [ ] **Step 4: Implement `handleEditTimeButton`**

In `src/interactions/manage-event.js`, add imports at the top:

```js
const { getEventById, getSignups, updateEventStartTime } = require('../db/db');
const { updateEventAnnouncement } = require('../embeds/event-embed');
const { isValidStartTime } = require('./create-event-modal');
const { tryAcknowledgeAndDeleteReply } = require('./ack');
const { buildMentionSegment } = require('../reminders');
const { isAlreadyGoneError } = require('../discord-errors');
```

Add the handler (after `buildEditTimeModal`):

```js
async function handleEditTimeButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: NOT_FOUND_MESSAGE, ephemeral: true });
    return;
  }

  if (!(await requireCreator(interaction, event))) return;

  await interaction.showModal(buildEditTimeModal(event.id, event.start_time));
}
```

Add `handleEditTimeButton` to `module.exports`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/manage-event.test.js -t handleEditTimeButton`
Expected: PASS

- [ ] **Step 6: Write the failing tests for `handleEditTimeModal`**

Add to `tests/manage-event.test.js`:

```js
function makeEditTimeInteraction({ eventId, date, hour, minute, deferUpdateFails = false, channelsById = {} }) {
  const selectValues = { event_date: date, event_hour: hour, event_minute: minute };
  return {
    customId: `edit-time-modal:${eventId}`,
    fields: { getStringSelectValues: (id) => [selectValues[id]] },
    deferUpdate: jest.fn(async () => {
      if (deferUpdateFails) throw new Error('Unknown interaction');
    }),
    deleteReply: jest.fn(async () => {}),
    followUp: jest.fn(async () => {}),
    // Mirrors event-embed.test.js's makeClient: a channelsById entry that is
    // an Error is thrown (simulating a deleted channel/thread), not returned.
    client: {
      channels: {
        fetch: jest.fn(async (id) => {
          const entry = channelsById[id];
          if (entry instanceof Error) throw entry;
          return entry;
        }),
      },
    },
  };
}

describe('handleEditTimeModal', () => {
  test('updates start_time, resets reminded_at, refreshes both card copies, renames the thread, and notifies it', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '7/12 20:00' });
    updateEventThreadId(db, event.id, 'thread-1');
    updateEventThreadMessageId(db, event.id, 'thread-message-1');
    markEventReminded(db, event.id, '2026-07-12T19:00:00.000Z');
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });

    const channelMessage = { edit: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => channelMessage) } };
    const threadMessage = { edit: jest.fn(async () => {}) };
    const thread = {
      messages: { fetch: jest.fn(async () => threadMessage) },
      setName: jest.fn(async () => {}),
      send: jest.fn(async () => {}),
    };
    const interaction = makeEditTimeInteraction({
      eventId: event.id,
      date: '7/13',
      hour: '21',
      minute: '30',
      channelsById: { 'channel-1': channel, 'thread-1': thread },
    });

    await handleEditTimeModal(interaction, db);

    expect(getEventById(db, event.id)).toMatchObject({ start_time: '7/13 21:30', reminded_at: null });
    expect(channelMessage.edit).toHaveBeenCalledTimes(1);
    expect(threadMessage.edit).toHaveBeenCalledTimes(1);
    expect(thread.setName).toHaveBeenCalledWith('7/13 21:30 週三夜間團 3場');
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('⏰ 開團時間已改為 7/13 21:30'),
    }));
    expect(interaction.followUp).toHaveBeenCalledWith({ content: '已更新時間', ephemeral: true });
  });

  test('rejects an invalid composed time without touching the event', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '7/12 20:00' });
    const interaction = makeEditTimeInteraction({ eventId: event.id, date: '13/40', hour: '21', minute: '30' });

    await handleEditTimeModal(interaction, db);

    expect(getEventById(db, event.id).start_time).toBe('7/12 20:00');
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '時間格式錯誤，請重新點選「⏰ 改時間」設定',
      ephemeral: true,
    });
  });

  test('does nothing (but does not throw) when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = makeEditTimeInteraction({ eventId: 999, date: '7/13', hour: '21', minute: '30' });

    await expect(handleEditTimeModal(interaction, db)).resolves.not.toThrow();
    expect(interaction.followUp).toHaveBeenCalledWith({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
  });

  test('still updates the event and both card copies when the ack fails (stale interaction)', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '7/12 20:00' });
    updateEventThreadId(db, event.id, 'thread-1');
    updateEventThreadMessageId(db, event.id, 'thread-message-1');

    const channelMessage = { edit: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => channelMessage) } };
    const threadMessage = { edit: jest.fn(async () => {}) };
    const thread = {
      messages: { fetch: jest.fn(async () => threadMessage) },
      setName: jest.fn(async () => {}),
      send: jest.fn(async () => {}),
    };
    const interaction = makeEditTimeInteraction({
      eventId: event.id,
      date: '7/13',
      hour: '21',
      minute: '30',
      deferUpdateFails: true,
      channelsById: { 'channel-1': channel, 'thread-1': thread },
    });

    await handleEditTimeModal(interaction, db);

    expect(getEventById(db, event.id).start_time).toBe('7/13 21:30');
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  test('still finishes updating the event when the thread was already deleted', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '7/12 20:00' });
    updateEventThreadId(db, event.id, 'thread-1');

    const channelMessage = { edit: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => channelMessage) } };
    const unknownChannel = Object.assign(new Error('Unknown Channel'), { code: 10003 });
    const interaction = makeEditTimeInteraction({
      eventId: event.id,
      date: '7/13',
      hour: '21',
      minute: '30',
      channelsById: { 'channel-1': channel, 'thread-1': unknownChannel },
    });

    await expect(handleEditTimeModal(interaction, db)).resolves.not.toThrow();
    expect(getEventById(db, event.id).start_time).toBe('7/13 21:30');
    expect(interaction.followUp).toHaveBeenCalledWith({ content: '已更新時間', ephemeral: true });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest tests/manage-event.test.js -t handleEditTimeModal`
Expected: FAIL — `handleEditTimeModal is not a function`

- [ ] **Step 8: Implement `handleEditTimeModal`**

In `src/interactions/manage-event.js`, add:

```js
async function notifyThreadOfNewTime(client, event, startTime, signups) {
  if (!event.thread_id) return;

  try {
    const thread = await client.channels.fetch(event.thread_id);
    await thread.setName(`${startTime} ${event.title} ${event.session}場`.slice(0, 100));

    const mentions = signups.map(buildMentionSegment).join(' ');
    const mentionableUserIds = signups.filter((s) => !s.is_external).map((s) => s.user_id);
    await thread.send({
      content: `⏰ 開團時間已改為 ${startTime}，已報名的人請留意：${mentions || '（目前尚無人報名）'}`,
      allowedMentions: { users: mentionableUserIds },
    });
  } catch (error) {
    if (!isAlreadyGoneError(error)) throw error;
  }
}

async function handleEditTimeModal(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const date = interaction.fields.getStringSelectValues('event_date')[0];
  const hour = interaction.fields.getStringSelectValues('event_hour')[0];
  const minute = interaction.fields.getStringSelectValues('event_minute')[0];
  const startTime = `${date} ${hour}:${minute}`;

  // Multiple slow steps follow (DB write, two message edits, thread rename,
  // thread notification) — ack immediately so none of that races Discord's
  // 3-second interaction window, same reasoning as handleCreateEventModal.
  const acked = await tryAcknowledgeAndDeleteReply(interaction);

  if (!isValidStartTime(startTime)) {
    if (acked) {
      await interaction.followUp({ content: '時間格式錯誤，請重新點選「⏰ 改時間」設定', ephemeral: true });
    }
    return;
  }

  const event = getEventById(db, eventId);
  if (!event) {
    if (acked) {
      await interaction.followUp({ content: NOT_FOUND_MESSAGE, ephemeral: true });
    }
    return;
  }

  updateEventStartTime(db, event.id, startTime);
  const updatedEvent = getEventById(db, event.id);
  const signups = getSignups(db, event.id);

  await updateEventAnnouncement(interaction.client, updatedEvent, signups);
  await notifyThreadOfNewTime(interaction.client, event, startTime, signups);

  if (acked) {
    await interaction.followUp({ content: '已更新時間', ephemeral: true });
  }
}
```

Add `handleEditTimeModal` to `module.exports`.

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest tests/manage-event.test.js`
Expected: PASS (all tests)

- [ ] **Step 10: Commit**

```bash
git add src/reminders.js src/interactions/manage-event.js tests/manage-event.test.js
git commit -m "Implement the edit-time flow: modal submit updates start_time and re-announces

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Cancel-event flow

**Files:**
- Modify: `src/cleanup.js` (export `deleteIfPresent`)
- Modify: `src/interactions/manage-event.js`
- Test: `tests/manage-event.test.js`

**Interfaces:**
- Consumes: `deleteIfPresent(fetchAndDelete)` from `src/cleanup.js`; `markEventCleaned`, `markEventReminded` from `src/db/db.js`.
- Produces: `buildCancelConfirmRow(eventId)`, `handleCancelEventButton(interaction, db)`, `handleCancelEventConfirmButton(interaction, db)`, `handleCancelEventAbortButton(interaction)`.

- [ ] **Step 1: Export `deleteIfPresent` from `cleanup.js`**

In `src/cleanup.js`, change:
```js
module.exports = { checkAndCleanupEvents, CLEANUP_DELAY_MS, CLEANUP_POLL_INTERVAL_MS };
```
to:
```js
module.exports = { checkAndCleanupEvents, deleteIfPresent, CLEANUP_DELAY_MS, CLEANUP_POLL_INTERVAL_MS };
```

(No new test needed — `deleteIfPresent` already has behavioral coverage via `checkAndCleanupEvents`'s existing tests in `tests/cleanup.test.js`; Step 4 below exercises it again through `handleCancelEventConfirmButton`.)

- [ ] **Step 2: Write the failing tests**

Add to `tests/manage-event.test.js`. Add these to the top-of-file imports:

```js
const { ButtonStyle } = require('discord.js');
const { markEventCleaned } = require('../src/db/db'); // add to the existing db destructure instead of a new line
const {
  buildCancelConfirmRow,
  handleCancelEventButton,
  handleCancelEventConfirmButton,
  handleCancelEventAbortButton,
} = require('../src/interactions/manage-event'); // merge into the existing manage-event destructure
```

```js
describe('buildCancelConfirmRow', () => {
  test('builds a confirm (Danger) and abort (Secondary) button pair scoped to the event', () => {
    const row = buildCancelConfirmRow(42);
    expect(row.components).toHaveLength(2);

    const [confirm, abort] = row.components;
    expect(confirm.data.custom_id).toBe('cancel-event-confirm:42');
    expect(confirm.data.label).toBe('確定取消');
    expect(confirm.data.style).toBe(ButtonStyle.Danger);

    expect(abort.data.custom_id).toBe('cancel-event-abort');
    expect(abort.data.label).toBe('算了');
    expect(abort.data.style).toBe(ButtonStyle.Secondary);
  });
});

describe('handleCancelEventButton', () => {
  test('shows the confirm prompt when the clicker is the creator', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const interaction = { customId: `cancel-event:${event.id}`, user: { id: 'creator-1' }, reply: jest.fn(async () => {}) };

    await handleCancelEventButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '確定要取消整個揪團嗎？此動作無法復原',
      components: [expect.anything()],
      ephemeral: true,
    });
    const payload = interaction.reply.mock.calls[0][0];
    expect(payload.components[0].components[0].data.custom_id).toBe(`cancel-event-confirm:${event.id}`);
  });

  test('replies ephemeral without a confirm prompt when the clicker is not the creator', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const interaction = { customId: `cancel-event:${event.id}`, user: { id: 'someone-else' }, reply: jest.fn(async () => {}) };

    await handleCancelEventButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith({ content: '只有團主能操作', ephemeral: true });
  });

  test('replies with an error when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = { customId: 'cancel-event:999', user: { id: 'creator-1' }, reply: jest.fn(async () => {}) };

    await handleCancelEventButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
  });
});

describe('handleCancelEventAbortButton', () => {
  test('dismisses the confirmation prompt without touching anything else', async () => {
    const interaction = { update: jest.fn(async () => {}) };

    await handleCancelEventAbortButton(interaction);

    expect(interaction.update).toHaveBeenCalledWith({ content: '已取消操作', components: [] });
  });
});

describe('handleCancelEventConfirmButton', () => {
  function makeCancelInteraction(eventId, channelsById = {}) {
    return {
      customId: `cancel-event-confirm:${eventId}`,
      update: jest.fn(async () => {}),
      client: { channels: { fetch: jest.fn(async (id) => channelsById[id]) } },
    };
  }

  test('acks immediately, notifies the thread, deletes the announcement and thread, and marks the event cleaned', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });

    const message = { delete: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => message) } };
    const thread = { send: jest.fn(async () => {}), delete: jest.fn(async () => {}) };
    const interaction = makeCancelInteraction(event.id, { 'channel-1': channel, 'thread-1': thread });

    await handleCancelEventConfirmButton(interaction, db);

    expect(interaction.update).toHaveBeenCalledWith({ content: '正在取消揪團…', components: [] });
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('本次揪團已由團主取消'),
    }));
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(thread.delete).toHaveBeenCalledTimes(1);

    const updated = getEventById(db, event.id);
    expect(updated.cleaned_at).not.toBeNull();
    expect(updated.reminded_at).not.toBeNull();
  });

  test('does not overwrite an already-set reminded_at', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    updateEventThreadId(db, event.id, 'thread-1');
    markEventReminded(db, event.id, '2026-07-12T19:00:00.000Z');

    const message = { delete: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => message) } };
    const thread = { send: jest.fn(async () => {}), delete: jest.fn(async () => {}) };
    const interaction = makeCancelInteraction(event.id, { 'channel-1': channel, 'thread-1': thread });

    await handleCancelEventConfirmButton(interaction, db);

    expect(getEventById(db, event.id).reminded_at).toBe('2026-07-12T19:00:00.000Z');
  });

  test('does nothing further (and does not throw) when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = makeCancelInteraction(999);

    await expect(handleCancelEventConfirmButton(interaction, db)).resolves.not.toThrow();
    expect(interaction.client.channels.fetch).not.toHaveBeenCalled();
  });

  test('still marks the event cleaned when the announcement message was already deleted', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    updateEventThreadId(db, event.id, 'thread-1');

    const unknownMessage = Object.assign(new Error('Unknown Message'), { code: 10008 });
    const channel = { messages: { fetch: jest.fn(async () => { throw unknownMessage; }) } };
    const thread = { send: jest.fn(async () => {}), delete: jest.fn(async () => {}) };
    const interaction = makeCancelInteraction(event.id, { 'channel-1': channel, 'thread-1': thread });

    await expect(handleCancelEventConfirmButton(interaction, db)).resolves.not.toThrow();
    expect(thread.delete).toHaveBeenCalledTimes(1);
    expect(getEventById(db, event.id).cleaned_at).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/manage-event.test.js -t "buildCancelConfirmRow|handleCancelEvent"`
Expected: FAIL — the four new exports don't exist yet

- [ ] **Step 4: Implement**

In `src/interactions/manage-event.js`, add imports at the top:

```js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { markEventCleaned, markEventReminded } = require('../db/db'); // merge into the existing db/db destructure
const { deleteIfPresent } = require('../cleanup');
```

(Merge these into the existing `require('discord.js')` and `require('../db/db')` lines from earlier tasks rather than adding duplicate `require` calls for the same module.)

Add at the end of the file, before `module.exports`:

```js
function buildCancelConfirmRow(eventId) {
  const confirmButton = new ButtonBuilder()
    .setCustomId(`cancel-event-confirm:${eventId}`)
    .setLabel('確定取消')
    .setStyle(ButtonStyle.Danger);

  const abortButton = new ButtonBuilder()
    .setCustomId('cancel-event-abort')
    .setLabel('算了')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(confirmButton, abortButton);
}

async function handleCancelEventButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: NOT_FOUND_MESSAGE, ephemeral: true });
    return;
  }

  if (!(await requireCreator(interaction, event))) return;

  await interaction.reply({
    content: '確定要取消整個揪團嗎？此動作無法復原',
    components: [buildCancelConfirmRow(event.id)],
    ephemeral: true,
  });
}

async function handleCancelEventAbortButton(interaction) {
  await interaction.update({ content: '已取消操作', components: [] });
}

async function notifyThreadOfCancellation(client, event, signups) {
  if (!event.thread_id) return;

  try {
    const thread = await client.channels.fetch(event.thread_id);
    const mentions = signups.map(buildMentionSegment).join(' ');
    const mentionableUserIds = signups.filter((s) => !s.is_external).map((s) => s.user_id);
    await thread.send({
      content: `本次揪團已由團主取消${mentions ? `，已報名的人請留意：${mentions}` : ''}`,
      allowedMentions: { users: mentionableUserIds },
    });
  } catch (error) {
    if (!isAlreadyGoneError(error)) throw error;
  }
}

async function handleCancelEventConfirmButton(interaction, db) {
  const eventId = Number.parseInt(interaction.customId.split(':')[1], 10);

  // interaction.update is itself the ack for this button click; everything
  // below (notify, delete, DB writes) happens after and doesn't need this
  // interaction's token again.
  await interaction.update({ content: '正在取消揪團…', components: [] });

  const event = getEventById(db, eventId);
  if (!event) return;

  const signups = getSignups(db, event.id);
  await notifyThreadOfCancellation(interaction.client, event, signups);

  await deleteIfPresent(async () => {
    const channel = await interaction.client.channels.fetch(event.channel_id);
    const message = await channel.messages.fetch(event.message_id);
    await message.delete();
  });

  if (event.thread_id) {
    await deleteIfPresent(async () => {
      const thread = await interaction.client.channels.fetch(event.thread_id);
      await thread.delete();
    });
  }

  const cancelledAt = new Date().toISOString();
  markEventCleaned(db, event.id, cancelledAt);
  if (!event.reminded_at) {
    markEventReminded(db, event.id, cancelledAt);
  }
}
```

Add `buildCancelConfirmRow`, `handleCancelEventButton`, `handleCancelEventConfirmButton`, `handleCancelEventAbortButton` to `module.exports`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/manage-event.test.js`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/cleanup.js src/interactions/manage-event.js tests/manage-event.test.js
git commit -m "Implement the cancel-event flow: confirm, notify, delete, mark cleaned

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Wire the new interactions into the router

**Files:**
- Modify: `src/interaction-router.js`
- Test: `tests/interaction-router.test.js`

**Interfaces:**
- Consumes: `handleEditTimeButton`, `handleEditTimeModal`, `handleCancelEventButton`, `handleCancelEventConfirmButton`, `handleCancelEventAbortButton` from `src/interactions/manage-event.js` (Tasks 4-6), injected the same way every other handler already is.

- [ ] **Step 1: Write the failing tests**

Add to `tests/interaction-router.test.js`. Add the five new handlers to `makeHandlers`'s default object:

```js
    handleEditTimeButton: jest.fn(),
    handleEditTimeModal: jest.fn(),
    handleCancelEventButton: jest.fn(),
    handleCancelEventConfirmButton: jest.fn(),
    handleCancelEventAbortButton: jest.fn(),
```

Add these test cases inside `describe('createInteractionHandler', ...)`:

```js
  test('routes edit-time button clicks to handleEditTimeButton with the db', async () => {
    const handleEditTimeButton = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleEditTimeButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'edit-time:1' });

    await handle(interaction);

    expect(handleEditTimeButton).toHaveBeenCalledWith(interaction, db);
  });

  test('routes cancel-event button clicks to handleCancelEventButton with the db', async () => {
    const handleCancelEventButton = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleCancelEventButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'cancel-event:1' });

    await handle(interaction);

    expect(handleCancelEventButton).toHaveBeenCalledWith(interaction, db);
  });

  test('routes cancel-event-confirm button clicks to handleCancelEventConfirmButton with the db', async () => {
    const handleCancelEventConfirmButton = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleCancelEventConfirmButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'cancel-event-confirm:1' });

    await handle(interaction);

    expect(handleCancelEventConfirmButton).toHaveBeenCalledWith(interaction, db);
  });

  test('routes cancel-event-abort button clicks to handleCancelEventAbortButton without the db', async () => {
    const handleCancelEventAbortButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleCancelEventAbortButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'cancel-event-abort' });

    await handle(interaction);

    expect(handleCancelEventAbortButton).toHaveBeenCalledWith(interaction);
  });

  test('routes edit-time-modal submissions to handleEditTimeModal with the db', async () => {
    const handleEditTimeModal = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleEditTimeModal }));
    const interaction = makeBaseInteraction({ isModalSubmit: () => true, customId: 'edit-time-modal:1' });

    await handle(interaction);

    expect(handleEditTimeModal).toHaveBeenCalledWith(interaction, db);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/interaction-router.test.js`
Expected: FAIL — the 5 new tests fail because the router doesn't dispatch these customIds yet (handlers never called)

- [ ] **Step 3: Implement**

In `src/interaction-router.js`, add the five new params to `createInteractionHandler`'s destructured argument:

```js
function createInteractionHandler({
  commands,
  db,
  handleCreateEventModal,
  handleJoinModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleTitleChoiceButton,
  handleSessionChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
  handleEditTimeButton,
  handleEditTimeModal,
  handleCancelEventButton,
  handleCancelEventConfirmButton,
  handleCancelEventAbortButton,
}) {
```

In the `isButton()` block, add before the closing `return;`:

```js
      if (action === 'edit-time') await handleEditTimeButton(interaction, db);
      if (action === 'cancel-event') await handleCancelEventButton(interaction, db);
      if (action === 'cancel-event-confirm') await handleCancelEventConfirmButton(interaction, db);
      if (action === 'cancel-event-abort') await handleCancelEventAbortButton(interaction);
```

In the `isModalSubmit()` block, change the last branch from:
```js
      if (interaction.customId.startsWith('assist-join-modal:')) {
        await handleAssistJoinModal(interaction, db);
      }
```
to:
```js
      if (interaction.customId.startsWith('assist-join-modal:')) {
        await handleAssistJoinModal(interaction, db);
        return;
      }
      if (interaction.customId.startsWith('edit-time-modal:')) {
        await handleEditTimeModal(interaction, db);
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/interaction-router.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/interaction-router.js tests/interaction-router.test.js
git commit -m "Route edit-time and cancel-event interactions through the router

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Wire the handlers into the running bot

**Files:**
- Modify: `src/index.js`

**Interfaces:**
- Consumes: everything exported from `src/interactions/manage-event.js` (Tasks 4-6) that `interaction-router.js` (Task 7) expects.

`src/index.js` has no dedicated test file (same as its existing reminder/cleanup wiring) — this task is verified by running the full suite plus a manual read-through.

- [ ] **Step 1: Add the import**

In `src/index.js`, add near the other `interactions/*` requires:

```js
const {
  handleEditTimeButton,
  handleEditTimeModal,
  handleCancelEventButton,
  handleCancelEventConfirmButton,
  handleCancelEventAbortButton,
} = require('./interactions/manage-event');
```

- [ ] **Step 2: Pass the handlers into `createInteractionHandler`**

Change:
```js
const handleInteraction = createInteractionHandler({
  commands,
  db,
  handleCreateEventModal,
  handleJoinModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleTitleChoiceButton,
  handleSessionChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
});
```
to:
```js
const handleInteraction = createInteractionHandler({
  commands,
  db,
  handleCreateEventModal,
  handleJoinModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleTitleChoiceButton,
  handleSessionChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
  handleEditTimeButton,
  handleEditTimeModal,
  handleCancelEventButton,
  handleCancelEventConfirmButton,
  handleCancelEventAbortButton,
});
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file in `tests/` passes, including all of `manage-event.test.js`, the updated `event-embed.test.js`/`create-event-modal.test.js`/`interaction-router.test.js`/`db.test.js`/`title-choice-button.test.js`, and every pre-existing test untouched by this plan.

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "Wire the organizer edit-time/cancel-event handlers into the bot

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
