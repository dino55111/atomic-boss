const { tryAcknowledgeAndDeleteReply } = require('../src/interactions/ack');

describe('tryAcknowledgeAndDeleteReply', () => {
  test('returns true and deletes the reply when deferUpdate succeeds', async () => {
    const interaction = {
      deferUpdate: jest.fn(async () => {}),
      deleteReply: jest.fn(async () => {}),
    };

    const result = await tryAcknowledgeAndDeleteReply(interaction);

    expect(result).toBe(true);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
  });

  test('returns false without throwing when deferUpdate fails (stale interaction)', async () => {
    const interaction = {
      deferUpdate: jest.fn(async () => {
        throw new Error('Unknown interaction');
      }),
      deleteReply: jest.fn(async () => {}),
    };

    const result = await tryAcknowledgeAndDeleteReply(interaction);

    expect(result).toBe(false);
    expect(interaction.deleteReply).not.toHaveBeenCalled();
  });

  test('returns false when deleteReply fails after a successful deferUpdate', async () => {
    const interaction = {
      deferUpdate: jest.fn(async () => {}),
      deleteReply: jest.fn(async () => {
        throw new Error('Unknown Message');
      }),
    };

    const result = await tryAcknowledgeAndDeleteReply(interaction);

    expect(result).toBe(false);
  });
});
