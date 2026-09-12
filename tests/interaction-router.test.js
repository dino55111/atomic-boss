const { createInteractionHandler } = require('../src/interaction-router');

function makeBaseInteraction(overrides = {}) {
  return {
    isChatInputCommand: () => false,
    isUserSelectMenu: () => false,
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
    handleTitleChoiceButton: jest.fn(),
    handleSessionChoiceButton: jest.fn(),
    handleCancelButton: jest.fn(),
    handleCancelSelectButton: jest.fn(),
    handleAssistButton: jest.fn(),
    handleAssistUserSelect: jest.fn(),
    handleAssistExternalButton: jest.fn(),
    handleAssistClassChoiceButton: jest.fn(),
    handleAssistJoinModal: jest.fn(),
    ...overrides,
  };
}

describe('createInteractionHandler', () => {
  test('routes chat input commands to the matching command handler, with the db', async () => {
    const execute = jest.fn(async () => {});
    const commands = new Map([['boss', { execute }]]);
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ commands, db }));
    const interaction = makeBaseInteraction({ isChatInputCommand: () => true, commandName: 'boss' });

    await handle(interaction);

    expect(execute).toHaveBeenCalledWith(interaction, db);
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

  test('routes title-choice button clicks to handleTitleChoiceButton', async () => {
    const handleTitleChoiceButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleTitleChoiceButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'title-choice:普拉' });

    await handle(interaction);

    expect(handleTitleChoiceButton).toHaveBeenCalledWith(interaction);
  });

  test('routes session-choice button clicks to handleSessionChoiceButton', async () => {
    const handleSessionChoiceButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleSessionChoiceButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'session-choice:普拉:3' });

    await handle(interaction);

    expect(handleSessionChoiceButton).toHaveBeenCalledWith(interaction);
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
    const interaction = makeBaseInteraction({ isModalSubmit: () => true, customId: 'create-event-modal:普拉' });

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

  test('routes assist-user-select menu submissions to handleAssistUserSelect', async () => {
    const handleAssistUserSelect = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleAssistUserSelect }));
    const interaction = makeBaseInteraction({ isUserSelectMenu: () => true, customId: 'assist-user-select:1' });

    await handle(interaction);

    expect(handleAssistUserSelect).toHaveBeenCalledWith(interaction);
  });

  test('routes assist button clicks to handleAssistButton', async () => {
    const handleAssistButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleAssistButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'assist:1' });

    await handle(interaction);

    expect(handleAssistButton).toHaveBeenCalledWith(interaction);
  });

  test('routes assist-external button clicks to handleAssistExternalButton', async () => {
    const handleAssistExternalButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleAssistExternalButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'assist-external:1' });

    await handle(interaction);

    expect(handleAssistExternalButton).toHaveBeenCalledWith(interaction);
  });

  test('routes assist-class-choice button clicks to handleAssistClassChoiceButton', async () => {
    const handleAssistClassChoiceButton = jest.fn(async () => {});
    const handle = createInteractionHandler(makeHandlers({ handleAssistClassChoiceButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'assist-class-choice:1:user-9:冰雷' });

    await handle(interaction);

    expect(handleAssistClassChoiceButton).toHaveBeenCalledWith(interaction);
  });

  test('routes cancel-select button clicks to handleCancelSelectButton with the db', async () => {
    const handleCancelSelectButton = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleCancelSelectButton }));
    const interaction = makeBaseInteraction({ isButton: () => true, customId: 'cancel-select:1:5' });

    await handle(interaction);

    expect(handleCancelSelectButton).toHaveBeenCalledWith(interaction, db);
  });

  test('routes assist-join-modal submissions to handleAssistJoinModal with the db', async () => {
    const handleAssistJoinModal = jest.fn(async () => {});
    const db = { marker: true };
    const handle = createInteractionHandler(makeHandlers({ db, handleAssistJoinModal }));
    const interaction = makeBaseInteraction({ isModalSubmit: () => true, customId: 'assist-join-modal:1:user-9:冰雷' });

    await handle(interaction);

    expect(handleAssistJoinModal).toHaveBeenCalledWith(interaction, db);
  });
});
