const { buildEventEmbed, buildActionRow } = require('../src/embeds/event-embed');

const baseEvent = { id: 1, title: '週三夜間團', capacity: 2, session: 3, start_time: '7/12 20:00' };

describe('buildEventEmbed', () => {
  test('shows the session field', () => {
    const embed = buildEventEmbed(baseEvent, []);
    const sessionField = embed.data.fields.find((f) => f.name === '場次');
    expect(sessionField.value).toBe('第3場');
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
