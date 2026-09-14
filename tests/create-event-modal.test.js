const { initDb, getEventById } = require('../src/db/db');
const { handleCreateEventModal, isValidStartTime } = require('../src/interactions/create-event-modal');

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

describe('handleCreateEventModal', () => {
  test('deletes the title-picker message, creates the event with the capacity derived from the title, and posts the embed to the channel', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉' });

    await handleCreateEventModal(interaction, db);

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
  // message from within the thread itself, so a second, independently
  // clickable copy of the same card is posted straight into the thread.
  test('also posts a copy of the signup card into the new thread and stores its message id', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉' });

    await handleCreateEventModal(interaction, db);

    expect(interaction.thread.send).toHaveBeenCalledTimes(1);
    const threadPayload = interaction.thread.send.mock.calls[0][0];
    expect(threadPayload.embeds).toHaveLength(1);
    expect(threadPayload.components).toHaveLength(2);

    const event = getEventById(db, 1);
    expect(event.thread_message_id).toBe('thread-message-1');
  });

  test('thread name is prefixed with the composed 日期 時:分 and suffixed with the chosen session', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', session: 3, date: '7/12', hour: '20', minute: '00' });

    await handleCreateEventModal(interaction, db);

    expect(interaction.startThread).toHaveBeenCalledWith({ name: '7/12 20:00 普拉 3場' });
  });

  test('composes the start time from the date, hour, and minute selects', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', date: '9/6', hour: '21', minute: '30' });

    await handleCreateEventModal(interaction, db);

    const event = getEventById(db, 1);
    expect(event.start_time).toBe('9/6 21:30');
  });

  test('stores the chosen session number on the event', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', session: 5 });

    await handleCreateEventModal(interaction, db);

    const event = getEventById(db, 1);
    expect(event.session).toBe(5);
  });

  test('龍王 gets a capacity of 12', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '龍王' });

    await handleCreateEventModal(interaction, db);

    const event = getEventById(db, 1);
    expect(event.capacity).toBe(12);
  });

  test('still creates the event and posts the embed when the interaction ack fails (stale interaction)', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', deferUpdateFails: true });

    await handleCreateEventModal(interaction, db);

    expect(interaction.deleteReply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '普拉', capacity: 6 });
  });
});
