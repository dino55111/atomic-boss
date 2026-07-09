const { buildEventEmbed, buildActionRow } = require('../src/embeds/event-embed');

const baseEvent = { id: 1, title: '週三夜間團', capacity: 2, start_time: '7/12 20:00' };

describe('buildEventEmbed', () => {
  test('shows placeholder text when there are no signups', () => {
    const embed = buildEventEmbed(baseEvent, []);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toBe('目前尚無人報名');
  });

  test('lists each signup with class, level and game id', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const rosterField = embed.data.fields.find((f) => f.name === '名單');
    expect(rosterField.value).toContain('<@user-1>');
    expect(rosterField.value).toContain('戰士');
    expect(rosterField.value).toContain('70');
    expect(rosterField.value).toContain('alice#1');
  });

  test('shows current count over capacity', () => {
    const signups = [{ user_id: 'user-1', class: '戰士', level: '70', game_id: 'alice#1' }];
    const embed = buildEventEmbed(baseEvent, signups);
    const countField = embed.data.fields.find((f) => f.name === '人數');
    expect(countField.value).toBe('1 / 2');
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

  test('cancel button is always enabled', () => {
    const row = buildActionRow(baseEvent, 2);
    expect(row.components[1].data.disabled).toBeFalsy();
  });
});
