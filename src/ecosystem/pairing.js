// Pairing-portal client. It only talks to the portal URL you set in settings.js (ecosystem.portalUrl).
// Nothing runs unless ecosystem.portalUrl AND ecosystem.ticket are both set. No phone number, code or S-ID is logged.
import fs from 'node:fs';
import path from 'node:path';

const SID = /^S-[A-Z0-9]{6}$/;
export const PROOF_PREFIX = 'JARVIS-PROOF ';
export const safeUrl = (u) => { try { const x = new URL(String(u || '')); return (x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname))) ? x.origin + x.pathname.replace(/\/$/, '') : ''; } catch { return ''; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Saved portal S-ID (data/ecosystem.json) so it survives restarts without editing settings.js. */
export function loadSaved(dir) { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'ecosystem.json'), 'utf8')); return SID.test(j.sid) ? j.sid : ''; } catch { return ''; } }
export function saveSid(dir, sid) { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(path.join(dir, 'ecosystem.json'), JSON.stringify({sid, savedAt: Date.now()}), {mode: 0o600}); }

export function createPairing({eco, dir, fetchFn = globalThis.fetch, sendText, sendSelf, log = () => {}, pollMs = 3000, maxPolls = 100, applySid = () => {}}) {
  const base = safeUrl(eco.portalUrl), token = String(eco.ticket || ''), number = String(eco.number || '').replace(/\D/g, '');
  const active = () => !!(base && token && number);
  async function post(p, body) {
    const r = await fetchFn(base + p, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)});
    const j = await r.json().catch(() => ({})); if (!j.success) throw new Error(j.error?.code || 'portal_error'); return j.data;
  }
  /** Called with the WhatsApp pairing code right after it is created. Only the code, ticket and number go to the portal. */
  async function relayCode(code) { if (!active() || loadSaved(dir)) return false; try { await post('/pair/bot/code', {token, number, code}); return true; } catch (e) { log('portal code relay failed: ' + e.message); return false; } }
  /** Called once WhatsApp is connected. Proves the link, waits for the portal, then DMs the S-ID to your own chat. */
  async function onLinked() {
    if (!active() || loadSaved(dir)) return null;
    try {
      const l = await post('/pair/bot/linked', {token, number});
      if (l.proof && l.proofTo) await sendText(l.proofTo, PROOF_PREFIX + l.proof);
      for (let i = 0; i < maxPolls; i++) {
        const s = await post('/pair/bot/status', {token});
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
