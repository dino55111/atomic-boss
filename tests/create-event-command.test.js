const {
  data,
  execute,
  buildTitleButtonRow,
  TITLE_OPTIONS,
  TITLE_CAPACITIES,
  TITLE_EMOJIS,
  TITLE_NOTES,
} = require('../src/commands/create-event');

describe('create-event command', () => {
  test('command name is boss', () => {
    expect(data.name).toBe('boss');
  });

  test('execute replies with an ephemeral title-picker message', async () => {
    const interaction = { reply: jest.fn(async () => {}), channel: { isThread: () => false } };
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const replyPayload = interaction.reply.mock.calls[0][0];
    expect(replyPayload.ephemeral).toBe(true);
    expect(replyPayload.components).toHaveLength(1);
    expect(replyPayload.components[0].components).toHaveLength(TITLE_OPTIONS.length);
  });

  test('execute refuses to start inside a thread and does not show the title-picker', async () => {
    const interaction = { reply: jest.fn(async () => {}), channel: { isThread: () => true } };
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const replyPayload = interaction.reply.mock.calls[0][0];
    expect(replyPayload.ephemeral).toBe(true);
    expect(replyPayload.components).toBeUndefined();
  });
});

describe('buildTitleButtonRow', () => {
  test('lays out all title options as buttons with title-choice customIds', () => {
    const row = buildTitleButtonRow();
    const customIds = row.components.map((button) => button.data.custom_id);
    expect(customIds).toEqual(TITLE_OPTIONS.map((title) => `title-choice:${title}`));
  });

  test('prefixes each button label with its emoji, but keeps the customId as the plain title', () => {
    const row = buildTitleButtonRow();
    const labels = row.components.map((button) => button.data.label);
    expect(labels).toEqual(TITLE_OPTIONS.map((title) => `${TITLE_EMOJIS[title]} ${title}`));
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

describe('TITLE_NOTES', () => {
  test('has a non-empty entry for every title option', () => {
    for (const title of TITLE_OPTIONS) {
      expect(typeof TITLE_NOTES[title]).toBe('string');
      expect(TITLE_NOTES[title].length).toBeGreaterThan(0);
    }
  });
});
