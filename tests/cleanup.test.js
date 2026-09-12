const { checkAndCleanupEvents, CLEANUP_DELAY_MS } = require('../src/cleanup');
const { initDb, createEvent, updateEventThreadId, getEventById, markEventCleaned } = require('../src/db/db');

describe('checkAndCleanupEvents', () => {
  function makeDueEvent(db, overrides = {}) {
    const createdAt = new Date(2026, 6, 1, 0, 0); // 2026-07-01, well before the 7/12 session
    const event = createEvent(db, {
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      title: '週三夜間團',
      capacity: 5,
      session: 1,
      startTime: '7/12 20:00',
      creatorId: 'creator-1',
      ...overrides,
    });
    db.prepare('UPDATE events SET created_at = ? WHERE id = ?').run(createdAt.toISOString(), event.id);
    updateEventThreadId(db, event.id, overrides.threadId ?? 'thread-1');
    return getEventById(db, event.id);
  }

  function makeClientAndChannel() {
    const message = { delete: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => message) } };
    const thread = { delete: jest.fn(async () => {}) };
    const client = {
      channels: {
        fetch: jest.fn(async (id) => (id === 'thread-1' ? thread : channel)),
      },
    };
    return { client, channel, message, thread };
  }

  test('deletes the announcement message and thread, then marks cleaned_at, once 2 hours have passed since start', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    const now = new Date(2026, 6, 12, 22, 1); // 2h 1m after the 20:00 start
    const { client, channel, message, thread } = makeClientAndChannel();

    await checkAndCleanupEvents(client, db, now);

    expect(channel.messages.fetch).toHaveBeenCalledWith('message-1');
    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(thread.delete).toHaveBeenCalledTimes(1);
    expect(getEventById(db, event.id).cleaned_at).toBe(now.toISOString());
  });

  test('does not clean up before 2 hours have passed since start', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    const now = new Date(2026, 6, 12, 21, 59); // 1h59m after start
    const { client, message, thread } = makeClientAndChannel();

    await checkAndCleanupEvents(client, db, now);

    expect(message.delete).not.toHaveBeenCalled();
    expect(thread.delete).not.toHaveBeenCalled();
    expect(getEventById(db, event.id).cleaned_at).toBeNull();
  });

  test('does not clean up again once cleaned_at is already set', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    markEventCleaned(db, event.id, '2026-07-12T22:05:00.000Z');
    const now = new Date(2026, 6, 12, 22, 30);
    const { client, message, thread } = makeClientAndChannel();

    await checkAndCleanupEvents(client, db, now);

    expect(message.delete).not.toHaveBeenCalled();
    expect(thread.delete).not.toHaveBeenCalled();
  });

  test('treats an already-deleted announcement message as already cleaned up', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    const now = new Date(2026, 6, 12, 22, 1);
    const unknownMessage = Object.assign(new Error('Unknown Message'), { code: 10008 });
    const channel = { messages: { fetch: jest.fn(async () => { throw unknownMessage; }) } };
    const thread = { delete: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async (id) => (id === 'thread-1' ? thread : channel)) } };

    await checkAndCleanupEvents(client, db, now);

    expect(thread.delete).toHaveBeenCalledTimes(1);
    expect(getEventById(db, event.id).cleaned_at).toBe(now.toISOString());
  });

  test('treats an already-deleted thread as already cleaned up', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    const now = new Date(2026, 6, 12, 22, 1);
    const unknownChannel = Object.assign(new Error('Unknown Channel'), { code: 10003 });
    const { client, message } = makeClientAndChannel();
    client.channels.fetch.mockImplementation(async (id) => {
      if (id === 'thread-1') throw unknownChannel;
      return { messages: { fetch: jest.fn(async () => message) } };
    });

    await checkAndCleanupEvents(client, db, now);

    expect(message.delete).toHaveBeenCalledTimes(1);
    expect(getEventById(db, event.id).cleaned_at).toBe(now.toISOString());
  });

  test('isolates a failure cleaning up one event from other due events in the same poll', async () => {
    const db = initDb(':memory:');
    const failingEvent = makeDueEvent(db, { messageId: 'message-1', threadId: 'thread-bad' });
    const okEvent = makeDueEvent(db, { messageId: 'message-2', threadId: 'thread-good' });
    const now = new Date(2026, 6, 12, 22, 30);
    const okMessage = { delete: jest.fn(async () => {}) };
    const okThread = { delete: jest.fn(async () => {}) };
    const okChannel = { messages: { fetch: jest.fn(async () => okMessage) } };
    const client = {
      channels: {
        fetch: jest.fn(async (id) => {
          if (id === 'thread-bad') throw new Error('Unknown Channel');
          if (id === 'thread-good') return okThread;
          return okChannel;
        }),
      },
    };
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(checkAndCleanupEvents(client, db, now)).resolves.toBeUndefined();

    expect(okThread.delete).toHaveBeenCalledTimes(1);
    expect(getEventById(db, okEvent.id).cleaned_at).toBe(now.toISOString());
    expect(getEventById(db, failingEvent.id).cleaned_at).toBeNull();
    consoleErrorSpy.mockRestore();
  });
});
