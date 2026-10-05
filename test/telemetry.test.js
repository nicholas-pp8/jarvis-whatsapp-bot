import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildPayload, validatePayload, numberHash, ALLOWED_KEYS} from '../src/telemetry/payload.js';
import {Collector} from '../src/telemetry/collector.js';
import {Telemetry, count} from '../src/telemetry/client.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tel-'));
const mk = (n, extra = {}) => ({v: 1, id: String(n).padStart(24, '0').replace(/[^a-f0-9]/g, 'a').slice(0, 24), ver: '1.7.0', up: 100, on: true, cmds: {ping: 3}, ...extra});

test('payload allowlist: built payload has only allowed keys, no raw number', () => {
  const p = buildPayload({id: 'a'.repeat(24), ver: '1.7.0', up: 55.9, on: true, number: '919876543210', cmds: {ping: 2, 'bad name': 1, x: -3}});
  assert.ok(Object.keys(p).every((k) => ALLOWED_KEYS.includes(k)));
  assert.ok(!JSON.stringify(p).includes('919876543210')); assert.equal(p.nh, numberHash('+91 98765-43210'));
  assert.deepEqual(p.cmds, {ping: 2}); assert.ok(validatePayload(p));
});
test('validatePayload rejects extras and bad shapes', () => {
  const ok = mk(1); assert.ok(validatePayload(ok));
  for (const bad of [{...ok, text: 'hi'}, {...ok, id: 'zz'}, {...ok, up: -1}, {...ok, cmds: {'a b': 1}}, {...ok, cmds: [1]}, {...ok, nh: 'xyz'}, {...ok, on: 'yes'}, null, [], 'x']) assert.equal(validatePayload(bad), null);
});
test('collector: S-ID stable, rate limit, owner pinned server-side', async () => {
  const msgs = []; let now = 1e12; const dir = tmp();
  const c = new Collector({file: path.join(dir, 'c.json'), ownerHash: numberHash('919000000001'), notify: async (m) => { msgs.push(m); return true; }, now: () => now});
  const a = c.ingest(mk(1), '1.1.1.1'); assert.match(a.sid, /^S-[A-Z0-9]{6}$/);
  assert.equal(c.ingest(mk(1), '1.1.1.1').sid, a.sid);
  now += 700000; c.ingest(mk(1, {cmds: {ping: 4}}), '1.1.1.1'); assert.equal(c.db.installs[mk(1).id].cmds.ping, 7);
  const owner = c.ingest(mk(2, {nh: numberHash('919000000001')}), '2.2.2.2'); assert.equal(c.isExempt(owner.sid), true);
  const fake = c.ingest(mk(3, {nh: numberHash('919000000001')}), '3.3.3.3'); assert.equal(c.isExempt(fake.sid), false);
  assert.equal(c.isExempt(a.sid), false); assert.equal(c.ingest({...mk(4), extra: 1}, '4.4.4.4'), null);
  await c.flush(); assert.equal(msgs.length, 2); assert.ok(msgs.every((m) => !m.includes(owner.sid)));
  assert.equal(new Collector({file: path.join(dir, 'c.json')}).summary().total, 3);
});
test('collector: batches bursts, ip rate limit, notification can be off', async () => {
  const msgs = []; const c = new Collector({file: path.join(tmp(), 'c.json'), notify: async (m) => { msgs.push(m); return true; }});
  for (let i = 1; i <= 8; i++) c.ingest(mk(i * 7), 'burst' + i);
  await c.flush(); assert.equal(msgs.length, 1); assert.match(msgs[0], /8 new/);
  const d = new Collector({file: path.join(tmp(), 'd.json')}); let ok = 0; for (let i = 0; i < 70; i++) if (d.ingest(mk(100 + i), 'same-ip')) ok++; assert.equal(ok, 60);
  const e = new Collector({file: path.join(tmp(), 'e.json'), notify: async (m) => { msgs.push(m); return true; }}); e.ingest(mk(500), 'x'); await e.flush(false); assert.equal(msgs.length, 1);
});
test('client: stores S-ID, subtracts sent counts, off switch sends nothing', async () => {
  const dir = tmp(); let calls = 0; let body = null;
  const fetchFn = async (u, o) => { calls++; body = JSON.parse(o.body); return {ok: true, json: async () => ({sid: 'S-ABC234'})}; };
  const t = new Telemetry({dir, version: '1.7.0', getNumber: () => '919876543210', isOnline: () => true, url: 'http://x', fetchFn});
  count('ping'); count('ping'); count('bad name');
  assert.equal(await t.ping(), 'S-ABC234'); assert.equal(t.sid, 'S-ABC234'); assert.deepEqual(body.cmds, {ping: 2}); assert.ok(validatePayload(body));
  await t.ping(); assert.deepEqual(body.cmds, {});
  process.env.TELEMETRY = 'off'; const before = calls; assert.equal(await t.ping(), null); assert.equal(calls, before); delete process.env.TELEMETRY;
  const down = new Telemetry({dir: tmp(), version: '1', fetchFn: async () => { throw new Error('offline'); }}); assert.equal(await down.ping(), null);
});
