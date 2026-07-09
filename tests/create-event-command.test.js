const { data, execute } = require('../src/commands/create-event');

describe('create-event command', () => {
  test('command name is 揪團', () => {
    expect(data.name).toBe('揪團');
  });

  test('execute shows a modal with the create-event-modal customId and 3 inputs', async () => {
    const interaction = { showModal: jest.fn() };
    await execute(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('create-event-modal');
    expect(modal.components).toHaveLength(3);
  });
});
