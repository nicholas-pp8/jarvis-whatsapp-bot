// Owner shell: full-access server control for the VERIFIED owner only, via DM.
// - Strict gate: owner number + direct DM + not a forwarded message. No groups.
// - Destructive commands are staged and need a literal one-word YES within 5 min.
//   Before anything destructive runs, targets are tarred into data/ops-backup-*.
// - Secrets are never printed: output is redacted, and reading .env/auth or env
//   dumps is refused.
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config/config.js';
import logger from '../utils/logger.js';

// Owner-action audit trail: every shell command, send, staged action lands here (unmasked, owner-only file).
export function audit(line) {
  try {
    fs.mkdirSync('data', { recursive: true });
    fs.appendFileSync(path.join('data', 'agent-audit.log'), new Date().toISOString() + ' ' + String(line).replace(/[\r\n]+/g, ' ').slice(0, 500) + '\n');
  } catch { /* best effort */ }
}

const num = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

export function isVerifiedOwnerDM(ctx) {
  try {
    if (!ctx.isOwner || ctx.isGroup) return false;
    if (ctx.jid.endsWith('@g.us') || ctx.jid.endsWith('@broadcast') || ctx.jid.endsWith('@newsletter')) return false;
    if (num(ctx.sender) !== String(config.ownerNumber).replace(/\D/g, '')) return false;
    const m = ctx.msg?.message || {};
    for (const v of Object.values(m)) {
      const ci = v?.contextInfo;
      if (ci?.isForwarded || (ci?.forwardingScore || 0) > 0) return false;
    }
    return true;
  } catch { return false; }
}

const DESTRUCTIVE = /(^|\s|&&|\|\||;)(rm|rmdir|mv|dd|shred|kill|pkill|killall|truncate)(\s|$)|>\s*[^&]|chmod\s+-R|chown\s+-R|npm\s+(uninstall|remove)|git\s+(push|reset\s+--hard|clean)|:\s*\(\s*\)\s*\{|\bmkfs\b|\breboot\b|\bshutdown\b|\/api\/client\/servers\/[^\s"']+\/power\b/i;
const SECRET_READ = /(^|\s)(cat|less|more|head|tail|strings|xxd|base64|cp|tar|grep|awk|sed|source|\.)\s+[^|;]*(\.env\b|\bauth[\/\s]|auth-backup|\.ssh|id_rsa|id_ed25519)|^\s*(env|printenv|export\s+-p)\s*($|;|\|)/i;
const REFUSE = /(wifite|aircrack|metasploit|hydra|nmap\s+.*-p|sqlmap|ddos|\bflood|\bspam)/i;

export function classify(cmd) {
  if (SECRET_READ.test(cmd)) return 'secret';
  if (REFUSE.test(cmd)) return 'refused';
  if (DESTRUCTIVE.test(cmd)) return 'destructive';
  return 'safe';
}

const REDACT = /([A-Za-z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|SALT|CREDENTIAL)[A-Za-z0-9_]*\s*[=:]\s*)\S+/gi;
export function redact(text) {
  let t = String(text ?? '');
  t = t.replace(REDACT, '$1[hidden]');
  // long token-shaped blobs (32+ chars of token alphabet) are masked too
  t = t.replace(/\b[A-Za-z0-9_\-+/]{40,}={0,2}\b/g, (m) => m.length >= 40 ? '[hidden]' : m);
  return t.slice(0, 3500);
}

export function execShell(cmd, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: process.cwd(), timeout: timeoutMs, maxBuffer: 1024 * 1024, env: { ...process.env, TERM: 'dumb' } }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, out: redact((stdout || '') + (stderr ? '\n' + stderr : '')) });
    });
  });
}

// Staging + confirmation
let pending = null; // {id, cmds, createdAt}
export function stage(cmds, extra = {}) {
  pending = { id: crypto.randomBytes(3).toString('hex'), cmds, restarts: extra.restarts || 0, createdAt: Date.now() };
  return pending;
}
export const getPending = () => (pending && Date.now() - pending.createdAt < 5 * 60e3 ? pending : null);
export const clearPending = () => { pending = null; };

// Back up every existing file/dir a destructive command touches, then run.
export async function backupTargets(cmds) {
  const targets = new Set();
  for (const c of cmds) {
    for (const m of c.matchAll(/(?:rm|mv|cp|truncate|shred)\s+(?:-[a-zA-Z]+\s+)*([^\s;&|]+)/gi)) targets.add(m[1]);
    for (const m of c.matchAll(/>\s*([^\s;&|]+)/g)) targets.add(m[1]);
  }
  const existing = [...targets].filter((t) => { try { fs.lstatSync(path.resolve(t)); return true; } catch { return false; } });
  if (!existing.length) return null;
  const rel = path.join('data', 'ops-backup-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.tar.gz');
  try {
    await execShell(`mkdir -p data`);
    const { code } = await execShell(`tar czf ${JSON.stringify(rel)} -- ${existing.map((t) => JSON.stringify(t)).join(' ')}`);
    if (code !== 0) return null;
    return rel;
  } catch { return null; }
}


// Count and size the existing files a destructive command set would touch (for plain-language confirms).
export function describeTargets(cmds) {
  const targets = new Set();
  for (const c of cmds) {
    for (const m of c.matchAll(/(?:rm|mv|cp|truncate|shred)\s+(?:-[a-zA-Z]+\s+)*([^\s;&|]+)/gi)) targets.add(m[1]);
    for (const m of c.matchAll(/>\s*([^\s;&|]+)/g)) targets.add(m[1]);
  }
  let count = 0, bytes = 0;
  for (const t of targets) {
    try {
      const st = fs.lstatSync(path.resolve(t));
      count++;
      if (!st.isDirectory()) bytes += st.size;
    } catch { /* gone already */ }
  }
  return { count, bytes, targets: [...targets] };
}

export async function runStaged(p) {
  const backup = await backupTargets(p.cmds);
  const results = [];
  for (const c of p.cmds) {
    const r = await execShell(c);
    results.push({ cmd: c, ...r });
    logger.info('[ownershell] ran staged: ' + c.slice(0, 80) + ' -> ' + r.code);
  }
  return { backup, results };
}
