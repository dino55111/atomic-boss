const { createGuildMemberAddHandler } = require('../src/welcome-member');

function makeMember(overrides = {}) {
  return {
    id: 'member-1',
    roles: { cache: { has: jest.fn(() => false) } },
    client: { channels: { fetch: jest.fn(async () => ({ send: jest.fn(async () => {}) })) } },
    ...overrides,
  };
}

describe('createGuildMemberAddHandler', () => {
  test('does nothing when no welcomeChannelId is configured', async () => {
    const handle = createGuildMemberAddHandler(undefined, 'role-1');
    const member = makeMember();

    await handle(member);

    expect(member.client.channels.fetch).not.toHaveBeenCalled();
  });

  test('skips members who have the excluded role', async () => {
    const handle = createGuildMemberAddHandler('channel-1', 'role-1');
    const member = makeMember({ roles: { cache: { has: jest.fn(() => true) } } });

    await handle(member);

    expect(member.client.channels.fetch).not.toHaveBeenCalled();
  });

  test('posts a welcome message mentioning the new member', async () => {
    const send = jest.fn(async () => {});
    const member = makeMember({ client: { channels: { fetch: jest.fn(async () => ({ send })) } } });
    const handle = createGuildMemberAddHandler('channel-1', 'role-1');

    await handle(member);

    expect(member.client.channels.fetch).toHaveBeenCalledWith('channel-1');
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.content).toContain('<@member-1>');
    expect(payload.allowedMentions).toEqual({ users: ['member-1'] });
  });

  test('swallows a failed channel fetch instead of throwing', async () => {
    const member = makeMember({
      client: { channels: { fetch: jest.fn(async () => { throw new Error('Unknown Channel'); }) } },
    });
    const handle = createGuildMemberAddHandler('channel-1', 'role-1');

    await expect(handle(member)).resolves.toBeUndefined();
  });

  test('swallows a failed send instead of throwing', async () => {
    const member = makeMember({
      client: { channels: { fetch: jest.fn(async () => ({ send: jest.fn(async () => { throw new Error('Missing Permissions'); }) })) } },
    });
    const handle = createGuildMemberAddHandler('channel-1', 'role-1');

    await expect(handle(member)).resolves.toBeUndefined();
  });
});
