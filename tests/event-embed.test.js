const { buildEventEmbed, buildActionRow, updateEventAnnouncement } = require('../src/embeds/event-embed');
const { TITLE_NOTES } = require('../src/commands/create-event');

const baseEvent = { id: 1, title: '週三夜間團', capacity: 2, session: 3, start_time: '7/12 20:00', creator_id: 'creator-1' };

describe('buildEventEmbed', () => {
  test('shows who opened the event', () => {
    const embed = buildEventEmbed(baseEvent, []);
    const creatorField = embed.data.fields.find((f) => f.name === '開團主');
    expect(creatorField.value).toBe('<@creator-1>');
  });

  test('shows the 注意事項 field with the matching title\'s notes', () => {
    const event = { ...baseEvent, title: '普拉' };
    const embed = buildEventEmbed(event, []);
    const notesField = embed.data.fields.find((f) => f.name === '注意事項');
    expect(notesField.value).toBe(TITLE_NOTES['普拉']);
  });

  test('omits the 注意事項 field for a title with no configured notes', () => {
    const embed = buildEventEmbed(baseEvent, []);
    const notesField = embed.data.fields.find((f) => f.name === '注意事項');
    expect(notesField).toBeUndefined();
  });

  test('shows the session field', () => {
    const embed = buildEventEmbed(baseEvent, []);
    const sessionField = embed.data.fields.find((f) => f.name === '場次');
    expect(sessionField.value).toBe('3場');
  });

  test('shows placeholder text when there are no signups', () => {
    const embed = buildEventEmbed(baseEvent, []);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toBe('目前尚無人報名');
  });

  test('lists each signup with class, level and game id', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1', note: '' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toContain('<@user-1>');
    expect(rosterField.value).toContain('戰士');
    expect(rosterField.value).toContain('70');
    expect(rosterField.value).toContain('alice#1');
  });

  test('appends the note when present', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1', note: '本尊的小號' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toContain('本尊的小號');
  });

  test('omits any note segment when the note is empty', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1', note: '' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).not.toContain('備註');
  });

  test('shows current count over capacity', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const countField = embed.data.fields.find((f) => f.name === '人數');
    expect(countField.value).toBe('1 / 2');
  });

  test('renders a bold display name instead of a mention for an external (non-Discord) signup', () => {
    const signups = [{ user_id: 'ext:1', display_name: '小明', class: '戰士', level: '70', game_id: 'ming#1', note: '', is_external: 1 }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toContain('**小明**');
    expect(rosterField.value).not.toContain('<@ext:1>');
  });

  test('appends who assisted the signup when added_by_user_id is set', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1', note: '', added_by_user_id: 'helper-1' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toContain('代報名：<@helper-1>');
  });

  test('omits the assist segment for a self-signup', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1', note: '' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).not.toContain('代報名');
  });
});

describe('buildActionRow', () => {
  test('signup button is enabled when there is room', () => {
    const row = buildActionRow(baseEvent, 1);
    expect(row.components[0].data.disabled).toBeFalsy();
  });

  test('signup button is disabled when the event is full', () => {
    const row = buildActionRow(baseEvent, 2);
    expect(row.components[0].data.disabled).toBe(true);
  });

  test('assist button is enabled when there is room', () => {
    const row = buildActionRow(baseEvent, 1);
    expect(row.components[1].data.disabled).toBeFalsy();
  });

  test('assist button is disabled when the event is full', () => {
    const row = buildActionRow(baseEvent, 2);
    expect(row.components[1].data.disabled).toBe(true);
  });

  test('cancel button is always enabled', () => {
    const row = buildActionRow(baseEvent, 2);
    expect(row.components[2].data.disabled).toBeFalsy();
  });
});

describe('updateEventAnnouncement', () => {
  test('fetches the announcement message and edits it with the rebuilt embed and row', async () => {
    const message = { edit: jest.fn(async () => {}) };
    const channel = { messages: { fetch: jest.fn(async () => message) } };

    await updateEventAnnouncement(channel, { ...baseEvent, message_id: 'message-1' }, []);

    expect(channel.messages.fetch).toHaveBeenCalledWith('message-1');
    expect(message.edit).toHaveBeenCalledTimes(1);
    const payload = message.edit.mock.calls[0][0];
    expect(payload.embeds).toHaveLength(1);
    expect(payload.components).toHaveLength(1);
  });

  test('silently does nothing when the announcement message was already deleted', async () => {
    const unknownMessage = Object.assign(new Error('Unknown Message'), { code: 10008 });
    const channel = { messages: { fetch: jest.fn(async () => { throw unknownMessage; }) } };

    await expect(
      updateEventAnnouncement(channel, { ...baseEvent, message_id: 'message-1' }, []),
    ).resolves.toBeUndefined();
  });

  test('silently does nothing when the announcement channel was already deleted', async () => {
    const unknownChannel = Object.assign(new Error('Unknown Channel'), { code: 10003 });
    const channel = { messages: { fetch: jest.fn(async () => { throw unknownChannel; }) } };

    await expect(
      updateEventAnnouncement(channel, { ...baseEvent, message_id: 'message-1' }, []),
    ).resolves.toBeUndefined();
  });

  test('still throws for other errors, e.g. missing permissions', async () => {
    const forbidden = Object.assign(new Error('Missing Access'), { code: 50001 });
    const channel = { messages: { fetch: jest.fn(async () => { throw forbidden; }) } };

    await expect(
      updateEventAnnouncement(channel, { ...baseEvent, message_id: 'message-1' }, []),
    ).rejects.toThrow('Missing Access');
  });
});
