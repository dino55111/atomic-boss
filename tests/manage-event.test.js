const { ButtonStyle } = require('discord.js');
const {
  initDb,
  getEventById,
  createEvent,
  updateEventThreadId,
  updateEventThreadMessageId,
  addSignup,
  markEventReminded,
  markEventCleaned,
} = require('../src/db/db');
const {
  requireCreator,
  buildEditTimeModal,
  handleEditTimeButton,
  handleEditTimeModal,
  buildCancelConfirmRow,
  handleCancelEventButton,
  handleCancelEventConfirmButton,
  handleCancelEventAbortButton,
} = require('../src/interactions/manage-event');

function makeEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 5,
    session: 3,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}

describe('requireCreator', () => {
  test('resolves true and does not reply when the clicker is the creator', async () => {
    const interaction = { user: { id: 'creator-1' }, reply: jest.fn(async () => {}) };
    const event = { creator_id: 'creator-1' };

    const result = await requireCreator(interaction, event);

    expect(result).toBe(true);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  test('replies ephemeral and resolves false when the clicker is not the creator', async () => {
    const interaction = { user: { id: 'someone-else' }, reply: jest.fn(async () => {}) };
    const event = { creator_id: 'creator-1' };

    const result = await requireCreator(interaction, event);

    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith({ content: '只有團主能操作', ephemeral: true });
  });
});

describe('buildEditTimeModal', () => {
  const now = new Date(2026, 8, 5); // Sat 2026-09-05

  test('customId embeds the event id, title mentions editing the time', () => {
    const modal = buildEditTimeModal(42, '9/6 21:30', now);
    expect(modal.data.custom_id).toBe('edit-time-modal:42');
    expect(modal.data.title).toBe('修改揪團時間');
  });

  test('has three label components wrapping the date, hour, and minute selects', () => {
    const modal = buildEditTimeModal(42, '9/6 21:30', now);
    expect(modal.components).toHaveLength(3);
    expect(modal.components.map((label) => label.data.label)).toEqual(['日期', '時', '分']);
    expect(modal.components.map((label) => label.data.component.data.custom_id)).toEqual([
      'event_date',
      'event_hour',
      'event_minute',
    ]);
  });

  test('pre-selects the date, hour, and minute matching the current start time', () => {
    const modal = buildEditTimeModal(42, '9/6 21:30', now);
    const [dateSelect, hourSelect, minuteSelect] = modal.components.map((label) => label.data.component);

    expect(dateSelect.options.find((o) => o.data.default).data.value).toBe('9/6');
    expect(dateSelect.options.filter((o) => o.data.default)).toHaveLength(1);
    expect(hourSelect.options.find((o) => o.data.default).data.value).toBe('21');
    expect(minuteSelect.options.find((o) => o.data.default).data.value).toBe('30');
  });

  test('falls back to selecting today when the current date is outside the 7-day window', () => {
    const modal = buildEditTimeModal(42, '1/1 21:30', now);
    const dateSelect = modal.components[0].data.component;

    expect(dateSelect.options.filter((o) => o.data.default)).toHaveLength(1);
    expect(dateSelect.options.find((o) => o.data.default).data.value).toBe('9/5');
  });
});

describe('handleEditTimeButton', () => {
  test('shows the edit-time modal when the clicker is the creator', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '9/6 21:30' });
    const interaction = {
      customId: `edit-time:${event.id}`,
      user: { id: 'creator-1' },
      showModal: jest.fn(),
      reply: jest.fn(async () => {}),
    };

    await handleEditTimeButton(interaction, db);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.showModal.mock.calls[0][0].data.custom_id).toBe(`edit-time-modal:${event.id}`);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  test('replies ephemeral without showing the modal when the clicker is not the creator', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const interaction = {
      customId: `edit-time:${event.id}`,
      user: { id: 'someone-else' },
      showModal: jest.fn(),
      reply: jest.fn(async () => {}),
    };

    await handleEditTimeButton(interaction, db);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({ content: '只有團主能操作', ephemeral: true });
  });

  test('replies with an error when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = {
      customId: 'edit-time:999',
      user: { id: 'creator-1' },
      showModal: jest.fn(),
      reply: jest.fn(async () => {}),
    };

    await handleEditTimeButton(interaction, db);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
  });
});

function makeEditTimeInteraction({ eventId, date, hour, minute, deferUpdateFails = false, channelsById = {} }) {
  const selectValues = { event_date: date, event_hour: hour, event_minute: minute };
  return {
    customId: `edit-time-modal:${eventId}`,
    fields: { getStringSelectValues: (id) => [selectValues[id]] },
    deferUpdate: jest.fn(async () => {
      if (deferUpdateFails) throw new Error('Unknown interaction');
    }),
    deleteReply: jest.fn(async () => {}),
    followUp: jest.fn(async () => {}),
    // Mirrors event-embed.test.js's makeClient: a channelsById entry that is
    // an Error is thrown (simulating a deleted channel/thread), not returned.
    client: {
      channels: {
        fetch: jest.fn(async (id) => {
          const entry = channelsById[id];
          if (entry instanceof Error) throw entry;
          return entry;
        }),
      },
    },
  };
}

describe('handleEditTimeModal', () => {
  test('updates start_time, resets reminded_at, refreshes both card copies, renames the thread, and notifies it', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '7/12 20:00' });
    updateEventThreadId(db, event.id, 'thread-1');
    updateEventThreadMessageId(db, event.id, 'thread-message-1');
    markEventReminded(db, event.id, '2026-07-12T19:00:00.000Z');
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });

    const channelMessage = { edit: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => channelMessage) } };
    const threadMessage = { edit: jest.fn(async () => {}) };
    const thread = {
      messages: { fetch: jest.fn(async () => threadMessage) },
      setName: jest.fn(async () => {}),
      send: jest.fn(async () => {}),
    };
    const interaction = makeEditTimeInteraction({
      eventId: event.id,
      date: '7/13',
      hour: '21',
      minute: '30',
      channelsById: { 'channel-1': channel, 'thread-1': thread },
    });

    await handleEditTimeModal(interaction, db);

    expect(getEventById(db, event.id)).toMatchObject({ start_time: '7/13 21:30', reminded_at: null });
    expect(channelMessage.edit).toHaveBeenCalledTimes(1);
    expect(threadMessage.edit).toHaveBeenCalledTimes(1);
    expect(thread.setName).toHaveBeenCalledWith('7/13 21:30 週三夜間團 3場');
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('⏰ 開團時間已改為 7/13 21:30'),
    }));
    expect(interaction.followUp).toHaveBeenCalledWith({ content: '已更新時間', ephemeral: true });
  });

  test('rejects an invalid composed time without touching the event', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '7/12 20:00' });
    const interaction = makeEditTimeInteraction({ eventId: event.id, date: '13/40', hour: '21', minute: '30' });

    await handleEditTimeModal(interaction, db);

    expect(getEventById(db, event.id).start_time).toBe('7/12 20:00');
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '時間格式錯誤，請重新點選「⏰ 改時間」設定',
      ephemeral: true,
    });
  });

  test('does nothing (but does not throw) when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = makeEditTimeInteraction({ eventId: 999, date: '7/13', hour: '21', minute: '30' });

    await expect(handleEditTimeModal(interaction, db)).resolves.not.toThrow();
    expect(interaction.followUp).toHaveBeenCalledWith({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
  });

  test('still updates the event and both card copies when the ack fails (stale interaction)', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '7/12 20:00' });
    updateEventThreadId(db, event.id, 'thread-1');
    updateEventThreadMessageId(db, event.id, 'thread-message-1');

    const channelMessage = { edit: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => channelMessage) } };
    const threadMessage = { edit: jest.fn(async () => {}) };
    const thread = {
      messages: { fetch: jest.fn(async () => threadMessage) },
      setName: jest.fn(async () => {}),
      send: jest.fn(async () => {}),
    };
    const interaction = makeEditTimeInteraction({
      eventId: event.id,
      date: '7/13',
      hour: '21',
      minute: '30',
      deferUpdateFails: true,
      channelsById: { 'channel-1': channel, 'thread-1': thread },
    });

    await handleEditTimeModal(interaction, db);

    expect(getEventById(db, event.id).start_time).toBe('7/13 21:30');
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  test('still finishes updating the event when the thread was already deleted', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db, { startTime: '7/12 20:00' });
    updateEventThreadId(db, event.id, 'thread-1');

    const channelMessage = { edit: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => channelMessage) } };
    const unknownChannel = Object.assign(new Error('Unknown Channel'), { code: 10003 });
    const interaction = makeEditTimeInteraction({
      eventId: event.id,
      date: '7/13',
      hour: '21',
      minute: '30',
      channelsById: { 'channel-1': channel, 'thread-1': unknownChannel },
    });

    await expect(handleEditTimeModal(interaction, db)).resolves.not.toThrow();
    expect(getEventById(db, event.id).start_time).toBe('7/13 21:30');
    expect(interaction.followUp).toHaveBeenCalledWith({ content: '已更新時間', ephemeral: true });
  });
});

describe('buildCancelConfirmRow', () => {
  test('builds a confirm (Danger) and abort (Secondary) button pair scoped to the event', () => {
    const row = buildCancelConfirmRow(42);
    expect(row.components).toHaveLength(2);

    const [confirm, abort] = row.components;
    expect(confirm.data.custom_id).toBe('cancel-event-confirm:42');
    expect(confirm.data.label).toBe('確定取消');
    expect(confirm.data.style).toBe(ButtonStyle.Danger);

    expect(abort.data.custom_id).toBe('cancel-event-abort');
    expect(abort.data.label).toBe('算了');
    expect(abort.data.style).toBe(ButtonStyle.Secondary);
  });
});

describe('handleCancelEventButton', () => {
  test('shows the confirm prompt when the clicker is the creator', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const interaction = { customId: `cancel-event:${event.id}`, user: { id: 'creator-1' }, reply: jest.fn(async () => {}) };

    await handleCancelEventButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '確定要取消整個揪團嗎？此動作無法復原',
      components: [expect.anything()],
      ephemeral: true,
    });
    const payload = interaction.reply.mock.calls[0][0];
    expect(payload.components[0].components[0].data.custom_id).toBe(`cancel-event-confirm:${event.id}`);
  });

  test('replies ephemeral without a confirm prompt when the clicker is not the creator', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    const interaction = { customId: `cancel-event:${event.id}`, user: { id: 'someone-else' }, reply: jest.fn(async () => {}) };

    await handleCancelEventButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith({ content: '只有團主能操作', ephemeral: true });
  });

  test('replies with an error when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = { customId: 'cancel-event:999', user: { id: 'creator-1' }, reply: jest.fn(async () => {}) };

    await handleCancelEventButton(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
  });
});

describe('handleCancelEventAbortButton', () => {
  test('dismisses the confirmation prompt without touching anything else', async () => {
    const interaction = { update: jest.fn(async () => {}) };

    await handleCancelEventAbortButton(interaction);

    expect(interaction.update).toHaveBeenCalledWith({ content: '已取消操作', components: [] });
  });
});

describe('handleCancelEventConfirmButton', () => {
  function makeCancelInteraction(eventId, channelsById = {}) {
    return {
      customId: `cancel-event-confirm:${eventId}`,
      update: jest.fn(async () => {}),
      client: { channels: { fetch: jest.fn(async (id) => channelsById[id]) } },
    };
  }

  test('acks immediately, notifies the thread, deletes the announcement and thread, and marks the event cleaned', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });

    const message = { delete: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => message) } };
    const thread = { send: jest.fn(async () => {}), delete: jest.fn(async () => {}) };
    const interaction = makeCancelInteraction(event.id, { 'channel-1': channel, 'thread-1': thread });

    await handleCancelEventConfirmButton(interaction, db);

    expect(interaction.update).toHaveBeenCalledWith({ content: '正在取消揪團…', components: [] });
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('本次揪團已由團主取消'),
    }));
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(thread.delete).toHaveBeenCalledTimes(1);

    const updated = getEventById(db, event.id);
    expect(updated.cleaned_at).not.toBeNull();
    expect(updated.reminded_at).not.toBeNull();
  });

  test('does not overwrite an already-set reminded_at', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    updateEventThreadId(db, event.id, 'thread-1');
    markEventReminded(db, event.id, '2026-07-12T19:00:00.000Z');

    const message = { delete: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => message) } };
    const thread = { send: jest.fn(async () => {}), delete: jest.fn(async () => {}) };
    const interaction = makeCancelInteraction(event.id, { 'channel-1': channel, 'thread-1': thread });

    await handleCancelEventConfirmButton(interaction, db);

    expect(getEventById(db, event.id).reminded_at).toBe('2026-07-12T19:00:00.000Z');
  });

  test('does nothing further (and does not throw) when the event no longer exists', async () => {
    const db = initDb(':memory:');
    const interaction = makeCancelInteraction(999);

    await expect(handleCancelEventConfirmButton(interaction, db)).resolves.not.toThrow();
    expect(interaction.client.channels.fetch).not.toHaveBeenCalled();
  });

  test('still marks the event cleaned when the announcement message was already deleted', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    updateEventThreadId(db, event.id, 'thread-1');

    const unknownMessage = Object.assign(new Error('Unknown Message'), { code: 10008 });
    const channel = { messages: { fetch: jest.fn(async () => { throw unknownMessage; }) } };
    const thread = { send: jest.fn(async () => {}), delete: jest.fn(async () => {}) };
    const interaction = makeCancelInteraction(event.id, { 'channel-1': channel, 'thread-1': thread });

    await expect(handleCancelEventConfirmButton(interaction, db)).resolves.not.toThrow();
    expect(thread.delete).toHaveBeenCalledTimes(1);
    expect(getEventById(db, event.id).cleaned_at).not.toBeNull();
  });
});
