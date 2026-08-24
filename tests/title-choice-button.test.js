const {
  buildCreateEventModal,
  buildSessionButtonRow,
  handleTitleChoiceButton,
  handleSessionChoiceButton,
  SESSION_OPTIONS,
} = require('../src/interactions/title-choice-button');

describe('buildCreateEventModal', () => {
  test('customId embeds the chosen title and session, title mentions the title, and has only the 時間 field', () => {
    const modal = buildCreateEventModal('普拉', 3);
    expect(modal.data.custom_id).toBe('create-event-modal:普拉:3');
    expect(modal.data.title).toBe('建立揪團（普拉）');
    expect(modal.components).toHaveLength(1);
    expect(modal.components[0].components[0].data.label).toBe('時間');
    expect(modal.components[0].components[0].data.custom_id).toBe('start_time');
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
    expect(labels).toEqual(['第1場', '第2場', '第3場', '第4場', '第5場', '第6場', '第7場']);
    expect(customIds).toEqual(SESSION_OPTIONS.map((session) => `session-choice:普拉:${session}`));
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
