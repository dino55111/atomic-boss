const { initDb, getEventById } = require('../src/db/db');
const { handleCreateEventModal, parseCapacity } = require('../src/interactions/create-event-modal');

function makeInteraction(fieldValues) {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'creator-1' },
    fields: { getTextInputValue: (id) => fieldValues[id] },
    reply: jest.fn(async () => {}),
    fetchReply: jest.fn(async () => ({
      id: 'message-1',
      startThread: jest.fn(async () => ({ id: 'thread-1' })),
    })),
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
    expect(event).toMatchObject({ title: '週三夜間團', capacity: 3, message_id: 'message-1', thread_id: 'thread-1' });
  });

  test('replies with an error and does not create an event when capacity is invalid', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '週三夜間團', capacity: 'not-a-number', start_time: '7/12 20:00' });

    await handleCreateEventModal(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(getEventById(db, 1)).toBeUndefined();
  });
});
