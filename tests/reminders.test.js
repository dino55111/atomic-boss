const { resolveEventStartDateTime } = require('../src/reminders');

describe('resolveEventStartDateTime', () => {
  test('resolves a same-year date to the year the event was created in', () => {
    const createdAt = new Date(2026, 6, 1, 0, 0); // 2026-07-01 (month is 0-indexed)
    const event = { start_time: '7/12 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(12);
    expect(result.getHours()).toBe(20);
    expect(result.getMinutes()).toBe(0);
  });

  test('rolls over to next year when the date is more than a day before the creation date', () => {
    const createdAt = new Date(2026, 11, 28, 0, 0); // 2026-12-28
    const event = { start_time: '1/5 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(5);
  });

  test('does not roll over when the date is only slightly before the creation time on the same day', () => {
    const createdAt = new Date(2026, 6, 12, 20, 5); // 2026-07-12 20:05, 5 minutes after the chosen start time
    const event = { start_time: '7/12 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(12);
    expect(result.getHours()).toBe(20);
    expect(result.getMinutes()).toBe(0);
  });

  test('does not roll over exactly at the 1-day boundary (only strictly more than 1 day triggers it)', () => {
    const createdAt = new Date(2026, 6, 13, 20, 0); // exactly 1 day after the chosen start time
    const event = { start_time: '7/12 20:00', created_at: createdAt.toISOString() };

    const result = resolveEventStartDateTime(event);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(12);
  });
});
