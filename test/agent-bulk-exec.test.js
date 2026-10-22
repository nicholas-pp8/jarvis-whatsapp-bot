import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'abulk-'));
const { execStep } = await import('../src/commands/agent.js');
const q = await import('../src/utilities/agentqueue.js');
const run = async (goal, items) => { const results = []; await execStep({ jid: 'c@s.whatsapp.net', __goal: goal }, { type: 'bulk', cmd: 'play', items }, results); return results[0]; };
test('planner dropped items from a clean numbered media list: all listed items are queued', async () => {
  const r = await run('download these songs 1. a 2. b 3. c 4. d 5. e', ['a', 'b', 'c']);
  assert.equal(r.code, 0); assert.match(r.out, /Queued 5 downloads.*all 5 items you listed/);
});
test('gapped numbering: planner list used and a warning is shown', async () => {
  const r = await run('download songs 1. a 2. b 4. d 5. e', ['a', 'b', 'd', 'e']);
  assert.match(r.out, /Queued 4 downloads.*WARNING.*gaps or repeats/);
});
test('numbered prose without media intent does not override the planner', async () => {
  const r = await run('summarise 1. intro 2. body 3. ending', ['x', 'y']);
  assert.match(r.out, /Queued 2 downloads/); assert.doesNotMatch(r.out, /items you listed/);
});
test('over the per-request limit is rejected, nothing queued', async () => {
  const r = await run('download songs', Array.from({ length: 201 }, (_, i) => 's' + i));
  assert.equal(r.code, 1); assert.match(r.out, /201 items is over the 200 per request limit.*Nothing was started/);
});
