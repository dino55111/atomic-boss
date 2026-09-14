const {
  requireCreator,
  buildEditTimeModal,
} = require('../src/interactions/manage-event');

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
