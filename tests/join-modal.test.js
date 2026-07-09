const { initDb, createEvent, updateEventThreadId, getSignups } = require('../src/db/db');
const { handleJoinModal } = require('../src/interactions/join-modal');

function makeEvent(db, overrides = {}) {
  const event = createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 1,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
  updateEventThreadId(db, event.id, 'thread-1');
  return event;
}

function makeInteraction({ eventId, className, userId, fieldValues, fetchedMessage, thread }) {
  return {
    customId: `join-modal:${eventId}:${className}`,
    user: { id: userId, username: userId },
    fields: { getTextInputValue: (id) => fieldValues[id] },
    deferUpdate: jest.fn(async () => {}),
    deleteReply: jest.fn(async () => {}),
    followUp: jest.fn(async () => {}),
    channel: { messages: { fetch: jest.fn(async () => fetchedMessage) } },
    client: { channels: { fetch: jest.fn(async () => thread) } },
  };
}

describe('handleJoinModal', () => {
  test('deletes the class-picker message, adds the signup, edits the message, and posts to the thread', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeInteraction({
      eventId: event.id,
      className: '冰雷',
      userId: 'user-1',
      fieldValues: { level: '70', game_id: 'alice#1' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleJoinModal(interaction, db);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(editedMessage.edit).toHaveBeenCalledTimes(1);
    expect(interaction.client.channels.fetch).toHaveBeenCalledWith('thread-1');
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('冰雷'));
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('<@user-1>'));
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: '報名成功！' }));

    const [signup] = getSignups(db, event.id);
    expect(signup.class).toBe('冰雷');
  });

  test('deletes the class-picker message and replies with a follow-up when the user already signed up', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const fieldValues = { level: '70', game_id: 'alice#1' };

    await handleJoinModal(makeInteraction({ eventId: event.id, className: '冰雷', userId: 'user-1', fieldValues, fetchedMessage: editedMessage, thread }), db);
    const interaction2 = makeInteraction({ eventId: event.id, className: '火毒', userId: 'user-1', fieldValues, fetchedMessage: editedMessage, thread });

    await handleJoinModal(interaction2, db);

    expect(interaction2.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction2.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: '你已經報名囉', ephemeral: true }));
  });

  test('deletes the class-picker message and replies with a follow-up when the event is full', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 1 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };

    await handleJoinModal(makeInteraction({ eventId: event.id, className: '冰雷', userId: 'user-1', fieldValues: { level: '70', game_id: 'a' }, fetchedMessage: editedMessage, thread }), db);
    const interaction2 = makeInteraction({ eventId: event.id, className: '火毒', userId: 'user-2', fieldValues: { level: '65', game_id: 'b' }, fetchedMessage: editedMessage, thread });

    await handleJoinModal(interaction2, db);

    expect(interaction2.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction2.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: '已經額滿了', ephemeral: true }));
  });

  test('deletes the class-picker message and replies with a follow-up when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ eventId: 999, className: '冰雷', userId: 'user-1', fieldValues: { level: 'y', game_id: 'z' }, fetchedMessage: {} });

    await handleJoinModal(interaction, db);

    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
