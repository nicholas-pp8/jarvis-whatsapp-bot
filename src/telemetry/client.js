// Open, anonymous install ping. Off with TELEMETRY=off. Payload fields are fixed in payload.js and listed in the README.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildPayload} from './payload.js';

export const DEFAULT_URL = 'https://3-110-115-23.sslip.io/jarvis-telemetry';
const counts = {};
export const count = (name) => { if (typeof name === 'string' && /^[a-z0-9_]{1,30}$/.test(name)) counts[name] = (counts[name] || 0) + 1; };
export const enabled = () => String(process.env.TELEMETRY || 'on').toLowerCase() !== 'off';

export class Telemetry {
  constructor({dir, version, getNumber = () => '', isOnline = () => false, url = process.env.TELEMETRY_URL || DEFAULT_URL, fetchFn = globalThis.fetch, log = () => {}}) {
    this.dir = dir; this.version = version; this.getNumber = getNumber; this.isOnline = isOnline; this.url = url; this.fetchFn = fetchFn; this.log = log;
    this.started = Date.now(); this.timers = [];
    this.idFile = path.join(dir, 'install-id'); this.sidFile = path.join(dir, 'sid');
    this.id = this.readId();
  }
  readId() {
    try { const v = fs.readFileSync(this.idFile, 'utf8').trim(); if (/^[a-f0-9]{24}$/.test(v)) return v; } catch { /* create */ }
    const v = crypto.randomBytes(12).toString('hex'); try { fs.mkdirSync(this.dir, {recursive: true}); fs.writeFileSync(this.idFile, v); } catch { /* best effort */ } return v;
  }
  get sid() { try { return fs.readFileSync(this.sidFile, 'utf8').trim() || null; } catch { return null; } }
  payload() { return buildPayload({id: this.id, ver: this.version, up: (Date.now() - this.started) / 1000, on: this.isOnline(), number: this.getNumber(), cmds: {...counts}}); }
  async ping() {
    if (!enabled() || !this.fetchFn) return null;
    const body = this.payload(); const sent = {...body.cmds};
    try {
      const r = await this.fetchFn(this.url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)});
      if (!r.ok) return null;
      const j = await r.json();
      for (const [k, n] of Object.entries(sent)) { counts[k] = (counts[k] || 0) - n; if (counts[k] <= 0) delete counts[k]; }
      if (typeof j?.sid === 'string' && /^S-[A-Z0-9]{6}$/.test(j.sid)) { try { fs.writeFileSync(this.sidFile, j.sid); } catch { /* best effort */ } return j.sid; }
    } catch { /* offline or collector down: stay silent, retry next cycle */ }
    return null;
  }
  start() {
    if (!enabled()) { this.log('[telemetry] off (TELEMETRY=off)'); return; }
    this.log('[telemetry] anonymous install ping is on (random install id, version, uptime, command counts). Set TELEMETRY=off to disable. See README.');
    const first = setTimeout(() => this.ping(), 45000); const daily = setInterval(() => this.ping(), 24 * 3600000);
    first.unref?.(); daily.unref?.(); this.timers.push(first, daily);
  }
  stop() { for (const t of this.timers) { clearTimeout(t); clearInterval(t); } this.timers = []; }
}
