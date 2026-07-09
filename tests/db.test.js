const {
  initDb,
  createEvent,
  getEventById,
  getEventByMessageId,
  updateEventMessageId,
  updateEventThreadId,
  getSignups,
  countSignups,
  hasSignedUp,
  addSignup,
  removeSignup,
  ADD_SIGNUP_OK,
  ADD_SIGNUP_FULL,
  ADD_SIGNUP_DUPLICATE,
  REMOVE_SIGNUP_OK,
  REMOVE_SIGNUP_NOT_FOUND,
} = require('../src/db/db');

function makeTestDb() {
  return initDb(':memory:');
}

function makeTestEvent(db, overrides = {}) {
  return createEvent(db, {
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    title: '揪團測試',
    capacity: 2,
    startTime: '7/12 20:00',
    creatorId: 'creator-1',
    ...overrides,
  });
}

describe('db', () => {
  test('createEvent then getEventById returns the same event', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(getEventById(db, event.id)).toMatchObject({ title: '揪團測試', capacity: 2 });
  });

  test('getEventByMessageId finds event by message id', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(getEventByMessageId(db, 'message-1').id).toBe(event.id);
  });

  test('updateEventMessageId updates the stored message id', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    updateEventMessageId(db, event.id, 'message-2');
    expect(getEventById(db, event.id).message_id).toBe('message-2');
  });

  test('updateEventThreadId updates the stored thread id', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    expect(getEventById(db, event.id).thread_id).toBeNull();
    updateEventThreadId(db, event.id, 'thread-1');
    expect(getEventById(db, event.id).thread_id).toBe('thread-1');
  });

  test('addSignup adds a signup and countSignups reflects it', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    const result = addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    expect(result).toBe(ADD_SIGNUP_OK);
    expect(countSignups(db, event.id)).toBe(1);
    expect(hasSignedUp(db, event.id, 'user-1')).toBe(true);
  });

  test('addSignup returns DUPLICATE when the same user signs up twice', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    const result = addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    expect(result).toBe(ADD_SIGNUP_DUPLICATE);
    expect(countSignups(db, event.id)).toBe(1);
  });

  test('addSignup returns FULL when capacity is reached', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db, { capacity: 1 });
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    const result = addSignup(db, event, { userId: 'user-2', displayName: 'Bob', className: '法師', level: '65', gameId: 'bob#1' });
    expect(result).toBe(ADD_SIGNUP_FULL);
    expect(countSignups(db, event.id)).toBe(1);
  });

  test('removeSignup removes an existing signup', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    const result = removeSignup(db, event.id, 'user-1');
    expect(result).toBe(REMOVE_SIGNUP_OK);
    expect(countSignups(db, event.id)).toBe(0);
  });

  test('removeSignup returns NOT_FOUND when the user never signed up', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db);
    const result = removeSignup(db, event.id, 'user-1');
    expect(result).toBe(REMOVE_SIGNUP_NOT_FOUND);
  });

  test('getSignups returns signups ordered by signup time', () => {
    const db = makeTestDb();
    const event = makeTestEvent(db, { capacity: 5 });
    addSignup(db, event, { userId: 'user-1', displayName: 'Alice', className: '戰士', level: '70', gameId: 'alice#1' });
    addSignup(db, event, { userId: 'user-2', displayName: 'Bob', className: '法師', level: '65', gameId: 'bob#1' });
    const signups = getSignups(db, event.id);
    expect(signups.map((s) => s.user_id)).toEqual(['user-1', 'user-2']);
  });
});
