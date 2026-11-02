const { registerPostCreatePrompt, deletePostCreatePrompts } = require('../src/interactions/postcreate-prompts');

describe('deletePostCreatePrompts', () => {
  test('deletes every message registered for the given event id', async () => {
    const messageA = { delete: jest.fn(async () => {}) };
    const messageB = { delete: jest.fn(async () => {}) };
    registerPostCreatePrompt(1, messageA);
    registerPostCreatePrompt(1, messageB);

    await deletePostCreatePrompts(1);

    expect(messageA.delete).toHaveBeenCalledTimes(1);
    expect(messageB.delete).toHaveBeenCalledTimes(1);
  });

  test('does not touch messages registered under a different event id', async () => {
    const message = { delete: jest.fn(async () => {}) };
    registerPostCreatePrompt(2, message);

    await deletePostCreatePrompts(3);

    expect(message.delete).not.toHaveBeenCalled();
  });

  // A prompt's interaction token may have already expired (the pre-fill
  // flow dragged past Discord's ~15 minute window) or the viewer may have
  // dismissed it themselves — either way, one failure shouldn't stop the
  // rest from being cleaned up.
  test('swallows a delete failure so one bad message does not block the rest', async () => {
    const failing = { delete: jest.fn(async () => { throw new Error('Unknown Message'); }) };
    const ok = { delete: jest.fn(async () => {}) };
    registerPostCreatePrompt(4, failing);
    registerPostCreatePrompt(4, ok);

    await expect(deletePostCreatePrompts(4)).resolves.not.toThrow();
    expect(ok.delete).toHaveBeenCalledTimes(1);
  });

  test('clears the registry after deleting, so calling again deletes nothing new', async () => {
    const message = { delete: jest.fn(async () => {}) };
    registerPostCreatePrompt(5, message);

    await deletePostCreatePrompts(5);
    await deletePostCreatePrompts(5);

    expect(message.delete).toHaveBeenCalledTimes(1);
  });

  test('does nothing for an event id with no registered prompts', async () => {
    await expect(deletePostCreatePrompts(999)).resolves.not.toThrow();
  });
});
