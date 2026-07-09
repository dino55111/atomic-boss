const { createInteractionHandler } = require('../src/interaction-router');

function makeBaseInteraction(overrides = {}) {
  return {
    isChatInputCommand: () => false,
    isButton: () => false,
    isModalSubmit: () => false,
    ...overrides,
  };
}

function makeHandlers(overrides = {}) {
  return {
    commands: new Map(),
    db: {},
    handleCreateEventModal: jest.fn(),
    handleJoinModal: jest.fn(),
    handleSignupButton: jest.fn(),
    handleClassChoiceButton: jest.fn(),
    handleCancelButton: jest.fn(),
    ...overrides,
  };
}

describe('createInteractionHandler', () => {
  test('routes chat input commands to the matching command handler', async () => {
    const execute = jest.fn(async () => {});
    const commands = new Map([['揪團', { execute }]]);
    const handle = createInteractionHandler(makeHandlers({ commands }));
    const interaction = makeBaseInteraction({ isChatInputCommand: () => true, commandName: '揪團' });

    await handle(interaction);

    expect(execute).toHaveBeenCalledWith(interaction);
  });

  test('routes signup button clicks to handleSignupButton', async () => {
    const handleSignupButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleSignupButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'signup:1' });

    await handle(interaction);

    expect(handleSignupButton).toHaveBeenCalledWith(interaction);
  });

  test('routes class-choice button clicks to handleClassChoiceButton', async () => {
    const handleClassChoiceButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleClassChoiceButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'class-choice:1:冰雷' });

    await handle(interaction);

    expect(handleClassChoiceButton).toHaveBeenCalledWith(interaction);
  });

  test('routes cancel button clicks to handleCancelButton with the db', async () => {
    const handleCancelButton = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleCancelButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'cancel:1' });

    await handle(interaction);

    expect(handleCancelButton).toHaveBeenCalledWith(interaction, db);
  });

  test('routes the create-event-modal submission to handleCreateEventModal', async () => {
    const handleCreateEventModal = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleCreateEventModal }));
    const interaction = makeBaseInteraction({ isModalSubmit: () => true, customId: 'create-event-modal' });

    await handle(interaction);

    expect(handleCreateEventModal).toHaveBeenCalledWith(interaction, db);
  });

  test('routes join-modal submissions to handleJoinModal', async () => {
    const handleJoinModal = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleJoinModal }));
    const interaction = makeBaseInteraction({ isModalSubmit: () => true, customId: 'join-modal:1:冰雷' });

    await handle(interaction);

    expect(handleJoinModal).toHaveBeenCalledWith(interaction, db);
  });
});
