const { isAlreadyGoneError } = require('../src/discord-errors');

describe('isAlreadyGoneError', () => {
  test('is true for Unknown Message (10008)', () => {
    expect(isAlreadyGoneError(Object.assign(new Error('Unknown Message'), { code: 10008 }))).toBe(true);
  });

  test('is true for Unknown Channel (10003)', () => {
    expect(isAlreadyGoneError(Object.assign(new Error('Unknown Channel'), { code: 10003 }))).toBe(true);
  });

  test('is false for other errors, e.g. Missing Permissions', () => {
    expect(isAlreadyGoneError(Object.assign(new Error('Missing Permissions'), { code: 50013 }))).toBe(false);
  });

  test('is false for an error with no code', () => {
    expect(isAlreadyGoneError(new Error('boom'))).toBe(false);
  });
});
