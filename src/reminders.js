const START_TIME_PATTERN = /^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// events.start_time is "M/D HH:mm" with no year (validated at creation time by
// isValidStartTime in create-event-modal.js, so this assumes it's well-formed).
// To compare it against "now" we resolve it to a real Date: build a candidate
// using the year the event was created in, then roll forward a year if that
// candidate would land more than a day before the event was even created —
// that only happens when the chosen date was clearly meant for next year
// (e.g. an event created in December for a January session).
function resolveEventStartDateTime(event) {
  const match = START_TIME_PATTERN.exec(event.start_time);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  const createdAt = new Date(event.created_at);
  const referenceYear = createdAt.getFullYear();

  const candidate = new Date(referenceYear, month - 1, day, hour, minute);
  if (candidate.getTime() < createdAt.getTime() - ONE_DAY_MS) {
    return new Date(referenceYear + 1, month - 1, day, hour, minute);
  }
  return candidate;
}

module.exports = { resolveEventStartDateTime };
