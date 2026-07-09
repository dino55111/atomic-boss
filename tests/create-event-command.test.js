const { ComponentType } = require('discord-api-types/v10');
const { data, execute, TITLE_OPTIONS } = require('../src/commands/create-event');

describe('create-event command', () => {
  test('command name is 揪團', () => {
    expect(data.name).toBe('揪團');
  });

  test('execute shows a modal with the create-event-modal customId and 3 fields', async () => {
    const interaction = { showModal: jest.fn() };
    await execute(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('create-event-modal');
    expect(modal.components).toHaveLength(3);
  });

  test('標題 field is a required single-select offering all title options', async () => {
    const interaction = { showModal: jest.fn() };
    await execute(interaction);

    const modal = interaction.showModal.mock.calls[0][0];
    const titleLabel = modal.components[0];
    expect(titleLabel.data.label).toBe('標題');

    const titleSelect = titleLabel.data.component;
    expect(titleSelect.data.type).toBe(ComponentType.StringSelect);
    expect(titleSelect.data.custom_id).toBe('title');
    expect(titleSelect.data.required).toBe(true);
    expect(titleSelect.data.min_values).toBe(1);
    expect(titleSelect.data.max_values).toBe(1);
    expect(titleSelect.options.map((option) => option.data.value)).toEqual(TITLE_OPTIONS);
  });

  test('人數上限 and 時間 remain the trailing text input fields', async () => {
    const interaction = { showModal: jest.fn() };
    await execute(interaction);

    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.components[1].data.label).toBe('人數上限');
    expect(modal.components[2].data.label).toBe('時間');
  });
});
