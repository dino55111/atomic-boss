const { createMessageCreateHandler, REMINDER_TTL_MS } = require('../src/command-only-channel');

function makeMessage(overrides = {}) {
  return {
    id: 'message-1',
    channelId: 'channel-1',
    author: { id: 'user-1', bot: false },
    delete: jest.fn(async () => {}),
    channel: { send: jest.fn(async () => ({ delete: jest.fn(async () => {}) })) },
    ...overrides,
  };
}

describe('createMessageCreateHandler', () => {
  test('does nothing when no commandOnlyChannelId is configured', async () => {
    const handle = createMessageCreateHandler(undefined);
    const message = makeMessage();

    await handle(message);

    expect(message.delete).not.toHaveBeenCalled();
  });

  test('ignores messages outside the restricted channel', async () => {
    const handle = createMessageCreateHandler('channel-1');
    const message = makeMessage({ channelId: 'channel-2' });

    await handle(message);

    expect(message.delete).not.toHaveBeenCalled();
  });

  test('ignores messages from bots, including its own announcements', async () => {
    const handle = createMessageCreateHandler('channel-1');
    const message = makeMessage({ author: { id: 'bot-1', bot: true } });

    await handle(message);

    expect(message.delete).not.toHaveBeenCalled();
  });

  test('deletes a member\'s message in the restricted channel', async () => {
    const handle = createMessageCreateHandler('channel-1');
    const message = makeMessage();

    await handle(message);

    expect(message.delete).toHaveBeenCalledTimes(1);
  });

  test('posts a reminder that mentions the author and pings only them', async () => {
    const handle = createMessageCreateHandler('channel-1');
    const message = makeMessage();

    await handle(message);

    expect(message.channel.send).toHaveBeenCalledTimes(1);
    const payload = message.channel.send.mock.calls[0][0];
    expect(payload.content).toContain('<@user-1>');
    expect(payload.allowedMentions).toEqual({ users: ['user-1'] });
  });

  test('swallows a failed delete instead of throwing', async () => {
    const handle = createMessageCreateHandler('channel-1');
    const message = makeMessage({ delete: jest.fn(async () => { throw new Error('Unknown Message'); }) });

    await expect(handle(message)).resolves.toBeUndefined();
  });

  test('swallows a failed reminder send instead of throwing', async () => {
    const handle = createMessageCreateHandler('channel-1');
    const message = makeMessage({ channel: { send: jest.fn(async () => { throw new Error('Missing Permissions'); }) } });

    await expect(handle(message)).resolves.toBeUndefined();
  });

  describe('reminder auto-delete', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('does not delete the reminder before REMINDER_TTL_MS has passed', async () => {
      const reminderDelete = jest.fn(async () => {});
      const handle = createMessageCreateHandler('channel-1');
      const message = makeMessage({ channel: { send: jest.fn(async () => ({ delete: reminderDelete })) } });

      await handle(message);
      jest.advanceTimersByTime(REMINDER_TTL_MS - 1);

      expect(reminderDelete).not.toHaveBeenCalled();
    });

    test('deletes the reminder once REMINDER_TTL_MS has passed', async () => {
      const reminderDelete = jest.fn(async () => {});
      const handle = createMessageCreateHandler('channel-1');
      const message = makeMessage({ channel: { send: jest.fn(async () => ({ delete: reminderDelete })) } });

      await handle(message);
      jest.advanceTimersByTime(REMINDER_TTL_MS);

      expect(reminderDelete).toHaveBeenCalledTimes(1);
    });
  });
});
