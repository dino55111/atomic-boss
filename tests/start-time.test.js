const { resolveStartDateTime, formatStartTimeWithWeekday } = require('../src/start-time');

describe('resolveStartDateTime', () => {
  test('resolves a date/time in the reference year when it is not far in the past', () => {
    const reference = new Date(2026, 0, 15); // Jan 15 2026
    const result = resolveStartDateTime('3/1 10:00', reference);
    expect(result).toEqual(new Date(2026, 2, 1, 10, 0));
  });

  test('rolls over to next year when the candidate would be far before the reference', () => {
    const reference = new Date(2026, 11, 20); // Dec 20 2026
    const result = resolveStartDateTime('1/5 09:00', reference);
    expect(result).toEqual(new Date(2027, 0, 5, 9, 0));
  });

  test('does not roll over when the candidate is only slightly before the reference', () => {
    const reference = new Date(2026, 8, 23, 12, 0); // Sep 23 2026, noon
    const result = resolveStartDateTime('9/20 10:00', reference);
    expect(result).toEqual(new Date(2026, 8, 20, 10, 0));
  });

  test('returns null for a malformed start time', () => {
    const reference = new Date(2026, 0, 1);
    expect(resolveStartDateTime('not-a-time', reference)).toBeNull();
  });
});

describe('formatStartTimeWithWeekday', () => {
  test('inserts the resolved weekday between the date and the time', () => {
    const reference = new Date(2026, 0, 1); // Jan 1 2026
    // 2026-07-12 is a Sunday.
    expect(formatStartTimeWithWeekday('7/12 20:00', reference)).toBe('7/12 (日) 20:00');
  });

  test('resolves the weekday for the rolled-over year when the candidate is far in the past', () => {
    const reference = new Date(2026, 11, 20); // Dec 20 2026
    // 2027-01-05 is a Tuesday.
    expect(formatStartTimeWithWeekday('1/5 09:00', reference)).toBe('1/5 (二) 09:00');
  });

  test('falls back to the raw string for a malformed start time', () => {
    const reference = new Date(2026, 0, 1);
    expect(formatStartTimeWithWeekday('not-a-time', reference)).toBe('not-a-time');
  });
});
