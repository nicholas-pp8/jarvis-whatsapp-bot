import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-'));
const {parseDuration, setReopen, dueReopens, clearReopen} = await import('../src/groups/timedmute.js');
const A = await import('../src/groups/activity.js');
test('parseDuration', () => {
  assert.equal(parseDuration('30m'), 1800000); assert.equal(parseDuration('2h'), 7200000);
  assert.equal(parseDuration('1d'), 86400000); assert.equal(parseDuration('abc'), 0); assert.equal(parseDuration('99d'), 0);
});
test('timed reopen', () => {
  setReopen('g1', Date.now() - 1000); setReopen('g2', Date.now() + 99999);
  assert.deepEqual(dueReopens(), ['g1']); clearReopen('g1'); assert.deepEqual(dueReopens(), []);
});
test('activity log', () => {
  const now = Date.now();
  A.record('g', 'a', now); A.record('g', 'a', now); A.record('g', 'b', now - 3 * 86400e3);
  assert.equal(A.topUsers('g', 7, 5, now)[0].user, 'a');
  assert.equal(A.topUsers('g', 1, 5, now).length, 1);
  assert.equal(A.dailyTotals('g', 7, now).reduce((x, y) => x + y.msgs, 0), 3);
  assert.equal(A.lastSeen('g', 'a'), now);
  assert.ok(A.busiestHour('g') !== null);
});
