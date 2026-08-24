const { initDb, getEventById } = require('../src/db/db');
const { handleCreateEventModal, isValidStartTime } = require('../src/interactions/create-event-modal');

function makeInteraction({ title, session = 1, startTime, deferUpdateFails = false }) {
  const startThread = jest.fn(async () => ({ id: 'thread-1' }));
  return {
    customId: `create-event-modal:${title}:${session}`,
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'creator-1' },
    fields: { getTextInputValue: () => startTime },
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
    const interaction = makeInteraction({ title: '普拉', startTime: '7/12 20:00' });

    await handleCreateEventModal(interaction, db);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);
    const sentPayload = interaction.channel.send.mock.calls[0][0];
    expect(sentPayload.embeds).toHaveLength(1);
    expect(sentPayload.components).toHaveLength(1);

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '普拉', capacity: 6, session: 1, message_id: 'message-1', thread_id: 'thread-1' });
  });

  test('thread name is prefixed with the full 時間 and suffixed with the chosen session', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', session: 3, startTime: '7/12 20:00' });

    await handleCreateEventModal(interaction, db);

    expect(interaction.startThread).toHaveBeenCalledWith({ name: '7/12 20:00 普拉 第3場' });
  });

  test('stores the chosen session number on the event', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', session: 5, startTime: '7/12 20:00' });

    await handleCreateEventModal(interaction, db);

    const event = getEventById(db, 1);
    expect(event.session).toBe(5);
  });

  test('龍王 gets a capacity of 12', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '龍王', startTime: '7/12 20:00' });

    await handleCreateEventModal(interaction, db);

    const event = getEventById(db, 1);
    expect(event.capacity).toBe(12);
  });

  test('replies with a follow-up error and does not create an event when the time format is invalid', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', startTime: '晚上八點' });

    await handleCreateEventModal(interaction, db);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(getEventById(db, 1)).toBeUndefined();
  });

  test('still creates the event and posts the embed when the interaction ack fails (stale interaction)', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', startTime: '7/12 20:00', deferUpdateFails: true });

    await handleCreateEventModal(interaction, db);

    expect(interaction.deleteReply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '普拉', capacity: 6 });
  });
});
