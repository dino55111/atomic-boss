const {
  buildCreateEventModal,
  buildSessionButtonRow,
  handleTitleChoiceButton,
  handleSessionChoiceButton,
  SESSION_OPTIONS,
  buildDateOptions,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
} = require('../src/interactions/title-choice-button');

describe('buildCreateEventModal', () => {
  const now = new Date(2026, 8, 5); // Sat 2026-09-05

  test('customId embeds the chosen title and session, and title mentions the title', () => {
    const modal = buildCreateEventModal('普拉', 3, now);
    expect(modal.data.custom_id).toBe('create-event-modal:普拉:3');
    expect(modal.data.title).toBe('建立揪團（普拉）');
  });

  test('has three label components wrapping the date, hour, and minute selects', () => {
    const modal = buildCreateEventModal('普拉', 3, now);
    expect(modal.components).toHaveLength(3);
    expect(modal.components.map((label) => label.data.label)).toEqual(['日期', '時', '分']);
    expect(modal.components.map((label) => label.data.component.data.custom_id)).toEqual([
      'event_date',
      'event_hour',
      'event_minute',
    ]);
  });

  test('date select offers the next 7 days starting today, each labeled with its weekday', () => {
    const modal = buildCreateEventModal('普拉', 3, now);
    const dateSelect = modal.components[0].data.component;

    expect(dateSelect.options.map((option) => option.data.value)).toEqual([
      '9/5',
      '9/6',
      '9/7',
      '9/8',
      '9/9',
      '9/10',
      '9/11',
    ]);
    expect(dateSelect.options.map((option) => option.data.label)).toEqual([
      '9/5 (六)（今天）',
      '9/6 (日)',
      '9/7 (一)',
      '9/8 (二)',
      '9/9 (三)',
      '9/10 (四)',
      '9/11 (五)',
    ]);
  });

  test("today's date option is selected by default and no other date option is", () => {
    const modal = buildCreateEventModal('普拉', 3, now);
    const [today, ...rest] = modal.components[0].data.component.options;

    expect(today.data.default).toBe(true);
    expect(rest.every((option) => !option.data.default)).toBe(true);
  });

  test('hour select offers 00~23 with 20 selected by default', () => {
    const modal = buildCreateEventModal('普拉', 3, now);
    const hourSelect = modal.components[1].data.component;

    expect(hourSelect.options.map((option) => option.data.value)).toEqual(
      Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
    );
    expect(hourSelect.options.find((option) => option.data.value === '20').data.default).toBe(true);
    expect(hourSelect.options.filter((option) => option.data.default)).toHaveLength(1);
  });

  test('minute select offers every 10 minutes with 00 selected by default', () => {
    const modal = buildCreateEventModal('普拉', 3, now);
    const minuteSelect = modal.components[2].data.component;

    expect(minuteSelect.options.map((option) => option.data.value)).toEqual(['00', '10', '20', '30', '40', '50']);
    expect(minuteSelect.options[0].data.default).toBe(true);
    expect(minuteSelect.options.filter((option) => option.data.default)).toHaveLength(1);
  });
});

describe('buildSessionButtonRow', () => {
  test('lays out sessions 1~7 as buttons across 2 rows with session-choice customIds', () => {
    const rows = buildSessionButtonRow('普拉');
    expect(SESSION_OPTIONS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows).toHaveLength(2);
    expect(rows[0].components).toHaveLength(5);
    expect(rows[1].components).toHaveLength(2);

    const labels = rows.flatMap((row) => row.components.map((button) => button.data.label));
    const customIds = rows.flatMap((row) => row.components.map((button) => button.data.custom_id));
    expect(labels).toEqual(['1場', '2場', '3場', '4場', '5場', '6場', '7場']);
    expect(customIds).toEqual(SESSION_OPTIONS.map((session) => `session-choice:普拉:${session}`));
  });
});

describe('reusable option builders (exported for the edit-time modal)', () => {
  test('buildDateOptions, HOUR_OPTIONS, and MINUTE_OPTIONS are exported', () => {
    expect(typeof buildDateOptions).toBe('function');
    expect(HOUR_OPTIONS).toHaveLength(24);
    expect(MINUTE_OPTIONS).toEqual(['00', '10', '20', '30', '40', '50']);
  });
});

describe('handleTitleChoiceButton', () => {
  test('updates the message to the session picker for the chosen title', async () => {
    const interaction = { customId: 'title-choice:普拉', update: jest.fn(async () => {}) };
    await handleTitleChoiceButton(interaction);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const payload = interaction.update.mock.calls[0][0];
    expect(payload.content).toBe('請選擇場次：');
    expect(payload.components[0].components[0].data.custom_id).toBe('session-choice:普拉:1');
  });
});

describe('handleSessionChoiceButton', () => {
  test('shows the create-event modal for the chosen title and session', async () => {
    const interaction = { customId: 'session-choice:普拉:3', showModal: jest.fn() };
    await handleSessionChoiceButton(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('create-event-modal:普拉:3');
  });
});
