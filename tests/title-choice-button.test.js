const { buildCreateEventModal, handleTitleChoiceButton } = require('../src/interactions/title-choice-button');

describe('buildCreateEventModal', () => {
  test('customId embeds the chosen title, title mentions it, and has 2 plain text-input fields', () => {
    const modal = buildCreateEventModal('普拉');
    expect(modal.data.custom_id).toBe('create-event-modal:普拉');
    expect(modal.data.title).toBe('建立揪團（普拉）');
    expect(modal.components).toHaveLength(2);
  });
});

describe('handleTitleChoiceButton', () => {
  test('shows the create-event modal for the chosen title', async () => {
    const interaction = { customId: 'title-choice:普拉', showModal: jest.fn() };
    await handleTitleChoiceButton(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('create-event-modal:普拉');
  });
});
