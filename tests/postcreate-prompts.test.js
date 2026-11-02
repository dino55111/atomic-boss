const { registerPostCreatePrompt, deletePostCreatePrompts } = require('../src/interactions/postcreate-prompts');

describe('deletePostCreatePrompts', () => {
  // Ephemeral interaction-response messages aren't regular channel messages
  // (Message#delete would 404 against the channel's own message-delete
  // endpoint) — they only exist behind the interaction's own webhook, so
  // that's what each registered prompt is deleted through.
  test('deletes every message registered for the given event id, via its own webhook', async () => {
    const webhookA = { deleteMessage: jest.fn(async () => {}) };
    const webhookB = { deleteMessage: jest.fn(async () => {}) };
    registerPostCreatePrompt(1, webhookA, 'message-a');
    registerPostCreatePrompt(1, webhookB, 'message-b');

    await deletePostCreatePrompts(1);

    expect(webhookA.deleteMessage).toHaveBeenCalledWith('message-a');
    expect(webhookB.deleteMessage).toHaveBeenCalledWith('message-b');
  });

  test('does not touch messages registered under a different event id', async () => {
    const webhook = { deleteMessage: jest.fn(async () => {}) };
    registerPostCreatePrompt(2, webhook, 'message-x');

    await deletePostCreatePrompts(3);

    expect(webhook.deleteMessage).not.toHaveBeenCalled();
  });

  // A prompt's interaction token may have already expired (the pre-fill
  // flow dragged past Discord's ~15 minute window) or the viewer may have
  // dismissed it themselves — either way, one failure shouldn't stop the
  // rest from being cleaned up.
  test('swallows a delete failure so one bad message does not block the rest', async () => {
    const failingWebhook = { deleteMessage: jest.fn(async () => { throw new Error('Unknown Message'); }) };
    const okWebhook = { deleteMessage: jest.fn(async () => {}) };
    registerPostCreatePrompt(4, failingWebhook, 'bad');
    registerPostCreatePrompt(4, okWebhook, 'ok');

    await expect(deletePostCreatePrompts(4)).resolves.not.toThrow();
    expect(okWebhook.deleteMessage).toHaveBeenCalledWith('ok');
  });

  test('clears the registry after deleting, so calling again deletes nothing new', async () => {
    const webhook = { deleteMessage: jest.fn(async () => {}) };
    registerPostCreatePrompt(5, webhook, 'message');

    await deletePostCreatePrompts(5);
    await deletePostCreatePrompts(5);

    expect(webhook.deleteMessage).toHaveBeenCalledTimes(1);
  });

  test('does nothing for an event id with no registered prompts', async () => {
    await expect(deletePostCreatePrompts(999)).resolves.not.toThrow();
  });
});
