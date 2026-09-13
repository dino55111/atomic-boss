const fs = require('fs');
const path = require('path');

// reminders.js and cleanup.js resolve an event's "M/D HH:mm" start_time (always
// entered as Asia/Taipei wall-clock time — this bot only serves a Taiwanese
// Discord community) using `new Date(year, month, day, hour, minute)`, which
// interprets those components in whatever timezone the Node process is
// running in. That's correct on a dev machine already set to Asia/Taipei, but
// the production image (node:20-slim, no TZ set) defaults to UTC, which
// silently shifts every reminder/cleanup by 8 hours. The container's TZ must
// be pinned to Asia/Taipei so runtime behavior matches dev.
test('the production image pins its timezone to Asia/Taipei', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  const runtimeStage = dockerfile.slice(dockerfile.indexOf('FROM node:20-slim\n', dockerfile.indexOf('AS build')));

  expect(runtimeStage).toMatch(/^ENV TZ=Asia\/Taipei$/m);
});
