const { initDb, getEventById } = require('../src/db/db');
const { handleCreateEventModal, isValidStartTime, isFutureStartTime } = require('../src/interactions/create-event-modal');

function makeInteraction({ title, session = 1, date = '7/12', hour = '20', minute = '00', deferUpdateFails = false }) {
  const thread = { id: 'thread-1', send: jest.fn(async () => ({ id: 'thread-message-1' })) };
  const startThread = jest.fn(async () => thread);
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
    channel: {
      send: jest.fn(async () => ({
        id: 'message-1',
        startThread,
      })),
    },
    startThread,
    thread,
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

  test('deletes the title-picker message, creates the event with the capacity derived from the title, and posts the embed to the channel', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉' });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);
    const sentPayload = interaction.channel.send.mock.calls[0][0];
    expect(sentPayload.embeds).toHaveLength(1);
    expect(sentPayload.components).toHaveLength(2);

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '普拉', capacity: 6, session: 1, message_id: 'message-1', thread_id: 'thread-1' });
  });

  // Discord doesn't reliably let you click the buttons on a thread's starter
  // message from within the thread itself, so an independently clickable
  // copy of just the buttons (no embed card) is posted straight into the
  // thread.
  test('also posts the buttons (without the embed card) into the new thread and stores its message id', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉' });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    expect(interaction.thread.send).toHaveBeenCalledTimes(1);
    const threadPayload = interaction.thread.send.mock.calls[0][0];
    expect(threadPayload.embeds).toBeUndefined();
    expect(threadPayload.components).toHaveLength(2);

    const event = getEventById(db, 1);
    expect(event.thread_message_id).toBe('thread-message-1');
  });

  test('thread name is prefixed with the composed 日期 時:分 and suffixed with the chosen session', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', session: 3, date: '7/12', hour: '20', minute: '00' });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    expect(interaction.startThread).toHaveBeenCalledWith({ name: '7/12 20:00 普拉 3場' });
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

  test('still creates the event and posts the embed when the interaction ack fails (stale interaction)', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', deferUpdateFails: true });

    await handleCreateEventModal(interaction, db, FIXED_NOW);

    expect(interaction.deleteReply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '普拉', capacity: 6 });
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
