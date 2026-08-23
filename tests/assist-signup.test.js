const {
  EXTERNAL_TARGET,
  buildAssistTargetPickerRows,
  buildAssistClassButtonRows,
  buildAssistJoinModal,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
} = require('../src/interactions/assist-signup');
const { CLASS_OPTIONS } = require('../src/interactions/signup-button');

describe('buildAssistTargetPickerRows', () => {
  test('returns a user-select row and an external-friend button row', () => {
    const rows = buildAssistTargetPickerRows(42);
    expect(rows).toHaveLength(2);
    expect(rows[0].components[0].data.custom_id).toBe('assist-user-select:42');
    expect(rows[1].components[0].data.custom_id).toBe('assist-external:42');
  });
});

describe('buildAssistClassButtonRows', () => {
  test('embeds the event id and target user id in each class button customId', () => {
    const rows = buildAssistClassButtonRows(42, 'user-9');
    expect(rows).toHaveLength(3);
    expect(rows[0].components[0].data.custom_id).toBe(`assist-class-choice:42:user-9:${CLASS_OPTIONS[0]}`);
  });

  test('uses the literal "external" target for a non-Discord friend', () => {
    const rows = buildAssistClassButtonRows(42, EXTERNAL_TARGET);
    expect(rows[0].components[0].data.custom_id).toBe(`assist-class-choice:42:external:${CLASS_OPTIONS[0]}`);
  });
});

describe('buildAssistJoinModal', () => {
  test('has 3 fields (等級／遊戲 ID／備註) when assisting a real member', () => {
    const modal = buildAssistJoinModal(42, 'user-9', '冰雷');
    expect(modal.data.custom_id).toBe('assist-join-modal:42:user-9:冰雷');
    expect(modal.components).toHaveLength(3);
    expect(modal.components[0].components[0].data.label).toBe('等級');
  });

  test('has an extra 暱稱 field first when assisting a non-Discord friend', () => {
    const modal = buildAssistJoinModal(42, EXTERNAL_TARGET, '冰雷');
    expect(modal.data.custom_id).toBe('assist-join-modal:42:external:冰雷');
    expect(modal.components).toHaveLength(4);
    expect(modal.components[0].components[0].data.label).toBe('暱稱');
    expect(modal.components[1].components[0].data.label).toBe('等級');
  });
});

describe('handleAssistButton', () => {
  test('replies with an ephemeral target-picker for the clicked event', async () => {
    const interaction = { customId: 'assist:42', reply: jest.fn(async () => {}) };
    await handleAssistButton(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const replyPayload = interaction.reply.mock.calls[0][0];
    expect(replyPayload.ephemeral).toBe(true);
    expect(replyPayload.components[0].components[0].data.custom_id).toBe('assist-user-select:42');
  });
});

describe('handleAssistUserSelect', () => {
  test('updates the message to the class picker for the selected member', async () => {
    const interaction = { customId: 'assist-user-select:42', values: ['user-9'], update: jest.fn(async () => {}) };
    await handleAssistUserSelect(interaction);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const payload = interaction.update.mock.calls[0][0];
    expect(payload.components[0].components[0].data.custom_id).toBe(`assist-class-choice:42:user-9:${CLASS_OPTIONS[0]}`);
  });
});

describe('handleAssistExternalButton', () => {
  test('updates the message to the class picker for the external target', async () => {
    const interaction = { customId: 'assist-external:42', update: jest.fn(async () => {}) };
    await handleAssistExternalButton(interaction);

    expect(interaction.update).toHaveBeenCalledTimes(1);
    const payload = interaction.update.mock.calls[0][0];
    expect(payload.components[0].components[0].data.custom_id).toBe(`assist-class-choice:42:external:${CLASS_OPTIONS[0]}`);
  });
});

describe('handleAssistClassChoiceButton', () => {
  test('shows the assist join-details modal for the chosen event, target and class', async () => {
    const interaction = { customId: 'assist-class-choice:42:user-9:冰雷', showModal: jest.fn() };
    await handleAssistClassChoiceButton(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('assist-join-modal:42:user-9:冰雷');
  });
});
