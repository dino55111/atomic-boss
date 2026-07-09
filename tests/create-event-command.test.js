const { data, execute, buildTitleButtonRow, TITLE_OPTIONS } = require('../src/commands/create-event');

describe('create-event command', () => {
  test('command name is 揪團', () => {
    expect(data.name).toBe('揪團');
  });

  test('execute replies with an ephemeral title-picker message', async () => {
    const interaction = { reply: jest.fn(async () => {}) };
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const replyPayload = interaction.reply.mock.calls[0][0];
    expect(replyPayload.ephemeral).toBe(true);
    expect(replyPayload.components).toHaveLength(1);
    expect(replyPayload.components[0].components).toHaveLength(TITLE_OPTIONS.length);
  });
});

describe('buildTitleButtonRow', () => {
  test('lays out all title options as buttons with title-choice customIds', () => {
    const row = buildTitleButtonRow();
    const labels = row.components.map((button) => button.data.label);
    const customIds = row.components.map((button) => button.data.custom_id);
    expect(labels).toEqual(TITLE_OPTIONS);
    expect(customIds).toEqual(TITLE_OPTIONS.map((title) => `title-choice:${title}`));
  });
});
