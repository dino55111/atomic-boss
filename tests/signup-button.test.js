const { initDb, createEvent, updateEventThreadId, addSignup, getSignups } = require('../src/db/db');
const {
  buildClassButtonRows,
  buildClassButtonRowsForCustomIds,
  buildJoinDetailsModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
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

describe('buildClassButtonRowsForCustomIds', () => {
  test('builds the same 3x4 grid using a caller-supplied customId per class', () => {
    const rows = buildClassButtonRowsForCustomIds((className) => `custom:${className}`);
    expect(rows).toHaveLength(3);
    expect(rows[0].components[0].data.custom_id).toBe(`custom:${CLASS_OPTIONS[0]}`);
  });
});

describe('buildJoinDetailsModal', () => {
  test('customId embeds the event id and chosen class, title mentions the class, and has 3 plain text-input fields', () => {
    const modal = buildJoinDetailsModal(42, '冰雷');
    expect(modal.data.custom_id).toBe('join-modal:42:冰雷');
    expect(modal.data.title).toBe('報名揪團（冰雷）');
    expect(modal.components).toHaveLength(3);
    expect(modal.components[0].components[0].data.label).toBe('等級');
    expect(modal.components[1].components[0].data.label).toBe('遊戲 ID');
  });

  test('備註 field is optional with a placeholder hinting at alt accounts', () => {
    const modal = buildJoinDetailsModal(42, '冰雷');
    const noteInput = modal.components[2].components[0];
    expect(noteInput.data.label).toBe('備註');
    expect(noteInput.data.custom_id).toBe('note');
    expect(noteInput.data.required).toBeFalsy();
    expect(noteInput.data.placeholder).toBe('可以填 XXX 的小號');
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

  test('silently acknowledges without any message when the user never signed up', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const interaction = {
      customId: `cancel:${event.id}`,
      user: { id: 'user-1' },
      reply: jest.fn(async () => {}),
      deferUpdate: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn() } },
    };

    await handleCancelButton(interaction, db);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
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

describe('handleCancelButton with multiple cancellable signups', () => {
  test('shows a picker when the clicker has more than one cancellable signup', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 5 });
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, { userId: 'helper-1', displayName: 'Helper', className: '戰士', level: '70', gameId: 'h#1' });
    addSignup(db, event, {
      userId: 'ext:1', displayName: '小明', className: '法師', level: '65', gameId: 'm#1',
      addedByUserId: 'helper-1', isExternal: true,
    });

    const interaction = { customId: `cancel:${event.id}`, user: { id: 'helper-1' }, reply: jest.fn(async () => {}) };

    await handleCancelButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const payload = interaction.reply.mock.calls[0][0];
    expect(payload.ephemeral).toBe(true);
    expect(payload.content).toBe('請選擇要取消哪一筆報名：');
    expect(payload.components[0].components).toHaveLength(2);
  });

  test('the event creator can cancel an external signup added by someone else', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 5, creatorId: 'creator-1' });
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, {
      userId: 'ext:1', displayName: '小明', className: '法師', level: '65', gameId: 'm#1',
      addedByUserId: 'helper-1', isExternal: true,
    });

    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = {
      customId: `cancel:${event.id}`,
      user: { id: 'creator-1' },
      reply: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn(async () => editedMessage) } },
      client: { channels: { fetch: jest.fn(async () => thread) } },
    };

    await handleCancelButton(interaction, db);

    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('**小明**'));
    expect(thread.send).toHaveBeenCalledWith(expect.stringContaining('由 <@creator-1> 代為取消'));
    expect(getSignups(db, event.id)).toHaveLength(0);
  });
});

describe('handleCancelSelectButton', () => {
  test('cancels the chosen signup and updates the picker message', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 5 });
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, {
      userId: 'ext:1', displayName: '小明', className: '法師', level: '65', gameId: 'm#1',
      addedByUserId: 'helper-1', isExternal: true,
    });
    const [signup] = getSignups(db, event.id);

    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = {
      customId: `cancel-select:${event.id}:${signup.id}`,
      user: { id: 'helper-1' },
      update: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn(async () => editedMessage) } },
      client: { channels: { fetch: jest.fn(async () => thread) } },
    };

    await handleCancelSelectButton(interaction, db);

    expect(getSignups(db, event.id)).toHaveLength(0);
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({ content: '已取消報名' }));
  });

  test('gracefully updates the message when the signup was already removed', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 5 });

    const interaction = {
      customId: `cancel-select:${event.id}:999`,
      user: { id: 'helper-1' },
      update: jest.fn(async () => {}),
      channel: { messages: { fetch: jest.fn() } },
    };

    await handleCancelSelectButton(interaction, db);

    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({ content: '這筆報名已經不存在了' }));
  });
});
