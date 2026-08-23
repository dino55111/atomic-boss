const { initDb, createEvent, updateEventThreadId, getSignups } = require('../src/db/db');
const { handleJoinModal, getOptionalTextInputValue } = require('../src/interactions/join-modal');

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

function makeInteraction({ eventId, className, userId, fieldValues, fetchedMessage, thread, deferUpdateFails = false }) {
  // Mirrors real discord.js behavior: an optional field left blank is
  // omitted from the submission entirely, so getTextInputValue throws.
  const fieldEntries = new Map(Object.entries(fieldValues).map(([id, value]) => [id, { value }]));
  return {
    customId: `join-modal:${eventId}:${className}`,
    user: { id: userId, username: userId },
    fields: {
      getTextInputValue: (id) => {
        if (!fieldEntries.has(id)) {
          throw new Error(`Required field with custom id "${id}" not found.`);
        }
        return fieldEntries.get(id).value;
      },
      fields: fieldEntries,
    },
    deferUpdate: jest.fn(async () => {
      if (deferUpdateFails) {
        throw new Error('Unknown interaction');
      }
    }),
    deleteReply: jest.fn(async () => {}),
    followUp: jest.fn(async () => {}),
    channel: { messages: { fetch: jest.fn(async () => fetchedMessage) } },
    client: { channels: { fetch: jest.fn(async () => thread) } },
  };
}

describe('handleJoinModal', () => {
  test('deletes the class-picker message, adds the signup, edits the message, posts to the thread, and sends no extra confirmation', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeInteraction({
      eventId: event.id,
      className: '冰雷',
      userId: 'user-1',
      fieldValues: { level: '70', game_id: 'alice#1', note: '本尊的小號' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleJoinModal(interaction, db);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(editedMessage.edit).toHaveBeenCalledTimes(1);
    expect(interaction.client.channels.fetch).toHaveBeenCalledWith('thread-1');
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('冰雷') }));
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('<@user-1>') }));
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('本尊的小號') }));
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { users: ['user-1'] } }));
    expect(interaction.followUp).not.toHaveBeenCalled();

    const [signup] = getSignups(db, event.id);
    expect(signup.class).toBe('冰雷');
    expect(signup.note).toBe('本尊的小號');
  });

  test('signs up fine when the optional note field is omitted entirely (left blank)', async () => {
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

    const [signup] = getSignups(db, event.id);
    expect(signup.note).toBe('');
  });

  test('still records the signup and updates the roster when the interaction ack fails (stale interaction)', async () => {
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
      deferUpdateFails: true,
    });

    await handleJoinModal(interaction, db);

    expect(interaction.deleteReply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(editedMessage.edit).toHaveBeenCalledTimes(1);
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('冰雷') }));

    const [signup] = getSignups(db, event.id);
    expect(signup.class).toBe('冰雷');
  });

  test('deletes the class-picker message and sends no message when the user already signed up', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const fieldValues = { level: '70', game_id: 'alice#1' };

    await handleJoinModal(makeInteraction({ eventId: event.id, className: '冰雷', userId: 'user-1', fieldValues, fetchedMessage: editedMessage, thread }), db);
    const interaction2 = makeInteraction({ eventId: event.id, className: '火毒', userId: 'user-1', fieldValues, fetchedMessage: editedMessage, thread });

    await handleJoinModal(interaction2, db);

    expect(interaction2.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction2.followUp).not.toHaveBeenCalled();
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
