const { initDb, createEvent, updateEventThreadId, addSignup, markEventCleaned } = require('../src/db/db');
const { data, execute } = require('../src/commands/list-events');

function makeEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '週三夜間團',
    capacity: 6,
    session: 1,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}

describe('list-events command', () => {
  test('command name is list', () => {
    expect(data.name).toBe('list');
  });

  test('replies ephemeral with a placeholder when there are no active events', async () => {
    const db = initDb(':memory:');
    const interaction = { guildId: 'guild-1', reply: jest.fn(async () => {}) };

    await execute(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith({ content: '目前沒有進行中的揪團', ephemeral: true });
  });

  test('lists an active event with title, session, time, headcount, creator and a thread link', async () => {
    const db = initDb(':memory:');
    const event = makeEvent(db);
    updateEventThreadId(db, event.id, 'thread-1');
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'a#1' });
    const interaction = { guildId: 'guild-1', reply: jest.fn(async () => {}) };

    await execute(interaction, db);

    const payload = interaction.reply.mock.calls[0][0];
    expect(payload.ephemeral).toBe(true);
    const description = payload.embeds[0].data.description;
    expect(description).toContain('週三夜間團（1場）');
    expect(description).toContain('7/12 20:00');
    expect(description).toContain('1/6');
    expect(description).toContain('開團主：<@creator-1>');
    expect(description).toContain('<#thread-1>');
  });

  test('lists multiple active events in creation order', async () => {
    const db = initDb(':memory:');
    const first = makeEvent(db, { title: '普拉', messageId: 'message-1' });
    const second = makeEvent(db, { title: '龍王', messageId: 'message-2' });
    updateEventThreadId(db, first.id, 'thread-1');
    updateEventThreadId(db, second.id, 'thread-2');
    const interaction = { guildId: 'guild-1', reply: jest.fn(async () => {}) };

    await execute(interaction, db);

    const description = interaction.reply.mock.calls[0][0].embeds[0].data.description;
    const lines = description.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('普拉');
    expect(lines[1]).toContain('龍王');
  });

  test('excludes events that have already been cleaned up', async () => {
    const db = initDb(':memory:');
    const cleanedEvent = makeEvent(db, { messageId: 'message-1' });
    updateEventThreadId(db, cleanedEvent.id, 'thread-1');
    markEventCleaned(db, cleanedEvent.id, '2026-07-12T22:00:00.000Z');
    const interaction = { guildId: 'guild-1', reply: jest.fn(async () => {}) };

    await execute(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith({ content: '目前沒有進行中的揪團', ephemeral: true });
  });

  test('excludes events from a different guild', async () => {
    const db = initDb(':memory:');
    const otherGuildEvent = makeEvent(db, { guildId: 'guild-2', messageId: 'message-1' });
    updateEventThreadId(db, otherGuildEvent.id, 'thread-1');
    const interaction = { guildId: 'guild-1', reply: jest.fn(async () => {}) };

    await execute(interaction, db);

    expect(interaction.reply).toHaveBeenCalledWith({ content: '目前沒有進行中的揪團', ephemeral: true });
  });
});
