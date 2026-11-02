const { initDb, getEventById, createEvent, updateEventThreadId, addSignup } = require('../src/db/db');
const {
  handleCreateEventModal,
  isValidStartTime,
  isFutureStartTime,
  publishEvent,
  handlePostCreatePublishButton,
} = require('../src/interactions/create-event-modal');

function makeChannel() {
  const thread = {
    id: 'thread-1',
    send: jest.fn(async () => ({ id: 'thread-message-1' })),
    members: { add: jest.fn(async () => {}) },
  };
  const startThread = jest.fn(async () => thread);
  return {
    send: jest.fn(async () => ({ id: 'message-1', startThread })),
    startThread,
    thread,
  };
}

function makeInteraction({ title, session = 1, date = '7/12', hour = '20', minute = '00', deferUpdateFails = false }) {
  const channel = makeChannel();
  const selectValues = { event_date: date, event_hour: hour, event_minute: minute };
  return {
    customId: `create-event-modal:${title}:${session}`,
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'creator-1' },
    fields: { getStringSelectValues: (customId) => [selectValues[customId]] },
    deferUpdate: jest.fn(async () => {
      if (deferUpdateFails) {
        throw new Error('Unknown interaction');
      }
    }),
    deleteReply: jest.fn(async () => {}),
    followUp: jest.fn(async () => {}),
    channel,
  };
}

describe('isValidStartTime', () => {
  test('accepts valid M/D HH:mm strings', () => {
    expect(isValidStartTime('7/12 20:00')).toBe(true);
    expect(isValidStartTime('12/31 23:59')).toBe(true);
    expect(isValidStartTime('1/1 00:00')).toBe(true);
  });

  test('rejects malformed or out-of-range strings', () => {
    expect(isValidStartTime('7/12')).toBe(false);
    expect(isValidStartTime('7-12 20:00')).toBe(false);
    expect(isValidStartTime('晚上八點')).toBe(false);
    expect(isValidStartTime('13/1 20:00')).toBe(false);
    expect(isValidStartTime('7/32 20:00')).toBe(false);
    expect(isValidStartTime('7/12 24:00')).toBe(false);
    expect(isValidStartTime('7/12 20:60')).toBe(false);
    expect(isValidStartTime('7/12 20:5')).toBe(false);
  });
});

describe('isFutureStartTime', () => {
  const now = new Date(2026, 8, 23, 22, 0); // Sep 23 2026, 22:00

  test('accepts a time later today than the reference', () => {
    expect(isFutureStartTime('9/23 22:10', now)).toBe(true);
  });

  test('accepts a date after today', () => {
    expect(isFutureStartTime('9/24 00:00', now)).toBe(true);
  });

  test('rejects a time earlier today than the reference', () => {
    expect(isFutureStartTime('9/23 20:00', now)).toBe(false);
  });

  test('rejects exactly the reference time', () => {
    expect(isFutureStartTime('9/23 22:00', now)).toBe(false);
  });
});

describe('handleCreateEventModal', () => {
  // All the fixture dates below (7/12, 9/6, ...) are meant to read as "some
  // time after now" — fixed well before any of them so isFutureStartTime
  // doesn't reject them as the real wall clock moves past those dates.
  const FIXED_NOW = new Date(2026, 0, 1, 0, 0);

  test('creates the event with the capacity derived from the title, but does not post anything yet', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉' });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.channel.send).not.toHaveBeenCalled();

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '普拉', capacity: 6, session: 1, message_id: 'pending', thread_id: null });
  });

  test('composes the start time from the date, hour, and minute selects', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', date: '9/6', hour: '21', minute: '30' });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    const event = getEventById(db, 1);
    expect(event.start_time).toBe('9/6 21:30');
  });

  test('stores the chosen session number on the event', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', session: 5 });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    const event = getEventById(db, 1);
    expect(event.session).toBe(5);
  });

  test('龍王 gets a capacity of 12', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '龍王' });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    const event = getEventById(db, 1);
    expect(event.capacity).toBe(12);
  });

  test('follows up with an ephemeral prompt offering to pre-fill members or publish immediately, scoped to the new event', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉' });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    const event = getEventById(db, 1);
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({
      content: '揪團資料已建立，要先預先報名再發布嗎？',
      ephemeral: true,
    }));
    const prompt = interaction.followUp.mock.calls[0][0];
    expect(prompt.components[0].components[0].data.custom_id).toBe(`assist:${event.id}:postcreate`);
    expect(prompt.components[0].components[1].data.custom_id).toBe(`postcreate-publish:${event.id}`);
  });

  // The event itself, and publishing it, must not depend on this
  // interaction's token (it may already be stale/expired) — only the
  // pre-fill prompt does, since that requires talking back to the creator.
  test('still creates and immediately publishes the event when the interaction ack fails (stale interaction)', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', deferUpdateFails: true });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    expect(interaction.deleteReply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '普拉', capacity: 6, message_id: 'message-1', thread_id: 'thread-1' });
  });

  test('rejects a past-today time without creating the event', async () => {
    const db = initDb(':memory:');
    const now = new Date(2026, 8, 23, 22, 0); // Sep 23 2026, 22:00
    const interaction = makeInteraction({ title: '普拉', date: '9/23', hour: '20', minute: '00' });

    await handleCreateEventModal(interaction, db, now);

    expect(interaction.channel.send).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '所選時間已經過去，請選擇現在之後的時間重新使用 /boss 建立',
      ephemeral: true,
    });
    expect(getEventById(db, 1)).toBeUndefined();
  });
});

function makeUnpublishedEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'pending',
    title: '普拉',
    capacity: 6,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}

describe('publishEvent', () => {
  const FIXED_NOW = new Date(2026, 0, 1, 0, 0);

  test('posts the embed and buttons to the channel, and stores the message id', async () => {
    const db = initDb(':memory:');
    const event = makeUnpublishedEvent(db);
    const channel = makeChannel();

    await publishEvent(channel, db, event, FIXED_NOW);

    expect(channel.send).toHaveBeenCalledTimes(1);
    const sentPayload = channel.send.mock.calls[0][0];
    expect(sentPayload.embeds).toHaveLength(1);
    expect(sentPayload.components).toHaveLength(2);
    expect(getEventById(db, event.id).message_id).toBe('message-1');
  });

  // Discord doesn't reliably let you click the buttons on a thread's starter
  // message from within the thread itself, so an independently clickable
  // copy of just the buttons (no embed card) is posted straight into the
  // thread.
  test('creates a thread and also posts the buttons (without the embed card) into it, storing both ids', async () => {
    const db = initDb(':memory:');
    const event = makeUnpublishedEvent(db);
    const channel = makeChannel();

    await publishEvent(channel, db, event, FIXED_NOW);

    expect(channel.thread.send).toHaveBeenCalledTimes(1);
    const threadPayload = channel.thread.send.mock.calls[0][0];
    expect(threadPayload.embeds).toBeUndefined();
    expect(threadPayload.components).toHaveLength(2);

    const updated = getEventById(db, event.id);
    expect(updated.thread_id).toBe('thread-1');
    expect(updated.thread_message_id).toBe('thread-message-1');
  });

  test('thread name is prefixed with the composed 日期 (星期幾) 時:分 and suffixed with the session', async () => {
    const db = initDb(':memory:');
    const event = makeUnpublishedEvent(db, { session: 3, startTime: '7/12 20:00' });
    const channel = makeChannel();

    await publishEvent(channel, db, event, FIXED_NOW);

    // 2026-07-12 is a Sunday.
    expect(channel.startThread).toHaveBeenCalledWith({ name: '7/12 (日) 20:00 普拉 3場' });
  });

  test('includes any already-recorded signups in the posted roster', async () => {
    const db = initDb(':memory:');
    const event = makeUnpublishedEvent(db);
    addSignup(db, event, { userId: 'user-9', displayName: 'IceGuy', className: '冰雷', level: '70', gameId: 'ice#1' });
    const channel = makeChannel();

    await publishEvent(channel, db, event, FIXED_NOW);

    const sentPayload = channel.send.mock.calls[0][0];
    const countField = sentPayload.embeds[0].data.fields.find((field) => field.name === '人數');
    expect(countField.value).toBe('1 / 6');
  });

  test('adds every already-recorded, non-external signup to the new thread', async () => {
    const db = initDb(':memory:');
    const event = makeUnpublishedEvent(db);
    addSignup(db, event, { userId: 'user-9', displayName: 'IceGuy', className: '冰雷', level: '70', gameId: 'ice#1' });
    addSignup(db, event, {
      userId: 'ext:1',
      displayName: 'Friend',
      className: '火毒',
      level: '70',
      gameId: 'fire#1',
      isExternal: true,
    });
    const channel = makeChannel();

    await publishEvent(channel, db, event, FIXED_NOW);

    expect(channel.thread.members.add).toHaveBeenCalledTimes(1);
    expect(channel.thread.members.add).toHaveBeenCalledWith('user-9');
  });
});

describe('handlePostCreatePublishButton', () => {
  function makeButtonInteraction({ eventId, channel }) {
    return {
      customId: `postcreate-publish:${eventId}`,
      channel,
      deferUpdate: jest.fn(async () => {}),
      deleteReply: jest.fn(async () => {}),
      update: jest.fn(async () => {}),
    };
  }

  // The pre-fill flow keeps reusing one ephemeral message end-to-end (see
  // assist-signup.js's handleAssistButton/handleAssistJoinModal), so 發布
  // just deletes that same message via its own deferUpdate()+deleteReply()
  // — same mechanism ack.js already uses to drop a modal's origin message.
  test('publishes the event and deletes its own prompt message', async () => {
    const db = initDb(':memory:');
    const event = makeUnpublishedEvent(db);
    const channel = makeChannel();
    const interaction = makeButtonInteraction({ eventId: event.id, channel });

    await handlePostCreatePublishButton(interaction, db);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(getEventById(db, event.id).message_id).toBe('message-1');
  });

  test('does not publish a second time when clicked again on an already-published event', async () => {
    const db = initDb(':memory:');
    const event = makeUnpublishedEvent(db);
    updateEventThreadId(db, event.id, 'thread-1');
    const channel = makeChannel();
    const interaction = makeButtonInteraction({ eventId: event.id, channel });

    await handlePostCreatePublishButton(interaction, db);

    expect(channel.send).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledWith({ content: '已經發布過了', components: [] });
  });

  test('tells the creator the event could not be found when it no longer exists', async () => {
    const db = initDb(':memory:');
    const channel = makeChannel();
    const interaction = makeButtonInteraction({ eventId: 999, channel });

    await handlePostCreatePublishButton(interaction, db);

    expect(channel.send).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledWith({
      content: '找不到這個揪團，可能已經被刪除了',
      components: [],
    });
  });
});
