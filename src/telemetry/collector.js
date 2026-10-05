// Runs only inside the owner's own deployment (TELEMETRY_COLLECTOR=on). Stores aggregate install stats, never chats or numbers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validatePayload} from './payload.js';

export const MAX_INSTALLS = 5000;
const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newSid = () => 'S-' + Array.from(crypto.randomBytes(6), (b) => A[b % A.length]).join('');
const DAY = 86400000;

export class Collector {
  constructor({file, ownerHash = '', notify = async () => false, now = () => Date.now()}) {
    this.file = file; this.ownerHash = ownerHash; this.notify = notify; this.now = now;
    this.db = {installs: {}, audit: []}; this.ipHits = new Map(); this.pending = []; this.sent = [];
    try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); if (d?.installs) this.db = d; } catch { /* first run */ }
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), {recursive: true}); fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.db)); fs.renameSync(this.file + '.tmp', this.file); } catch { /* keep memory */ } }
  rateOk(ip) { const t = this.now(); const a = (this.ipHits.get(ip) || []).filter((x) => t - x < 3600000); if (a.length >= 60) return false; this.ipHits.set(ip, [...a, t]); if (this.ipHits.size > 5000) this.ipHits.clear(); return true; }
  /** Returns {sid} or null (rejected). Directives are added in a later phase. */
  ingest(body, ip = '?') {
    if (!this.rateOk(ip)) return null;
    const p = validatePayload(body); if (!p) return null;
    const t = this.now(); let it = this.db.installs[p.id];
    if (!it) {
      if (Object.keys(this.db.installs).length >= MAX_INSTALLS) return null;
      it = this.db.installs[p.id] = {sid: newSid(), first: t, last: 0, ver: p.ver, up: 0, on: false, owner: false, pings: 0, cmds: {}};
      this.db.audit.push({t, e: 'new', sid: it.sid}); this.db.audit = this.db.audit.slice(-200);
      if (p.nh && this.ownerHash && p.nh === this.ownerHash && !Object.values(this.db.installs).some((i) => i.owner)) { it.owner = true; it.nh = p.nh; } // owner flag is decided here, never by the client
      else this.pending.push({sid: it.sid, ver: p.ver, t});
    } else if (t - it.last < 600000) { return {sid: it.sid}; }
    if (it.owner && p.nh && p.nh !== it.nh) return {sid: it.sid}; // a different number can not take over the owner S-ID
    if (!it.owner && p.nh && this.ownerHash && p.nh === this.ownerHash) { this.save(); return {sid: it.sid}; }
    it.last = t; it.ver = p.ver; it.up = p.up; it.on = p.on; it.pings++;
    for (const [k, n] of Object.entries(p.cmds)) { if (Object.keys(it.cmds).length < 300 || it.cmds[k]) it.cmds[k] = (it.cmds[k] || 0) + n; }
    this.save(); return {sid: it.sid};
  }
  isExempt(sid) { return Object.values(this.db.installs).some((i) => i.sid === sid && i.owner); }
  /** New-install DM to the owner: up to 5 per 10 minutes individually, then one batched line. */
  async flush(enabled = true) {
    if (!this.pending.length) return 0;
    const t = this.now(); this.sent = this.sent.filter((x) => t - x < 600000);
    if (!enabled) { this.pending = []; return 0; }
    const batch = this.pending; let n = 0;
    if (batch.length > 5 || this.sent.length + batch.length > 5) {
      if (await this.notify(`🆕 ${batch.length} new Jarvis installs (${batch.slice(0, 8).map((b) => b.sid).join(', ')}${batch.length > 8 ? ', ...' : ''}). Open the dashboard for details.`)) { this.sent.push(t); this.pending = []; n = batch.length; }
      return n;
    }
    for (const b of batch) { if (await this.notify(`🆕 New Jarvis install: ${b.sid} (v${b.ver}). Total installs: ${Object.keys(this.db.installs).length}.`)) { this.sent.push(t); n++; this.pending = this.pending.filter((x) => x !== b); } else break; }
    return n;
  }
  summary() {
    const t = this.now(); const list = Object.values(this.db.installs); const cmds = {}; const vers = {}; const ups = [];
    for (const i of list) { vers[i.ver] = (vers[i.ver] || 0) + 1; if (i.on) ups.push(i.up); for (const [k, n] of Object.entries(i.cmds)) cmds[k] = (cmds[k] || 0) + n; }
    ups.sort((a, b) => a - b);
    return {
      total: list.length, active24h: list.filter((i) => t - i.last < DAY).length, active7d: list.filter((i) => t - i.last < 7 * DAY).length, online: list.filter((i) => i.on && t - i.last < 2 * DAY).length,
      top: Object.entries(cmds).sort((a, b) => b[1] - a[1]).slice(0, 10), versions: Object.entries(vers).sort((a, b) => b[1] - a[1]), medianUptime: ups.length ? ups[Math.floor(ups.length / 2)] : 0,
      installs: list.sort((a, b) => b.last - a.last).slice(0, 50).map((i) => ({sid: i.sid, ver: i.ver, last: i.last, first: i.first, on: i.on, owner: i.owner, up: i.up})),
    };
  }
}
