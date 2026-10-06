// Pairing-portal client. It only talks to the portal URL you set in settings.js (ecosystem.portalUrl).
// Nothing runs unless ecosystem.portalUrl AND ecosystem.ticket are both set. No phone number, code or S-ID is logged.
import fs from 'node:fs';
import path from 'node:path';

const SID = /^S-[A-Z0-9]{6}$/;
export const PROOF_PREFIX = 'JARVIS-PROOF ';
export const safeUrl = (u) => { try { const x = new URL(String(u || '')); return (x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname))) ? x.origin + x.pathname.replace(/\/$/, '') : ''; } catch { return ''; } };
/** Official portal. Used only after the user redeems a code from the pairing page; nothing is sent before that. Override with ecosystem.portalUrl. */
export const DEFAULT_PORTAL = 'https://3-110-115-23.sslip.io/portal';
const CODE = /^[A-Z0-9]{8}$/;
export const cleanCode = (c) => { const x = String(c || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); return CODE.test(x) ? x : ''; };
const ticketFile = (dir) => path.join(dir, 'ecosystem-ticket.json');
export function loadTicket(dir) { try { const j = JSON.parse(fs.readFileSync(ticketFile(dir), 'utf8')); return j.token && j.number ? {token: String(j.token), number: String(j.number)} : null; } catch { return null; } }
export function saveTicket(dir, token, number) { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(ticketFile(dir), JSON.stringify({token, number, savedAt: Date.now()}), {mode: 0o600}); }
/** Trades the short code from the pairing page for a ticket and stores it in data/ (no file editing). Only the code and your number go to the portal. */
export async function redeemCode({eco, dir, code, number, fetchFn = globalThis.fetch}) {
  const base = safeUrl(eco.portalUrl) || DEFAULT_PORTAL, c = cleanCode(code), n = String(number || '').replace(/\D/g, '');
  if (!c) return {ok: false, why: 'That code does not look right. It has 8 letters and numbers, like K7QM-4X2P.'};
  if (n.length < 8 || n.length > 15) return {ok: false, why: 'Could not read your number.'};
  try {
    const r = await fetchFn(base + '/pair/redeem', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({code: c, number: n}), signal: AbortSignal.timeout(15000)});
    const j = await r.json().catch(() => ({}));
    if (!j.success || !j.data?.token) return {ok: false, why: j.error?.message || 'The portal did not accept that code.'};
    saveTicket(dir, j.data.token, n); eco.portalUrl = base; eco.ticket = j.data.token; eco.number = n; return {ok: true};
  } catch { return {ok: false, why: 'The pairing service is not reachable right now. Try again in a minute.'}; }
}
/** Lets the /pair command reach the live socket without a circular import. */
export const bridge = {start: null};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Saved portal S-ID (data/ecosystem.json) so it survives restarts without editing settings.js. */
export function loadSaved(dir) { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'ecosystem.json'), 'utf8')); return SID.test(j.sid) ? j.sid : ''; } catch { return ''; } }
export function saveSid(dir, sid) { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(path.join(dir, 'ecosystem.json'), JSON.stringify({sid, savedAt: Date.now()}), {mode: 0o600}); }

export function createPairing({eco, dir, fetchFn = globalThis.fetch, sendText, sendSelf, log = () => {}, pollMs = 3000, maxPolls = 100, applySid = () => {}}) {
  const live = () => ({base: safeUrl(eco.portalUrl) || (eco.ticket ? DEFAULT_PORTAL : ''), token: String(eco.ticket || ''), number: String(eco.number || '').replace(/\D/g, '')});
  const active = () => { const l = live(); return !!(l.base && l.token && l.number); };
  async function post(p, body) {
    const r = await fetchFn(live().base + p, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)});
    const j = await r.json().catch(() => ({})); if (!j.success) throw new Error(j.error?.code || 'portal_error'); return j.data;
  }
  /** Called with the WhatsApp pairing code right after it is created. Only the code, ticket and number go to the portal. */
  async function relayCode(code) { if (!active() || loadSaved(dir)) return false; try { await post('/pair/bot/code', {token: live().token, number: live().number, code}); return true; } catch (e) { log('portal code relay failed: ' + e.message); return false; } }
  /** Called once WhatsApp is connected. Proves the link, waits for the portal, then DMs the S-ID to your own chat. */
  async function onLinked() {
    if (!active() || loadSaved(dir)) return null;
    try {
      const l = await post('/pair/bot/linked', {token: live().token, number: live().number});
      if (l.proof && l.proofTo) await sendText(l.proofTo, PROOF_PREFIX + l.proof);
      for (let i = 0; i < maxPolls; i++) {
        const s = await post('/pair/bot/status', {token: live().token});
        if (s.status === 'verified' && SID.test(s.sid || '')) { saveSid(dir, s.sid); applySid(s.sid); await sendSelf(`Jarvis\nYour Jarvis S-ID is ${s.sid}.\nKeep it private. Type /sid any time to see it.`); return s.sid; }
        await sleep(pollMs);
      }
    } catch (e) { log('portal link failed: ' + e.message); }
    return null;
  }
  return {active, relayCode, onLinked};
}

/** Maintainer install only (PORTAL_URL and PORTAL_PROOF_KEY in the environment): forwards a received proof message to the portal. */
export function createProofRelay({env = process.env, fetchFn = globalThis.fetch, log = () => {}} = {}) {
  const base = safeUrl(env.PORTAL_URL), key = env.PORTAL_PROOF_KEY || '';
  return async function relay(text, fromNumber) {
    if (!base || !key) return false;
    const m = /^JARVIS-PROOF ([A-Za-z0-9_-]{8,64})$/.exec(String(text || '').trim()); const from = String(fromNumber || '').replace(/\D/g, '');
    if (!m || from.length < 8 || from.length > 15) return false;
    try { const r = await fetchFn(base + '/pair/proof', {method: 'POST', headers: {'content-type': 'application/json', 'x-proof-key': key}, body: JSON.stringify({proof: m[1], from}), signal: AbortSignal.timeout(15000)}); return r.ok; } catch (e) { log('proof relay failed'); return false; }
  };
}

/** Maintainer install only: while WhatsApp is really connected, tells the portal "online" every few minutes (version only, no personal data). */
export function createHeartbeat({env = process.env, fetchFn = globalThis.fetch, version = '', intervalMs = 300000, log = () => {}} = {}) {
  const base = safeUrl(env.PORTAL_URL), key = env.PORTAL_PROOF_KEY || '';
  let timer = null, connected = false;
  const beat = async () => {
    if (!connected || !base || !key) return false;
    try { const r = await fetchFn(base + '/bot/heartbeat', {method: 'POST', headers: {'content-type': 'application/json', 'x-proof-key': key}, body: JSON.stringify({version: String(version || '')}), signal: AbortSignal.timeout(10000)}); return r.ok; } catch { log('heartbeat failed'); return false; }
  };
  return {
    beat,
    setConnected(v) {
      connected = !!v;
      if (!base || !key) return;
      if (connected && !timer) { beat(); timer = setInterval(beat, intervalMs); timer.unref?.(); }
      if (!connected && timer) { clearInterval(timer); timer = null; }
    },
  };
}
