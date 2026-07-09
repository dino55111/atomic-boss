const { initDb, getEventById } = require('../src/db/db');
const { handleCreateEventModal, parseCapacity } = require('../src/interactions/create-event-modal');

function makeInteraction({ title, fieldValues }) {
  return {
    customId: `create-event-modal:${title}`,
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'creator-1' },
    fields: { getTextInputValue: (id) => fieldValues[id] },
    deferUpdate: jest.fn(async () => {}),
    deleteReply: jest.fn(async () => {}),
    followUp: jest.fn(async () => ({
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
  test('deletes the title-picker message, creates the event, posts the embed, and stores the resulting message id', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', fieldValues: { capacity: '3', start_time: '7/12 20:00' } });

    await handleCreateEventModal(interaction, db);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    const followUpPayload = interaction.followUp.mock.calls[0][0];
    expect(followUpPayload.embeds).toHaveLength(1);
    expect(followUpPayload.components).toHaveLength(1);

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '普拉', capacity: 3, message_id: 'message-1', thread_id: 'thread-1' });
  });

  test('deletes the title-picker message and replies with a follow-up error when capacity is invalid', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', fieldValues: { capacity: 'not-a-number', start_time: '7/12 20:00' } });

    await handleCreateEventModal(interaction, db);

    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(getEventById(db, 1)).toBeUndefined();
  });
});
