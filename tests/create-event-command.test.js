const {
  data,
  execute,
  buildTitleButtonRows,
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
    const totalButtons = replyPayload.components.reduce((sum, row) => sum + row.components.length, 0);
    expect(totalButtons).toBe(TITLE_OPTIONS.length);
    for (const row of replyPayload.components) {
      expect(row.components.length).toBeGreaterThanOrEqual(1);
      expect(row.components.length).toBeLessThanOrEqual(5);
    }
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

describe('buildTitleButtonRows', () => {
  test('never puts more than 5 buttons in a single row (Discord action row limit)', () => {
    const rows = buildTitleButtonRows();
    for (const row of rows) {
      expect(row.components.length).toBeLessThanOrEqual(5);
    }
  });

  test('lays out all title options as buttons with title-choice customIds', () => {
    const rows = buildTitleButtonRows();
    const customIds = rows.flatMap((row) => row.components.map((button) => button.data.custom_id));
    expect(customIds).toEqual(TITLE_OPTIONS.map((title) => `title-choice:${title}`));
  });

  test('prefixes each button label with its emoji, but keeps the customId as the plain title', () => {
    const rows = buildTitleButtonRows();
    const labels = rows.flatMap((row) => row.components.map((button) => button.data.label));
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
