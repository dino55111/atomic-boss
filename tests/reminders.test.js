const { resolveEventStartDateTime, checkAndSendReminders, REMINDER_LEAD_MINUTES } = require('../src/reminders');
const { initDb, createEvent, updateEventThreadId, addSignup, getEventById, markEventReminded } = require('../src/db/db');

describe('resolveEventStartDateTime', () => {
  test('resolves a same-year date to the year the event was created in', () => {
    const createdAt = new Date(2026, 6, 1, 0, 0); // 2026-07-01 (month is 0-indexed)
    const event = { start_time: '7/12 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(12);
    expect(result.getHours()).toBe(20);
    expect(result.getMinutes()).toBe(0);
  });

  test('rolls over to next year when the date is more than a day before the creation date', () => {
    const createdAt = new Date(2026, 11, 28, 0, 0); // 2026-12-28
    const event = { start_time: '1/5 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(5);
  });

  test('does not roll over when the date is only slightly before the creation time on the same day', () => {
    const createdAt = new Date(2026, 6, 12, 20, 5); // 2026-07-12 20:05, 5 minutes after the chosen start time
    const event = { start_time: '7/12 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(12);
    expect(result.getHours()).toBe(20);
    expect(result.getMinutes()).toBe(0);
  });

  test('does not roll over exactly at the 1-day boundary (only strictly more than 1 day triggers it)', () => {
    const createdAt = new Date(2026, 6, 13, 20, 0); // exactly 1 day after the chosen start time
    const event = { start_time: '7/12 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(12);
  });
});

describe('checkAndSendReminders', () => {
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

  test('sends a reminder and marks reminded_at when within the 60-minute window and someone signed up', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    const now = new Date(2026, 6, 12, 19, 30); // 30 minutes before the 20:00 start
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(client.channels.fetch).toHaveBeenCalledWith('thread-1');
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('週三夜間團（1場）'),
      allowedMentions: { users: ['user-1'] },
    }));
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining(`${REMINDER_LEAD_MINUTES} 分鐘`),
    }));
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('<@user-1>'),
    }));
    expect(getEventById(db, event.id).reminded_at).toBe(now.toISOString());
  });

  test('renders an external signup with a bold name instead of a mention', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, {
      userId: 'ext:1', displayName: '小明', className: '法師', level: '65', gameId: 'm#1', isExternal: true,
    });
    const now = new Date(2026, 6, 12, 19, 30);
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('**小明**'),
      allowedMentions: { users: [] },
    }));
  });

  test('does not send when more than 60 minutes remain before the start', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    const now = new Date(2026, 6, 12, 18, 0); // 2 hours before the 20:00 start
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).not.toHaveBeenCalled();
    expect(getEventById(db, event.id).reminded_at).toBeNull();
  });

  test('does not send again once reminded_at is already set', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    markEventReminded(db, event.id, '2026-07-12T19:00:00.000Z');
    const now = new Date(2026, 6, 12, 19, 30);
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).not.toHaveBeenCalled();
  });

  test('skips and does not mark reminded_at when there are no signups yet', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    const now = new Date(2026, 6, 12, 19, 30);
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).not.toHaveBeenCalled();
    expect(getEventById(db, event.id).reminded_at).toBeNull();
  });

  test('still sends (catch-up) when now is later than the ideal reminder time but the event has not started', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    const now = new Date(2026, 6, 12, 19, 59); // 1 minute before start — long past the ideal 60-minute mark
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).toHaveBeenCalledTimes(1);
    expect(getEventById(db, event.id).reminded_at).toBe(now.toISOString());
  });

  test('does not send once the event has already started', async () => {
    const db = initDb(':memory:');
    const event = makeDueEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    const now = new Date(2026, 6, 12, 20, 1); // 1 minute after the 20:00 start
    const thread = { send: jest.fn(async () => {}) };
    const client = { channels: { fetch: jest.fn(async () => thread) } };

    await checkAndSendReminders(client, db, now);

    expect(thread.send).not.toHaveBeenCalled();
    expect(getEventById(db, event.id).reminded_at).toBeNull();
  });

  test('isolates a failure sending one reminder from other due events in the same poll', async () => {
    const db = initDb(':memory:');
    const failingEvent = makeDueEvent(db, { messageId: 'message-1', threadId: 'thread-bad' });
    const okEvent = makeDueEvent(db, { messageId: 'message-2', threadId: 'thread-good' });
    addSignup(db, failingEvent, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    addSignup(db, okEvent, { userId: 'user-2', displayName: 'Bob', className: '法師', level: '65', gameId: 'b#1' });
    const now = new Date(2026, 6, 12, 19, 30);
    const okThread = { send: jest.fn(async () => {}) };
    const client = {
      channels: {
        fetch: jest.fn(async (threadId) => {
          if (threadId === 'thread-bad') throw new Error('Unknown Channel');
          return okThread;
        }),
      },
    };
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(checkAndSendReminders(client, db, now)).resolves.toBeUndefined();

    expect(okThread.send).toHaveBeenCalledTimes(1);
    expect(getEventById(db, okEvent.id).reminded_at).toBe(now.toISOString());
    expect(getEventById(db, failingEvent.id).reminded_at).toBeNull();
    consoleErrorSpy.mockRestore();
  });
});
