const { initDb, createEvent, updateEventThreadId, getSignups, addSignup } = require('../src/db/db');
const {
  EXTERNAL_TARGET,
  buildAssistTargetPickerRows,
  buildAssistClassButtonRows,
  buildAssistJoinModal,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
} = require('../src/interactions/assist-signup');
const { CLASS_OPTIONS } = require('../src/interactions/signup-button');

describe('buildAssistTargetPickerRows', () => {
  test('returns a user-select row and an external-friend button row', () => {
    const rows = buildAssistTargetPickerRows(42);
    expect(rows).toHaveLength(2);
    expect(rows[0].components[0].data.custom_id).toBe('assist-user-select:42');
    expect(rows[1].components[0].data.custom_id).toBe('assist-external:42');
  });
});

describe('buildAssistClassButtonRows', () => {
  test('embeds the event id and target user id in each class button customId', () => {
    const rows = buildAssistClassButtonRows(42, 'user-9');
    expect(rows).toHaveLength(3);
    expect(rows[0].components[0].data.custom_id).toBe(`assist-class-choice:42:user-9:${CLASS_OPTIONS[0]}`);
  });

  test('uses the literal "external" target for a non-Discord friend', () => {
    const rows = buildAssistClassButtonRows(42, EXTERNAL_TARGET);
    expect(rows[0].components[0].data.custom_id).toBe(`assist-class-choice:42:external:${CLASS_OPTIONS[0]}`);
  });
});

describe('buildAssistJoinModal', () => {
  test('has 3 fields (等級／遊戲 ID／備註) when assisting a real member', () => {
    const modal = buildAssistJoinModal(42, 'user-9', '冰雷');
    expect(modal.data.custom_id).toBe('assist-join-modal:42:user-9:冰雷');
    expect(modal.components).toHaveLength(3);
    expect(modal.components[0].components[0].data.label).toBe('等級');
  });

  test('has an extra 暱稱 field first when assisting a non-Discord friend', () => {
    const modal = buildAssistJoinModal(42, EXTERNAL_TARGET, '冰雷');
    expect(modal.data.custom_id).toBe('assist-join-modal:42:external:冰雷');
    expect(modal.components).toHaveLength(4);
    expect(modal.components[0].components[0].data.label).toBe('暱稱');
    expect(modal.components[1].components[0].data.label).toBe('等級');
  });
});

describe('handleAssistButton', () => {
  test('replies with an ephemeral target-picker for the clicked event', async () => {
    const interaction = { customId: 'assist:42', reply: jest.fn(async () => {}) };
    await handleAssistButton(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const replyPayload = interaction.reply.mock.calls[0][0];
    expect(replyPayload.ephemeral).toBe(true);
    expect(replyPayload.components[0].components[0].data.custom_id).toBe('assist-user-select:42');
  });
});

describe('handleAssistUserSelect', () => {
  test('updates the message to the class picker for the selected member', async () => {
    const interaction = { customId: 'assist-user-select:42', values: ['user-9'], update: jest.fn(async () => {}) };
    await handleAssistUserSelect(interaction);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const payload = interaction.update.mock.calls[0][0];
    expect(payload.components[0].components[0].data.custom_id).toBe(`assist-class-choice:42:user-9:${CLASS_OPTIONS[0]}`);
  });
});

describe('handleAssistExternalButton', () => {
  test('updates the message to the class picker for the external target', async () => {
    const interaction = { customId: 'assist-external:42', update: jest.fn(async () => {}) };
    await handleAssistExternalButton(interaction);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const payload = interaction.update.mock.calls[0][0];
    expect(payload.components[0].components[0].data.custom_id).toBe(`assist-class-choice:42:external:${CLASS_OPTIONS[0]}`);
  });
});

describe('handleAssistClassChoiceButton', () => {
  test('shows the assist join-details modal for the chosen event, target and class', async () => {
    const interaction = { customId: 'assist-class-choice:42:user-9:冰雷', showModal: jest.fn() };
    await handleAssistClassChoiceButton(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('assist-join-modal:42:user-9:冰雷');
  });
});

function makeEvent(db, overrides = {}) {
  const event = createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 2,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
  updateEventThreadId(db, event.id, 'thread-1');
  return event;
}

// updateEventAnnouncement fetches both the main channel and (when present)
// the event's thread by id off the client, rather than trusting whichever
// channel the interaction happened to come from — see event-embed.test.js.
function makeAssistModalInteraction({ customId, helperId, fieldValues, fetchedUser, fetchedMessage, thread }) {
  const fieldEntries = new Map(Object.entries(fieldValues).map(([id, value]) => [id, { value }]));
  const channel = { messages: { fetch: jest.fn(async () => fetchedMessage) } };
  return {
    customId,
    user: { id: helperId, username: helperId },
    fields: {
      getTextInputValue: (id) => {
        if (!fieldEntries.has(id)) {
          throw new Error(`Required field with custom id "${id}" not found.`);
        }
        return fieldEntries.get(id).value;
      },
      fields: fieldEntries,
    },
    deferUpdate: jest.fn(async () => {}),
    deleteReply: jest.fn(async () => {}),
    followUp: jest.fn(async () => {}),
    channel,
    client: {
      channels: { fetch: jest.fn(async (id) => (id === 'thread-1' ? thread : channel)) },
      users: { fetch: jest.fn(async () => fetchedUser) },
    },
  };
}

describe('handleAssistJoinModal', () => {
  test('signs up a real member under their own user id, tagged with who assisted them', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:user-9:冰雷`,
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1' },
      fetchedUser: { username: 'IceGuy' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleAssistJoinModal(interaction, db);

    expect(interaction.client.users.fetch).toHaveBeenCalledWith('user-9');
    const [signup] = getSignups(db, event.id);
    expect(signup).toMatchObject({ user_id: 'user-9', display_name: 'IceGuy', added_by_user_id: 'helper-1', is_external: 0 });
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('<@user-9>'),
    }));
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('由 <@helper-1> 代為報名'),
      allowedMentions: { users: ['user-9', 'helper-1'] },
    }));
  });

  test('does not list a user id twice in allowedMentions when assisting your own signup', async () => {
    // Same underlying bug as signup-button.js: Discord's real API rejects
    // allowed_mentions.users with a duplicate id (code 50035). If a helper
    // picks themselves as the assist target, target user id and helper id
    // are the same, so the array must be deduped.
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:helper-1:冰雷`,
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1' },
      fetchedUser: { username: 'Helper' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleAssistJoinModal(interaction, db);

    const { allowedMentions } = thread.send.mock.calls[0][0];
    expect(allowedMentions.users).toEqual(['helper-1']);
  });

  test('falls back to the raw user id as display name when fetching the user fails', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:user-9:冰雷`,
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1' },
      fetchedMessage: editedMessage,
      thread,
    });
    interaction.client.users.fetch = jest.fn(async () => { throw new Error('Unknown User'); });

    await expect(handleAssistJoinModal(interaction, db)).resolves.not.toThrow();

    const [signup] = getSignups(db, event.id);
    expect(signup).toMatchObject({ user_id: 'user-9', display_name: 'user-9', added_by_user_id: 'helper-1', is_external: 0 });
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('<@user-9>'),
    }));
  });

  test('signs up a non-Discord friend under a synthetic external id with the typed nickname', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:external:冰雷`,
      helperId: 'helper-1',
      fieldValues: { nickname: '小明', level: '70', game_id: 'ming#1' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleAssistJoinModal(interaction, db);

    expect(interaction.client.users.fetch).not.toHaveBeenCalled();
    const [signup] = getSignups(db, event.id);
    expect(signup).toMatchObject({ display_name: '小明', added_by_user_id: 'helper-1', is_external: 1 });
    expect(signup.user_id.startsWith('ext:')).toBe(true);
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('**小明**'),
    }));
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('由 <@helper-1> 代為報名'),
      allowedMentions: { users: ['helper-1'] },
    }));
  });

  test('replies with a follow-up and does nothing when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = makeAssistModalInteraction({
      customId: 'assist-join-modal:999:user-9:冰雷',
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1' },
    });

    await handleAssistJoinModal(interaction, db);

    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true }),
    );
  });

  test('still signs up and notifies the thread when the announcement message was already deleted', async () => {
    // Regression: checkAndCleanupEvents (or a human) can delete the
    // announcement message while its thread survives, leaving a stale
    // signup card behind. Clicking 代報名 on it must not silently fail.
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const unknownMessage = Object.assign(new Error('Unknown Message'), { code: 10008 });
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:user-9:冰雷`,
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1' },
      fetchedUser: { username: 'IceGuy' },
      thread,
    });
    interaction.channel.messages.fetch = jest.fn(async () => { throw unknownMessage; });

    await expect(handleAssistJoinModal(interaction, db)).resolves.not.toThrow();

    const [signup] = getSignups(db, event.id);
    expect(signup).toMatchObject({ user_id: 'user-9', added_by_user_id: 'helper-1' });
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('由 <@helper-1> 代為報名'),
    }));
  });

  test('replies with a follow-up and does not sign up when the event is full', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 1 });
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a' });

    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:user-9:冰雷`,
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1' },
      fetchedUser: { username: 'IceGuy' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleAssistJoinModal(interaction, db);

    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: '已經額滿了', ephemeral: true }));
  });

  test('silently does nothing when the target has already signed up', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { capacity: 5 });
    addSignup(db, event, { userId: 'user-9', displayName: 'IceGuy', className: '戰士', level: '70', gameId: 'a' });

    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:user-9:冰雷`,
      helperId: 'helper-1',
      fieldValues: { level: '65', game_id: 'ice#1' },
      fetchedUser: { username: 'IceGuy' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleAssistJoinModal(interaction, db);

    expect(editedMessage.edit).not.toHaveBeenCalled();
    expect(thread.send).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(getSignups(db, event.id)).toHaveLength(1);
  });

  test('includes the note segment in the thread message when provided', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const editedMessage = { edit: jest.fn(async () => {}) };
    const thread = { send: jest.fn(async () => {}) };
    const interaction = makeAssistModalInteraction({
      customId: `assist-join-modal:${event.id}:user-9:冰雷`,
      helperId: 'helper-1',
      fieldValues: { level: '70', game_id: 'ice#1', note: '本尊的小號' },
      fetchedUser: { username: 'IceGuy' },
      fetchedMessage: editedMessage,
      thread,
    });

    await handleAssistJoinModal(interaction, db);

    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('備註：本尊的小號'),
    }));
  });
});
