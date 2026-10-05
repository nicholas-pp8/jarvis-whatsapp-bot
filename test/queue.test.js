import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadQueue } from '../src/utils/downloader.js';
import { queueText } from '../src/commands/queue.js';
test('empty and idle', () => {
  const q = new DownloadQueue({ concurrency: 1, maxQueue: 5, maxPerUser: 2 });
  assert.match(queueText(q.userStatus('a')), /queue is empty/);
});
test('running then waiting positions', async () => {
  const q = new DownloadQueue({ concurrency: 1, maxQueue: 5, maxPerUser: 2 });
  let release; const gate = new Promise((r) => { release = r; });
  const p1 = q.add('a', () => gate);
  const p2 = q.add('b', async () => 1, () => {});
  const sa = q.userStatus('a'), sb = q.userStatus('b'), sc = q.userStatus('c');
  assert.equal(sa.mine, 1); assert.equal(sa.position, 0);
  assert.match(queueText(sa), /Running now/);
  assert.equal(sb.position, 1);
  assert.match(queueText(sb), /position 1 of 1/);
  assert.match(queueText(sc), /no downloads right now/);
  release(); await p1; await p2;
  assert.equal(q.userStatus('a').mine, 0);
});
