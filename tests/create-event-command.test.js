const { data, execute, buildTitleButtonRow, TITLE_OPTIONS, TITLE_CAPACITIES } = require('../src/commands/create-event');

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

describe('TITLE_CAPACITIES', () => {
  test('龍王 has a capacity of 12 and every other title has a capacity of 6', () => {
    expect(TITLE_CAPACITIES['龍王']).toBe(12);
    for (const title of TITLE_OPTIONS) {
      if (title === '龍王') continue;
      expect(TITLE_CAPACITIES[title]).toBe(6);
    }
  });

  test('has an entry for every title option', () => {
    expect(Object.keys(TITLE_CAPACITIES).sort()).toEqual([...TITLE_OPTIONS].sort());
  });
});
