const { initDb, createEvent } = require('../src/db/db');
const { handleJoinModal } = require('../src/interactions/join-modal');

function makeEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 1,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}

function makeInteraction({ eventId, userId, fieldValues, fetchedMessage }) {
  return {
    customId: `join-modal:${eventId}`,
    user: { id: userId, username: userId },
    fields: {
      getTextInputValue: (id) => fieldValues[id],
      getRadioGroup: (id) => fieldValues[id],
    },
    reply: jest.fn(async () => {}),
    channel: { messages: { fetch: jest.fn(async () => fetchedMessage) } },
  };
}

describe('handleJoinModal', () => {
  test('adds the signup and edits the original message', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const interaction = makeInteraction({
      eventId: event.id,
      userId: 'user-1',
      fieldValues: { class_1: '戰士', level: '70', game_id: 'alice#1' },
      fetchedMessage: editedMessage,
    });

    await handleJoinModal(interaction, db);

    expect(editedMessage.edit).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '報名成功！' }));
  });

  test('accepts a class chosen from the second radio group', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const interaction = makeInteraction({
      eventId: event.id,
      userId: 'user-1',
      fieldValues: { class_2: '英雄', level: '70', game_id: 'alice#1' },
      fetchedMessage: editedMessage,
    });

    await handleJoinModal(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '報名成功！' }));
  });

  test('replies with an ephemeral message when both class radio groups are selected', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const interaction = makeInteraction({
      eventId: event.id,
      userId: 'user-1',
      fieldValues: { class_1: '戰士', class_2: '英雄', level: '70', game_id: 'alice#1' },
      fetchedMessage: editedMessage,
    });

    await handleJoinModal(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '職業請只選一邊', ephemeral: true }));
    expect(editedMessage.edit).not.toHaveBeenCalled();
  });

  test('replies with an ephemeral message when no class is selected', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const interaction = makeInteraction({
      eventId: event.id,
      userId: 'user-1',
      fieldValues: { level: '70', game_id: 'alice#1' },
      fetchedMessage: editedMessage,
    });

    await handleJoinModal(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '請選擇職業', ephemeral: true }));
    expect(editedMessage.edit).not.toHaveBeenCalled();
  });

  test('replies with an ephemeral message when the user already signed up', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 2 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const fieldValues = { class_1: '戰士', level: '70', game_id: 'alice#1' };

    await handleJoinModal(makeInteraction({ eventId: event.id, userId: 'user-1', fieldValues, fetchedMessage: editedMessage }), db);
    const interaction2 = makeInteraction({ eventId: event.id, userId: 'user-1', fieldValues, fetchedMessage: editedMessage });

    await handleJoinModal(interaction2, db);

    expect(interaction2.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '你已經報名囉', ephemeral: true }));
  });

  test('replies with an ephemeral message when the event is full', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 1 });
    const editedMessage = { edit: jest.fn(async () => {}) };

    await handleJoinModal(makeInteraction({ eventId: event.id, userId: 'user-1', fieldValues: { class_1: '戰士', level: '70', game_id: 'a' }, fetchedMessage: editedMessage }), db);
    const interaction2 = makeInteraction({ eventId: event.id, userId: 'user-2', fieldValues: { class_1: '法師', level: '65', game_id: 'b' }, fetchedMessage: editedMessage });

    await handleJoinModal(interaction2, db);

    expect(interaction2.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '已經額滿了', ephemeral: true }));
  });

  test('replies with an error when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = makeInteraction({ eventId: 999, userId: 'user-1', fieldValues: { class_1: 'x', level: 'y', game_id: 'z' }, fetchedMessage: {} });

    await handleJoinModal(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
