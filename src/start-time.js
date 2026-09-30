const START_TIME_PATTERN = /^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/;
const ROLLOVER_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000;
const WEEKDAY_CHARS = ['日', '一', '二', '三', '四', '五', '六'];

// start_time is stored as "M/D HH:mm" with no year. To compare it against a
// reference Date, resolve the missing year: try the reference's year first,
// then roll forward a year if that candidate would land more than ~180 days
// before the reference (i.e. it was clearly meant for next year, e.g. an
// event created/checked in December for a January date). A same-month typo
// or a date that's simply a few days or weeks before the reference stays
// well under this threshold, so it's left as-is rather than rolled forward.
function resolveStartDateTime(rawStartTime, reference) {
  const match = START_TIME_PATTERN.exec(rawStartTime);
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  const referenceYear = reference.getFullYear();

  const candidate = new Date(referenceYear, month - 1, day, hour, minute);
  if (candidate.getTime() < reference.getTime() - ROLLOVER_THRESHOLD_MS) {
    return new Date(referenceYear + 1, month - 1, day, hour, minute);
  }
  return candidate;
}

// Renders a stored "M/D HH:mm" start time with its weekday inserted, e.g.
// "7/12 (日) 20:00" — matching the weekday already shown on the date-picker
// options in title-choice-button.js. Falls back to the raw string if it
// doesn't resolve to a valid date (defensive; callers only pass start times
// that already passed isValidStartTime).
function formatStartTimeWithWeekday(startTime, now) {
  const resolved = resolveStartDateTime(startTime, now);
  if (!resolved) {
    return startTime;
  }

  const [date, time] = startTime.split(' ');
  return `${date} (${WEEKDAY_CHARS[resolved.getDay()]}) ${time}`;
}

module.exports = { START_TIME_PATTERN, WEEKDAY_CHARS, resolveStartDateTime, formatStartTimeWithWeekday };
