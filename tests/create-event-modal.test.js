const { initDb, getEventById } = require('../src/db/db');
const { handleCreateEventModal } = require('../src/interactions/create-event-modal');

function makeInteraction({ title, startTime }) {
  return {
    customId: `create-event-modal:${title}`,
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'creator-1' },
    fields: { getTextInputValue: () => startTime },
    deferUpdate: jest.fn(async () => {}),
    deleteReply: jest.fn(async () => {}),
    followUp: jest.fn(async () => ({
      id: 'message-1',
      startThread: jest.fn(async () => ({ id: 'thread-1' })),
    })),
  };
}

describe('handleCreateEventModal', () => {
  test('deletes the title-picker message, creates the event with the capacity derived from the title, and posts the embed', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '普拉', startTime: '7/12 20:00' });

    await handleCreateEventModal(interaction, db);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    const followUpPayload = interaction.followUp.mock.calls[0][0];
    expect(followUpPayload.embeds).toHaveLength(1);
    expect(followUpPayload.components).toHaveLength(1);

    const event = getEventById(db, 1);
    expect(event).toMatchObject({ title: '普拉', capacity: 6, message_id: 'message-1', thread_id: 'thread-1' });
  });

  test('龍王 gets a capacity of 12', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ title: '龍王', startTime: '7/12 20:00' });

    await handleCreateEventModal(interaction, db);

    const event = getEventById(db, 1);
    expect(event.capacity).toBe(12);
  });
});
