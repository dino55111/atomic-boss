const { initDb, createEvent, addSignup } = require('../src/db/db');
const { buildJoinModal, handleSignupButton, handleCancelButton, CLASS_OPTIONS } = require('../src/interactions/signup-button');

function makeEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 2,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}

describe('buildJoinModal', () => {
  test('customId embeds the event id and has 3 fields', () => {
    const modal = buildJoinModal(42);
    expect(modal.data.custom_id).toBe('join-modal:42');
    expect(modal.components).toHaveLength(3);
  });

  test('職業 field is a required single-select offering all class options', () => {
    const modal = buildJoinModal(42);
    const classLabel = modal.components[0];
    expect(classLabel.data.label).toBe('職業');

    const classSelect = classLabel.data.component;
    expect(classSelect.data.custom_id).toBe('class');
    expect(classSelect.data.required).toBe(true);
    expect(classSelect.data.min_values).toBe(1);
    expect(classSelect.data.max_values).toBe(1);
    expect(classSelect.options.map((option) => option.data.value)).toEqual(CLASS_OPTIONS);
  });
});

describe('handleSignupButton', () => {
  test('shows the join modal for the clicked event', async () => {
    const interaction = { customId: 'signup:42', showModal: jest.fn() };
    await handleSignupButton(interaction);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.showModal.mock.calls[0][0].data.custom_id).toBe('join-modal:42');
  });
});

describe('handleCancelButton', () => {
  test('removes an existing signup and edits the message', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });

    const editedMessage = { edit: jest.fn(async () => {}) };
    const interaction = {
      customId: `cancel:${event.id}`,
      user: { id: 'user-1' },
      reply: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn(async () => editedMessage) } },
    };

    await handleCancelButton(interaction, db);

    expect(editedMessage.edit).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '已取消報名' }));
  });

  test('replies with an ephemeral message when the user never signed up', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const interaction = {
      customId: `cancel:${event.id}`,
      user: { id: 'user-1' },
      reply: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn() } },
    };

    await handleCancelButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '你還沒有報名喔', ephemeral: true }));
  });

  test('replies with an error when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = {
      customId: 'cancel:999',
      user: { id: 'user-1' },
      reply: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn() } },
    };

    await handleCancelButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
