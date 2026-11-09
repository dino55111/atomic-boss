const { createVerificationMessageHandler, parseVerificationMessage } = require('../src/verification-message');

const VALID_CONTENT = `遊戲名稱：星星還沒睡
遊戲UID: #JUdUuB
職業：夜使者
最常出沒時間：每天22：00後`;

describe('parseVerificationMessage', () => {
  test('extracts the game name from a fully-filled message', () => {
    expect(parseVerificationMessage(VALID_CONTENT)).toEqual({ gameName: '星星還沒睡' });
  });

  test('returns null when a field is missing', () => {
    const content = `遊戲名稱：星星還沒睡
遊戲UID: #JUdUuB
最常出沒時間：每天22：00後`;

    expect(parseVerificationMessage(content)).toBeNull();
  });

  test('returns null for non-string content', () => {
    expect(parseVerificationMessage(undefined)).toBeNull();
  });
});

function makeMessage(overrides = {}) {
  return {
    channelId: 'channel-1',
    author: { id: 'user-1', bot: false },
    content: VALID_CONTENT,
    member: {
      roles: { remove: jest.fn(async () => {}) },
      setNickname: jest.fn(async () => {}),
    },
    ...overrides,
  };
}

describe('createVerificationMessageHandler', () => {
  test('does nothing when no channelId is configured', async () => {
    const handle = createVerificationMessageHandler(undefined, 'role-1');
    const message = makeMessage();

    await handle(message);

    expect(message.member.roles.remove).not.toHaveBeenCalled();
  });

  test('does nothing when no roleId is configured', async () => {
    const handle = createVerificationMessageHandler('channel-1', undefined);
    const message = makeMessage();

    await handle(message);

    expect(message.member.roles.remove).not.toHaveBeenCalled();
  });

  test('ignores messages outside the configured channel', async () => {
    const handle = createVerificationMessageHandler('channel-1', 'role-1');
    const message = makeMessage({ channelId: 'channel-2' });

    await handle(message);

    expect(message.member.roles.remove).not.toHaveBeenCalled();
  });

  test('ignores messages from bots', async () => {
    const handle = createVerificationMessageHandler('channel-1', 'role-1');
    const message = makeMessage({ author: { id: 'bot-1', bot: true } });

    await handle(message);

    expect(message.member.roles.remove).not.toHaveBeenCalled();
  });

  test('ignores messages that do not match the verification format', async () => {
    const handle = createVerificationMessageHandler('channel-1', 'role-1');
    const message = makeMessage({ content: '這只是一般留言' });

    await handle(message);

    expect(message.member.roles.remove).not.toHaveBeenCalled();
    expect(message.member.setNickname).not.toHaveBeenCalled();
  });

  test('does nothing when the message has no resolved member', async () => {
    const handle = createVerificationMessageHandler('channel-1', 'role-1');
    const message = makeMessage({ member: null });

    await expect(handle(message)).resolves.toBeUndefined();
  });

  test('removes the configured role from a matching message\'s author', async () => {
    const handle = createVerificationMessageHandler('channel-1', 'role-1');
    const message = makeMessage();

    await handle(message);

    expect(message.member.roles.remove).toHaveBeenCalledWith('role-1');
  });

  test('sets the nickname to the parsed game name', async () => {
    const handle = createVerificationMessageHandler('channel-1', 'role-1');
    const message = makeMessage();

    await handle(message);

    expect(message.member.setNickname).toHaveBeenCalledWith('星星還沒睡');
  });

  test('still attempts the nickname change when removing the role fails', async () => {
    const message = makeMessage({
      member: {
        roles: { remove: jest.fn(async () => { throw new Error('Missing Permissions'); }) },
        setNickname: jest.fn(async () => {}),
      },
    });
    const handle = createVerificationMessageHandler('channel-1', 'role-1');

    await handle(message);

    expect(message.member.setNickname).toHaveBeenCalledWith('星星還沒睡');
  });

  test('swallows a failed nickname change instead of throwing', async () => {
    const message = makeMessage({
      member: {
        roles: { remove: jest.fn(async () => {}) },
        setNickname: jest.fn(async () => { throw new Error('Missing Permissions'); }),
      },
    });
    const handle = createVerificationMessageHandler('channel-1', 'role-1');

    await expect(handle(message)).resolves.toBeUndefined();
  });
});
