const { initDb, createEvent, updateEventThreadId, addSignup } = require('../src/db/db');
const {
  buildClassButtonRows,
  buildJoinDetailsModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  CLASS_OPTIONS,
} = require('../src/interactions/signup-button');

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

describe('buildClassButtonRows', () => {
  test('lays out all 12 class options across 3 rows of 4 buttons', () => {
    const rows = buildClassButtonRows(42);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.components.length === 4)).toBe(true);

    const labels = rows.flatMap((row) => row.components.map((button) => button.data.label));
    expect(labels).toEqual(CLASS_OPTIONS);
  });

  test('each button customId embeds the event id and its own class', () => {
    const rows = buildClassButtonRows(42);
    const firstButton = rows[0].components[0];
    expect(firstButton.data.custom_id).toBe(`class-choice:42:${CLASS_OPTIONS[0]}`);
  });
});

describe('buildJoinDetailsModal', () => {
  test('customId embeds the event id and chosen class, title mentions the class, and has 2 fields', () => {
    const modal = buildJoinDetailsModal(42, '冰雷');
    expect(modal.data.custom_id).toBe('join-modal:42:冰雷');
    expect(modal.data.title).toBe('報名揪團（冰雷）');
    expect(modal.components).toHaveLength(2);
    expect(modal.components[0].data.label).toBe('等級');
    expect(modal.components[1].data.label).toBe('遊戲 ID');
  });
});

describe('handleSignupButton', () => {
  test('replies with an ephemeral class-picker message for the clicked event', async () => {
    const interaction = { customId: 'signup:42', reply: jest.fn(async () => {}) };
    await handleSignupButton(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const replyPayload = interaction.reply.mock.calls[0][0];
    expect(replyPayload.ephemeral).toBe(true);
    expect(replyPayload.components).toHaveLength(3);
    expect(replyPayload.components[0].components[0].data.custom_id).toBe(`class-choice:42:${CLASS_OPTIONS[0]}`);
  });
});

describe('handleClassChoiceButton', () => {
  test('shows the join-details modal for the chosen event and class', async () => {
    const interaction = { customId: 'class-choice:42:冰雷', showModal: jest.fn() };
    await handleClassChoiceButton(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('join-modal:42:冰雷');
  });
});

describe('handleCancelButton', () => {
  test('removes an existing signup, edits the message, and posts to the thread', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });

    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = {
      customId: `cancel:${event.id}`,
      user: { id: 'user-1' },
      reply: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn(async () => editedMessage) } },
      client: { channels: { fetch: jest.fn(async () => thread) } },
    };

    await handleCancelButton(interaction, db);

    expect(editedMessage.edit).toHaveBeenCalledTimes(1);
    expect(interaction.client.channels.fetch).toHaveBeenCalledWith('thread-1');
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('<@user-1>'));
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
