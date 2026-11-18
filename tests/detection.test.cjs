const assert = require('node:assert/strict');
const test = require('node:test');
const { parseLog, analyze } = require('../detection.js');

function logLine(timestamp, source = '192.0.2.17', outcome = 'failure') {
  return JSON.stringify({ timestamp, source, outcome, account: 'pixel-mage' });
}

test('ignores blank lines and skips malformed rows and impossible UTC dates', () => {
  const timestamp = '2026-11-18T20:00:42.215Z';
  const data = [
    `  ${logLine(timestamp)}  `,
    '   ',
    '{',
    'null',
    logLine('2026-02-30T20:00:42Z'),
    logLine('2026-11-18T20:00:42+00:00'),
    logLine(timestamp, '192.0.2.17', 'unknown'),
    logLine(timestamp, ''),
    logLine(timestamp, 'x'.repeat(65))
  ].join('\n');

  const { events, skipped } = parseLog(data);

  assert.equal(skipped, 7);
  assert.equal(events.length, 1);
  assert.equal(events[0].timestamp, timestamp);
  assert.equal(events[0].time, Date.parse(timestamp));
});

test('counts failures per source and UTC bucket and flags only matching failures', () => {
  const { events } = parseLog([
    logLine('2026-11-18T20:05:00Z'),
    logLine('2026-11-18T20:04:59.999Z'),
    logLine('2026-11-18T20:04:56Z', '192.0.2.17', 'success'),
    logLine('2026-11-18T20:00:00Z'),
    logLine('2026-11-18T20:04:57Z', '192.0.2.18')
  ].join('\n'));

  const result = analyze(events, { threshold: 2, intervalMinutes: 5 });
  assert.equal(result.failureCount, 4);
  assert.equal(result.sourceCount, 2);
  assert.deepEqual(
    result.alerts.map(({ start, source, failures }) => ({ start, source, failures })),
    [{ start: Date.parse('2026-11-18T20:00:00Z'), source: '192.0.2.17', failures: 2 }]
  );
  assert.deepEqual(
    result.buckets.map(({ failures, flagged }) => [failures, Boolean(flagged)]),
    [[3, true], [1, false]]
  );
  assert.deepEqual(result.events.map(({ timestamp, flagged }) => [timestamp, flagged]), [
    ['2026-11-18T20:05:00Z', false],
    ['2026-11-18T20:04:59.999Z', true],
    ['2026-11-18T20:04:57Z', false],
    ['2026-11-18T20:04:56Z', false],
    ['2026-11-18T20:00:00Z', true]
  ]);
  assert.equal(analyze(events, { threshold: 3, intervalMinutes: 5 }).alerts.length, 0);
});

test('bounds the timeline while keeping earlier alerts and filling recent gaps', () => {
  const first = '2026-01-01T00:00:00Z';
  const last = '2026-11-18T20:00:00Z';
  const { events } = parseLog([logLine(first), logLine(last)].join('\n'));

  const result = analyze(events, { threshold: 1, intervalMinutes: 5 });

  assert.equal(result.alerts.length, 2);
  assert.equal(result.buckets.length, 24);
  assert.equal(result.buckets[0].start, Date.parse(last) - 23 * 5 * 60_000);
  assert.equal(result.buckets[0].failures, 0);
  assert.equal(result.buckets.at(-1).start, Date.parse(last));
  assert.equal(result.buckets.at(-1).failures, 1);
});
