// Agent Mode: give Jarvis a goal, it plans a few steps and runs them.
// - Everyone (SAFE mode): read-only whitelist commands only. Out-of-scope goals
//   get a clear answer, never generic shell dumps.
// - Verified owner DM (shell mode, flag 'ownershell'): full-access shell planner.
//   Safe commands run right away; destructive ones are staged and need a literal
//   one-word YES (or "/agent yes") within 5 min, with an automatic backup first.
//   Secrets are never printed; attacks/privacy violations are refused.
//   Owner replies are short plain English summaries - raw command output is only
//   shown when the owner asks for it ("raw").
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { askAi } from '../ai/providers.js';
import { registry } from '../handlers/commandHandler.js';
import * as shell from '../utilities/ownershell.js';
import { suggest } from '../utils/suggest.js';
import { createProgressMessage } from '../utils/progressBar.js';
import { getSock } from '../utilities/ownersock.js';
import * as agentqueue from '../utilities/agentqueue.js';
import fs from 'node:fs';
import path from 'node:path';
import cron from 'node-cron';

const SAFE = ['weather', 'news', 'ask', 'define', 'translate', 'wiki', 'time', 'stock', 'quote', 'lyrics'];
const MAX_STEPS = 5, MAX_GOAL = 300, MAX_ARG = 120, SH_STEPS = 15, SH_EXEC_CAP = 100;

function resolveCmd(name) {
  const direct = registry.get(name);
  if (direct) return { cmd: direct, name };
  const near = suggest(name, registry.list(), 1);
  if (near && near.length) {
    const c = registry.get(near[0]);
    if (c) return { cmd: c, name: near[0] };
  }
  return null;
}

const hits = new Map(); // user -> [timestamps]
function allow(user, perHour, now = Date.now()) {
  const list = (hits.get(user) || []).filter((t) => now - t < 3600e3);
  if (list.length >= perHour) { hits.set(user, list); return false; }
  list.push(now); hits.set(user, list);
  if (hits.size > 2000) hits.clear();
  return true;
}

function parsePlan(raw) {
  const m = String(raw || '').match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || !arr.length) return null;
    const steps = [];
    for (const s of arr.slice(0, MAX_STEPS)) {
      if (s?.answer) {
        steps.push({ answer: String(s.answer).slice(0, 800) });
        continue;
      }
      const cmd = String(s?.cmd || '').toLowerCase().replace(/[^a-z]/g, '');
      const args = String(s?.args || '').slice(0, MAX_ARG).replace(/[\r\n]/g, ' ').trim();
      if (!SAFE.includes(cmd)) return null; // any unsafe/unknown step rejects the whole plan
      steps.push({ cmd, args });
    }
    return steps.length ? steps : null;
  } catch { return null; }
}

function parseShellPlan(raw) {
  const m = String(raw || '').match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || !arr.length) return null;
    const steps = [];
    for (const s of arr.slice(0, SH_STEPS)) {
      if (s?.refuse) return { refuse: String(s.refuse).slice(0, 300) };
      if (s?.done) return { done: String(s.done).slice(0, 300) };
      if (s?.ask) return { ask: String(s.ask).slice(0, 300) };
      if (s?.schedule) {
        const c = String(s.schedule.cron || '').trim();
        const g = String(s.schedule.goal || '').trim().slice(0, 200);
        if (!/^([\d*/,-]+\s+){4}[\d*/,-]+$/.test(c) || !g) return null;
        steps.push({ type: 'schedule', cron: c, goal: g });
        continue;
      }
      if (s?.restart === true) { steps.push({ type: 'restart' }); continue; }
      if (s?.send) {
        const to = String(s.send.to || '').replace(/\D/g, '');
        const text = String(s.send.text || '').replace(/[\r\n]{3,}/g, '\n\n').slice(0, 1000).trim();
        if (to.length < 8 || to.length > 15 || !text) return null;
        steps.push({ type: 'send', to, text });
        continue;
      }
      if (s?.bulk) {
        const cmd = String(s.bulk.cmd || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const items = (Array.isArray(s.bulk.items) ? s.bulk.items : [])
          .map((i) => String(i).slice(0, MAX_ARG).replace(/[\r\n]/g, ' ').trim()).filter(Boolean);
        if (!cmd || items.length < 1) return null;
        const prev = steps[steps.length - 1];
        if (prev && prev.type === 'bulk' && prev.cmd === cmd) { prev.items.push(...items); continue; }
        steps.push({ type: 'bulk', cmd, items });
        continue;
      }
      if (s?.cmd) {
        const cmd = String(s.cmd).toLowerCase().replace(/[^a-z0-9]/g, '');
        const args = String(s.args || '').slice(0, 200).replace(/[\r\n]/g, ' ').trim();
        if (!cmd) return null;
        steps.push({ type: 'cmd', cmd, args });
        continue;
      }
      const sh = String(s?.sh || '').trim();
      if (!sh || sh.length > 300 || /\r|\n/.test(sh)) return null;
      steps.push({ type: 'sh', sh });
    }
    return steps.length ? { steps } : null;
  } catch { return null; }
}

// Turn raw shell output into a short plain-English summary for the owner.
async function summarize(raw, extraInstruction = '') {
  try {
    const r = await askAi(
      'You are Jarvis. This is the result of work you just did on your own server:\n\n' + String(raw).slice(0, 2500) +
      '\n\nSummarize it for the owner in 2-4 short plain English sentences with the key numbers and names. ' +
      'Do not write any commands or code. Be direct and factual.' + (extraInstruction ? ' ' + extraInstruction : ''),
      { allowKeyless: true, temperature: 0.2 });
    const t = String(r?.text || r || '').trim();
    if (t && t.length > 10) return t.slice(0, 1200);
  } catch (e) { logger.warn('[agent] summarizer failed: ' + (e?.message || 'error')); }
  return null; // caller falls back
}

function fallbackSummary(results) {
  const ok = results.filter((r) => r.code === 0).length;
  const failed = results.length - ok;
  let t = ok + ' action(s) completed' + (failed ? ', ' + failed + ' failed' : '') + '.';
  if (failed) {
    const first = results.find((r) => r.code !== 0);
    t += ' First error: ' + (first.out || 'exit ' + first.code).split('\n').filter(Boolean).slice(-1)[0].slice(0, 200);
  }
  return t;
}

// Raw output shown only on request, fresh for 10 minutes after a run.
let lastRaw = null; // {ts, text}

async function editOrReply(ctx, live, text) {
  if (live?.key) { try { return void await ctx.sock.sendMessage(ctx.jid, { text, edit: live.key }); } catch {} }
  return ctx.reply(text);
}

function fmtMB(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

// ---- Deterministic junk cleanup ------------------------------------------
// "clean up junk" goals never reach the LLM planner: scan known junk spots,
// show an itemized list with sizes, delete only after YES, report MB freed.
const JUNK_DENY = /(^|\/)(auth|auth-backup|sessions?|creds|\.env|node_modules\/(?!\.cache)|package(-lock)?\.json|config\.|agent-queue\.json|agent-session\.json)/i;
function isCancelDownloadGoal(goal) {
  return /\b(cancel|stop|band|ruk jao|roko)\b/i.test(goal) && /\b(download|queue|pinterest|videos?|songs?|photos?|memes?|bulk|files?|sab|bhejna)\b/i.test(goal);
}
function isJunkCleanupGoal(goal) {
  if (/\b(check|batao|dikhao|kitna|status|how much|show)\b/i.test(goal)) return false;
  return /\b(clean ?up|cleanup|junk|saaf|hatao|free up|clear (?:the )?(?:cache|tmp|temp|logs))\b/i.test(goal);
}
function scanJunk() {
  const DAY = 864e5, now = Date.now();
  const junk = [];
  const seen = new Set();
  const push = (p, bytes, why) => {
    const rp = path.resolve(p);
    if (seen.has(rp) || JUNK_DENY.test(p)) return;
    seen.add(rp);
    junk.push({ path: p, bytes, why });
  };
  const walk = (dir, why, maxAgeMs, depth) => {
    if (depth > 4) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (JUNK_DENY.test(p)) continue;
      try {
        if (e.isDirectory()) walk(p, why, maxAgeMs, depth + 1);
        else if (e.isFile()) {
          const st = fs.statSync(p);
          if (now - st.mtimeMs > maxAgeMs) push(p, st.size, why);
        }
      } catch { /* skip */ }
    }
  };
  // old logs: keep the 2 newest
  try {
    const logs = fs.readdirSync('data/logs').filter((f) => f.endsWith('.log'))
      .map((f) => ({ f, m: fs.statSync(path.join('data/logs', f)).mtimeMs })).sort((a, b) => b.m - a.m);
    for (const l of logs.slice(2)) { const p = path.join('data/logs', l.f); push(p, fs.statSync(p).size, 'old log'); }
  } catch { /* none */ }
  // rollback/ops archives: keep the 2 newest of each family
  for (const [dir, re, why] of [['.', /^archive-.*\.tar\.gz$/i, 'old rollback archive'], ['data', /^ops-backup-.*\.tar\.gz$/i, 'old auto backup'], ['data', /^agent-session-.*\.bak$/i, 'old session backup']]) {
    try {
      const arcs = fs.readdirSync(dir).filter((f) => re.test(f))
        .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
      for (const a of arcs.slice(2)) { const p = dir === '.' ? a.f : path.join(dir, a.f); push(p, fs.statSync(p).size, why); }
    } catch { /* none */ }
  }
  // caches: any age; tmp/download staging: older than a day
  for (const d of ['node_modules/.cache', '.cache']) walk(d, 'cache', 0, 0);
  for (const d of ['tmp', 'data/tmp', 'downloads', 'data/downloads', 'data/media', 'data/staging']) walk(d, 'leftover temp file', DAY, 0);
  return junk;
}
async function runJunkCleanup(ctx) {
  await ctx.reply('Scanning for junk (old logs, old archives, caches, temp files)...');
  const junk = scanJunk();
  if (!junk.length) return ctx.reply('No junk found - logs, archives, caches and temp folders are already clean.');
  const total = junk.reduce((s, j) => s + j.bytes, 0);
  const fmt = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const lines = junk.slice(0, 15).map((j) => '- ' + j.path + ' (' + fmt(j.bytes) + ') - ' + j.why);
  if (junk.length > 15) lines.push('- ...and ' + (junk.length - 15) + ' more');
  const cmds = junk.map((j) => 'rm -rf -- ' + JSON.stringify(j.path));
  shell.stage(cmds, { restarts: 0, note: 'Expected to free about ' + fmt(total) + '.' });
  shell.audit('JUNK SCAN found ' + junk.length + ' item(s), ' + total + ' bytes');
  return ctx.reply('Found ' + junk.length + ' junk item(s), about ' + fmt(total) + ' total:\n' + lines.join('\n') +
    '\n\nNothing is deleted yet. Reply YES within 5 minutes to delete all of these, or NO to cancel. A backup is taken automatically first.');
}

// Shared YES/NO handler used by the /agent command and the plain-text YES/NO hook.
// Returns true when the message was a pending-confirmation answer (handled).
export async function handlePendingAnswer(ctx, isYes) {
  const p = shell.getPending();
  if (!p) return false;
  if (!shell.isVerifiedOwnerDM(ctx)) return false;
  if (!isYes) {
    shell.clearPending();
    shell.audit('CANCELLED staged actions');
    await ctx.reply('Cancelled. Nothing was changed.');
    return true;
  }
  shell.clearPending();
  if (p.kind === 'install') return runInstallConfirmed(ctx, p);
  if (p.kind === 'update') return runUpdateConfirmed(ctx, p);
  await ctx.reply('Confirmed - taking a backup first, then running ' + (p.cmds.length + (p.restarts || 0)) + ' action(s)...');
  const { backup, results } = await shell.runStaged(p);
  lastRaw = { ts: Date.now(), text: results.map((r) => '$ ' + r.cmd + ' (exit ' + r.code + ')\n' + r.out).join('\n---\n') };
  const failed = results.filter((r) => r.code !== 0).length;
  const rawForAi = results.map((r) => r.cmd + ' -> exit ' + r.code + (r.out ? '\n' + r.out : '')).join('\n');
  let text = (results.length ? ((await summarize(rawForAi, 'Say clearly what was deleted or changed and whether it all worked.')) || fallbackSummary(results)) : 'Nothing to run.');
  if (p.note) text += '\n' + p.note;
  await ctx.reply(
    (backup ? 'Backup saved: ' + backup + '\n' : '') +
    (failed ? '⚠️ ' : '') + text +
    '\n(Reply "/agent raw" within 10 min to see the exact output.)');
  if (p.restarts > 0) {
    await ctx.reply('Restarting Jarvis now - back in about a minute.');
    try {
      const { shutdown } = await import('../connection/whatsapp.js');
      setTimeout(() => shutdown(0), 3000);
    } catch (e) { logger.warn('[agent] restart failed: ' + (e?.message || 'error')); }
  }
  return true;
}

// ---- Pure questions: answer in plain English, never plan or stage --------
function isInfoQuestion(goal) {
  const g = goal.trim();
  if (/^(can|could)\s+(u|you)\b/i.test(g) && g.length <= 140) return true;
  if (/\?$/.test(g) && g.split(/\s+/).length <= 25) return true;
  return /^(can|could|kya|will|would|does|do|is|are|what|how|why|when|which|who)\b/i.test(g) && g.split(/\s+/).length <= 12 && !/\b(download|install|update|delete|clean|remove|send|run|restart|create|make|schedule)\b/i.test(g);
}
async function runInfoAnswer(ctx, goal) {
  try {
    const a = await askAi('You are Jarvis, a WhatsApp bot. The owner asks a question ABOUT your abilities or status. Answer in 2-4 short plain-English sentences. Facts you can use: /agent can install npm packages and create new commands (owner asks, confirms with YES, self-tested before going live); /agent can update one package or all packages with backup + automatic rollback; downloads via /play /video /pinterest; bulk queues with cancel via "/agent cancel downloading"; junk cleanup via "/agent clean up junk". If the question is not about Jarvis, answer normally and briefly. Question: ' + goal);
    return ctx.reply(String(a || 'I am not sure about that.').slice(0, 900));
  } catch { return ctx.reply('I could not think that through right now - try again in a moment.'); }
}

// ---- Install a package + create a command (owner flow, YES-gated) --------
function parseInstallGoal(goal) {
  if (!/^\s*(install|add)\b/i.test(goal)) return null;
  const m = goal.match(/\b(?:install|add)\s+(?:the\s+)?(?:npm\s+)?(?:package\s+)?(@?[a-z0-9][a-z0-9._\/-]*)/i);
  if (!m) return null;
  const pkg = m[1].replace(/\.+$/, '');
  if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(pkg)) return null;
  let cmdName = null;
  const cm = goal.match(/\/?([a-z][a-z0-9]{1,20})\s+command/i) || goal.match(/command\s+(?:called|named)\s+\/?([a-z][a-z0-9]{1,20})/i);
  if (cm) cmdName = cm[1].toLowerCase();
  return { pkg, cmdName };
}
function parseUpdateGoal(goal) {
  if (!/^\s*update\b/i.test(goal)) return null;
  const m = goal.match(/^\s*update\s+(all|everything|@?[a-z0-9][a-z0-9._\/-]*)/i);
  if (!m) return null;
  const target = m[1].toLowerCase();
  if (/^(all|everything)$/.test(target)) return { updateAll: true };
  const pkg = m[1].replace(/\.+$/, '');
  if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(pkg)) return null;
  return { pkg };
}
async function runInstallFlow(ctx, goal) {
  const parsed = parseInstallGoal(goal);
  if (!parsed) return ctx.reply('Tell me the package, e.g. "/agent install mathjs make a calc command".');
  const { pkg } = parsed;
  await ctx.reply('Checking ' + pkg + ' on npm...');
  const view = await shell.execShell('npm view ' + JSON.stringify(pkg) + ' version description --json', { timeoutMs: 45000 });
  let meta = null;
  try { meta = JSON.parse((view.out || '').trim().split('\n').pop()); } catch { /* not JSON */ }
  if (view.code !== 0 || !meta?.version) return ctx.reply('I could not find the package "' + pkg + '" on npm. Check the exact name and try again.');
  let cmdName = parsed.cmdName || pkg.replace(/^@[^/]+\//, '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 15);
  if (registry.get(cmdName)) return ctx.reply('/' + cmdName + ' already exists - pick another command name, e.g. "/agent install ' + pkg + ' make a ' + cmdName + '2 command".');
  await ctx.reply('Writing the /' + cmdName + ' command...');
  let code = '';
  try {
    code = await askAi('Write a WhatsApp bot command module (ESM JavaScript) for a Baileys bot. Output ONLY the JavaScript file content - no markdown fences, no explanation.\nContract:\nexport default {\n  name: \'' + cmdName + '\',\n  aliases: [],\n  category: \'Tools\',\n  description: \'<one short line>\',\n  usage: \'' + cmdName + ' <input>\',\n  minArgs: 1,\n  async run(ctx) { ... }\n};\nInside run(ctx): ctx.args is the user\'s words as a string array; await ctx.reply(text) sends a plain reply; keep replies short, plain English. Use the npm package "' + pkg + '" and Node builtins only. NEVER read or print process.env, tokens, keys, .env, or files under auth/. On missing input reply with the usage line. Wrap work in try/catch and reply a short honest error.\nPackage: ' + pkg + ' (' + String(meta.description || '').slice(0, 200) + ')\nOwner request: ' + goal.slice(0, 300));
  } catch (e) { return ctx.reply('I could not write the command code right now (' + (e?.message || 'error') + '). Nothing was installed.'); }
  code = String(code || '').trim().replace(/^```(?:js|javascript)?\s*/i, '').replace(/```\s*$/, '').trim();
  const problems = [];
  if (!/export\s+default/.test(code)) problems.push('missing export default');
  if (!new RegExp("name:\\s*['\"]" + cmdName + "['\"]").test(code)) problems.push('name mismatch');
  if (!/async\s+run\s*\(/.test(code)) problems.push('missing async run');
  if (/process\.env|auth\/|auth-backup|\.env\b|child_process|writeFileSync\s*\(\s*['\"][^'\"]*\.(env|key|pem)/.test(code)) problems.push('unsafe content');
  if (problems.length) return ctx.reply('The generated /' + cmdName + ' code failed safety checks (' + problems.join(', ') + '). Nothing was installed - try again or rephrase.');
  const tmpName = '_newcmd-' + cmdName + '.js';
  const tmpFile = path.join('src', 'commands', tmpName);
  fs.writeFileSync(tmpFile, code);
  const chk = await shell.execShell('node --check ' + JSON.stringify(tmpFile), { timeoutMs: 30000 });
  if (chk.code !== 0) { try { fs.unlinkSync(tmpFile); } catch {} return ctx.reply('The generated /' + cmdName + ' code has a syntax error. Nothing was installed - try again.'); }
  shell.stage([], { kind: 'install', install: { pkg, version: meta.version, cmdName, tmpFile, finalFile: path.join('src', 'commands', cmdName + '.js') } });
  shell.audit('INSTALL STAGED ' + pkg + '@' + meta.version + ' as /' + cmdName);
  return ctx.reply('Plan: install ' + pkg + ' v' + meta.version + ' and add a new /' + cmdName + ' command (' + String(meta.description || 'no description').slice(0, 120) + '). After a self-test passes, Jarvis restarts and /' + cmdName + ' is live.\nNothing is installed yet. Reply YES within 5 minutes to go ahead, or NO to cancel.');
}
async function runInstallConfirmed(ctx, p) {
  const { pkg, version, cmdName, tmpFile, finalFile } = p.install;
  await ctx.reply('Confirmed - installing ' + pkg + ', self-testing /' + cmdName + ', then restarting...');
  const inst = await shell.execShell('npm install ' + JSON.stringify(pkg) + ' --no-audit --no-fund', { timeoutMs: 240000 });
  shell.audit('INSTALL ' + pkg + ' -> exit ' + inst.code);
  if (inst.code !== 0) { try { fs.unlinkSync(tmpFile); } catch {} return ctx.reply('npm install failed, nothing was added:\n' + String(inst.out || '').slice(-400)); }
  try {
    const mod = await import('./' + path.basename(tmpFile) + '?t=' + Date.now());
    const cmd = mod.default;
    if (!cmd?.name || typeof cmd.run !== 'function') throw new Error('bad module shape');
    const replies = [];
    const mockCtx = { args: ['2+2'], sender: ctx.sender, senderJid: ctx.senderJid, jid: ctx.jid, isOwner: true, isGroup: false, msg: ctx.msg, text: '', commands: ctx.commands, sock: ctx.sock, reply: async (t) => { replies.push(String(t)); return { key: {} }; } };
    await Promise.race([cmd.run(mockCtx), new Promise((_, rej) => setTimeout(() => rej(new Error('self-test timed out (15s)')), 15000))]);
    shell.audit('INSTALL self-test passed for /' + cmdName);
  } catch (e) {
    await shell.execShell('npm uninstall ' + JSON.stringify(pkg) + ' --no-audit --no-fund', { timeoutMs: 180000 });
    try { fs.unlinkSync(tmpFile); } catch {}
    shell.audit('INSTALL self-test FAILED for /' + cmdName + ': ' + (e?.message || 'error') + ' - rolled back');
    return ctx.reply('The new /' + cmdName + ' failed its self-test (' + String(e?.message || 'error').slice(0, 150) + '). Rolled back: package uninstalled, no command added. Jarvis keeps running as before.');
  }
  fs.renameSync(tmpFile, finalFile);
  shell.audit('COMMAND ADDED /' + cmdName + ' (package ' + pkg + ')');
  await ctx.reply('Installed ' + pkg + (version ? ' v' + version : '') + '. /' + cmdName + ' passed its self-test. Restarting Jarvis now - back in about a minute with /' + cmdName + ' live. (Rollback: "/agent remove the ' + cmdName + ' command".)');
  try { const { shutdown } = await import('../connection/whatsapp.js'); setTimeout(() => shutdown(0), 3000); } catch (e) { logger.warn('[agent] restart failed: ' + (e?.message || 'error')); }
  return true;
}
async function runUpdateFlow(ctx, goal) {
  const parsed = parseUpdateGoal(goal);
  if (!parsed) return ctx.reply('Say "/agent update all" or "/agent update <package>".');
  await ctx.reply('Checking for updates...');
  const list = [];
  if (parsed.updateAll) {
    const r = await shell.execShell('npm outdated --json', { timeoutMs: 90000 });
    let out = {};
    try { out = JSON.parse((r.out || '').trim().split('\n{').length > 1 ? '{' + (r.out || '').trim().split('\n{').pop() : (r.out || '{}')); } catch { out = {}; }
    for (const [name, info] of Object.entries(out)) {
      if (!info?.current || !info?.latest) continue;
      const major = String(info.current).split('.')[0] !== String(info.latest).split('.')[0];
      list.push({ name, from: info.current, to: info.latest, major });
    }
    if (!list.length) return ctx.reply('Everything is already up to date.');
  } else {
    const inst = (() => { try { return JSON.parse(fs.readFileSync(path.join('node_modules', parsed.pkg, 'package.json'), 'utf8')).version; } catch { return null; } })();
    const view = await shell.execShell('npm view ' + JSON.stringify(parsed.pkg) + ' version', { timeoutMs: 45000 });
    const latest = (view.out || '').trim().split('\n').pop();
    if (view.code !== 0 || !latest) return ctx.reply('Could not find the package "' + parsed.pkg + '" on npm.');
    if (!inst) return ctx.reply(parsed.pkg + ' is not installed. Use "/agent install ' + parsed.pkg + ' ..." instead.');
    if (inst === latest) return ctx.reply(parsed.pkg + ' is already at the latest version (' + latest + ').');
    list.push({ name: parsed.pkg, from: inst, to: latest, major: inst.split('.')[0] !== latest.split('.')[0] });
  }
  const majors = list.filter((u) => u.major);
  const baileys = list.some((u) => /baileys/i.test(u.name));
  const shown = list.slice(0, 12).map((u) => '- ' + u.name + ' ' + u.from + ' -> ' + u.to + (u.major ? ' (MAJOR bump)' : ''));
  if (list.length > 12) shown.push('- ...and ' + (list.length - 12) + ' more');
  shell.stage([], { kind: 'update', install: { plan: list, updateAll: !!parsed.updateAll } });
  shell.audit('UPDATE STAGED ' + list.length + ' package(s): ' + list.slice(0, 8).map((u) => u.name + '@' + u.to).join(', '));
  return ctx.reply('Updates available (' + list.length + '):\n' + shown.join('\n') +
    (majors.length ? '\n⚠️ Major version bump(s): ' + majors.map((u) => u.name).join(', ') + ' - higher risk of breakage.' : '') +
    (baileys ? '\n⚠️ Baileys is in the list: Jarvis patches parts of it, so the post-update self-test matters extra here.' : '') +
    '\nA backup of package.json + package-lock.json is taken first; if the self-test after restart fails, Jarvis rolls back automatically. Nothing is changed yet. Reply YES within 5 minutes to update, or NO to cancel.');
}
async function runUpdateConfirmed(ctx, p) {
  const { plan, updateAll } = p.install;
  const backupDir = path.join('data', 'ops-backup-pkg-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  await ctx.reply('Confirmed - backing up package files, then updating ' + plan.length + ' package(s)...');
  const bk = await shell.execShell('mkdir -p ' + JSON.stringify(backupDir) + ' && cp package.json package-lock.json ' + JSON.stringify(backupDir) + '/', { timeoutMs: 30000 });
  if (bk.code !== 0) return ctx.reply('Backup failed - refusing to update without a rollback path. Nothing was changed.');
  const cmd = updateAll ? 'npm update --no-audit --no-fund' : plan.map((u) => 'npm install ' + JSON.stringify(u.name + '@' + u.to) + ' --no-audit --no-fund').join(' && ');
  const r = await shell.execShell(cmd, { timeoutMs: 300000 });
  shell.audit('UPDATE ran (' + plan.length + ' pkg) -> exit ' + r.code);
  if (r.code !== 0) {
    await shell.execShell('cp ' + JSON.stringify(backupDir) + '/package.json ' + JSON.stringify(backupDir) + '/package-lock.json . && npm ci --no-audit --no-fund', { timeoutMs: 300000 });
    return ctx.reply('The update command failed; the backup was restored. Nothing changed.\n' + String(r.out || '').slice(-300));
  }
  const chk = await shell.execShell('npm ls ' + plan.slice(0, 3).map((u) => JSON.stringify(u.name)).join(' '), { timeoutMs: 60000 });
  if (chk.code !== 0) {
    await shell.execShell('cp ' + JSON.stringify(backupDir) + '/package.json ' + JSON.stringify(backupDir) + '/package-lock.json . && npm ci --no-audit --no-fund', { timeoutMs: 300000 });
    return ctx.reply('The updated packages failed a consistency check; the backup was restored. Nothing changed.');
  }
  const desc = updateAll ? plan.length + ' packages updated' : plan.map((u) => u.name + ' ' + u.from + '->' + u.to).join(', ');
  const { markPending } = await import('../utilities/updateguard.js');
  markPending({ desc, backupDir });
  shell.audit('UPDATE done, restarting for self-test: ' + desc);
  await ctx.reply('Updated ' + desc + '. Restarting Jarvis for the post-update self-test - back in about a minute. If the self-test fails, the backup is restored automatically.');
  try { const { shutdown } = await import('../connection/whatsapp.js'); setTimeout(() => shutdown(0), 3000); } catch (e) { logger.warn('[agent] restart failed: ' + (e?.message || 'error')); }
  return true;
}

// ---- Conversation memory (30 min) ---------------------------------------
const SESSION_FILE = path.join('data', 'agent-session.json');
function loadSession() {
  try {
    const s = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (Date.now() - s.ts < 30 * 60e3) return s;
  } catch { /* none */ }
  return null;
}
function saveSession(goal, summary) {
  try {
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ goal: String(goal).slice(0, 300), summary: String(summary).slice(0, 500), ts: Date.now() }));
  } catch { /* best effort */ }
}

// ---- Scheduled tasks ------------------------------------------------------
const SCHED_FILE = path.join('data', 'agent-schedules.json');
const schedJobs = new Map(); // id -> cron task
function loadSchedules() {
  try { return JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8')); } catch { return []; }
}
function saveSchedules(list) {
  try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(SCHED_FILE, JSON.stringify(list, null, 1)); } catch { /* best effort */ }
}
function ownerDM() {
  return String(config.ownerNumber).replace(/\D/g, '') + '@s.whatsapp.net';
}
function scheduleOne(entry) {
  if (!cron.validate(entry.cron)) return false;
  const task = cron.schedule(entry.cron, async () => {
    const s = getSock();
    if (!s) { logger.warn('[agent] schedule "' + entry.goal.slice(0, 40) + '" skipped: no live connection'); return; }
    shell.audit('SCHEDULE FIRED id=' + entry.id + ' goal="' + entry.goal.slice(0, 120) + '"');
    const ctx = {
      sock: s, jid: ownerDM(), sender: String(config.ownerNumber).replace(/\D/g, ''),
      senderJid: ownerDM(), isOwner: true, isGroup: false,
      msg: { key: { remoteJid: ownerDM(), fromMe: false, id: 'AGENTSCHED' + Date.now() }, message: { conversation: '/agent ' + entry.goal } },
      text: entry.goal, commands: registry,
      args: entry.goal.split(/\s+/),
      reply: (t, o) => s.sendMessage(ownerDM(), { text: t, ...(o || {}) }),
    };
    try { await runShellMode(ctx, entry.goal); }
    catch (e) { logger.warn('[agent] scheduled run failed: ' + (e?.message || 'error')); }
  });
  schedJobs.set(entry.id, task);
  return true;
}
function initSchedules() {
  for (const e of loadSchedules()) {
    try { scheduleOne(e); } catch { /* skip bad entry */ }
  }
  const n = schedJobs.size;
  if (n) logger.info('[agent] ' + n + ' scheduled task(s) armed');
}

// ---- Durable task registry (survives restarts) ----------------------------
const TASKS_FILE = path.join('data', 'agent-tasks.json');
function loadTasks() { try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); } catch { return []; } }
function saveTasks(list) {
  try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(TASKS_FILE, JSON.stringify(list.slice(-50), null, 1)); } catch { /* best effort */ }
}
function taskStart(goal) {
  const list = loadTasks();
  const t = { id: Math.random().toString(36).slice(2, 8), goal: String(goal).slice(0, 200), status: 'running', startedAt: Date.now(), resumeCount: 0 };
  list.push(t); saveTasks(list);
  return t.id;
}
function taskFinish(id, status, note) {
  const list = loadTasks();
  const t = list.find((x) => x.id === id);
  if (t) { t.status = status; t.finishedAt = Date.now(); t.note = String(note || '').slice(0, 200); saveTasks(list); }
}
// On boot: any task left 'running' was interrupted. Resume it once; if it is
// interrupted again, mark it abandoned and tell the owner what was left over.
function initTaskResume() {
  const stale = loadTasks().filter((t) => t.status === 'running');
  if (!stale.length) return;
  const timer = setInterval(async () => {
    const s = getSock();
    if (!s) return;
    clearInterval(timer);
    const list = loadTasks();
    const toResume = [], abandoned = [];
    for (const task of list.filter((x) => x.status === 'running')) {
      if ((task.resumeCount || 0) < 1) { task.resumeCount = (task.resumeCount || 0) + 1; toResume.push(task); }
      else { task.status = 'abandoned'; task.finishedAt = Date.now(); abandoned.push(task); }
    }
    saveTasks(list);
    const own = ownerDM();
    for (const task of abandoned) {
      shell.audit('TASK ABANDONED id=' + task.id + ' goal="' + task.goal.slice(0, 120) + '"');
      await s.sendMessage(own, { text: '⚠️ I could not finish a task even after retrying: "' + task.goal.slice(0, 120) + '". Ask me again if you still need it.' }).catch(() => {});
    }
    if (toResume.length) {
      shell.audit('TASK RESUME x' + toResume.length + ': ' + toResume.map((x) => x.goal.slice(0, 40)).join(' | '));
      await s.sendMessage(own, { text: '🔁 I was interrupted mid-work. Resuming ' + toResume.length + ' unfinished task(s) now:\n' + toResume.map((x) => '- ' + x.goal.slice(0, 80)).join('\n') }).catch(() => {});
      for (const task of toResume) {
        const ownNum = own.replace('@s.whatsapp.net', '');
        const ctx = {
          sock: s, jid: own, sender: ownNum, senderJid: own,
          isOwner: true, isGroup: false,
          msg: { key: { remoteJid: own, fromMe: false, id: 'AGENTRESUME' + Date.now() }, message: { conversation: '/agent ' + task.goal } },
          text: task.goal, commands: registry,
          args: task.goal.split(/\s+/),
          reply: (txt, o) => s.sendMessage(own, { text: txt, ...(o || {}) }),
        };
        try { await runShellMode(ctx, task.goal, task.id); }
        catch (e) { logger.warn('[agent] task resume failed: ' + (e?.message || 'error')); }
      }
    }
  }, 15000);
  timer.unref?.();
}

// ---- Health watch ---------------------------------------------------------
const HEARTBEAT = path.join('data', 'heartbeat');
let ramAlertedAt = 0;
function initHealthWatch() {
  let downSince = null;
  try {
    const prev = Number(fs.readFileSync(HEARTBEAT, 'utf8'));
    if (Date.now() - prev > 5 * 60e3) downSince = new Date(prev).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch { /* first ever boot */ }
  const beat = () => { try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(HEARTBEAT, String(Date.now())); } catch {} };
  beat();
  setInterval(beat, 120e3).unref?.();
  // wait for a live socket, then alert if we recovered from a gap; also watch RAM
  let bootAlertSent = false;
  setInterval(() => {
    const s = getSock();
    if (!s) return;
    if (downSince && !bootAlertSent) {
      bootAlertSent = true;
      shell.audit('HEALTH: was offline since ' + downSince + ', back now');
      s.sendMessage(ownerDM(), { text: '⚠️ I was offline since about ' + downSince + ' (IST). I am back now and everything is running.' }).catch(() => {});
    }
    const rss = process.memoryUsage().rss / 1048576;
    if (rss > 800 && Date.now() - ramAlertedAt > 6 * 3600e3) {
      ramAlertedAt = Date.now();
      shell.audit('HEALTH: RAM critical ' + Math.round(rss) + 'MB');
      s.sendMessage(ownerDM(), { text: '⚠️ Memory is critically high (' + Math.round(rss) + ' MB). If I slow down, say "/agent restart" or "/agent free memory".' }).catch(() => {});
    }
  }, 30e3).unref?.();
}

// boot-time arming (commands are imported at startup)
try { initSchedules(); } catch (e) { logger.warn('[agent] schedules init: ' + (e?.message || 'error')); }
try { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(path.join('data', 'agent-boot'), String(Date.now())); } catch { /* best effort */ }
try { initHealthWatch(); } catch (e) { logger.warn('[agent] health init: ' + (e?.message || 'error')); }
try { agentqueue.initAgentQueue(); } catch (e) { logger.warn('[agent] queue init: ' + (e?.message || 'error')); }
try { initTaskResume(); } catch (e) { logger.warn('[agent] task-resume init: ' + (e?.message || 'error')); }

async function planRound(goal, transcript, jarvisCmds) {
  const prev = transcript.length ? null : loadSession();
  // Previous-task context only when the new instruction clearly refers to it;
  // a fresh topic must never be hijacked by an old pending question.
  const FOLLOWUP_RE = /\b(that|those|them|same|again|undo|also|and then|aur|usme|usmein|usi|woh|wohi|iska|uska|the file|the folder|the song|the list)\b/i;
  const prevForContext = prev && FOLLOWUP_RE.test(goal) ? prev : null;
  const history = (transcript.length
    ? '\n\nWork already done and its output:\n' + transcript.join('\n---\n').slice(-2500) +
      '\n\nIf the goal is achieved and the results look right, reply [{"done":"one-line verification"}]. Otherwise plan ONLY the next steps needed (fix or adapt if something failed).'
    : '') + (prevForContext
    ? '\n\nPrevious task (only for the follow-up references above): goal was "' + prevForContext.goal + '"; outcome: ' + prevForContext.summary
    : '');
  try {
    const r = await askAi(
      'You are Jarvis, a WhatsApp bot operating your own Linux server (Node.js app; code in src/, data in data/, cwd is the app root).\n' +
      'Owner instruction: ' + goal + '\n\n' +
      'Carry it out step by step. Reply with ONLY a JSON array of at most ' + SH_STEPS + ' steps:\n' +
      '1. {"sh":"<one POSIX shell command run from the app root>"} - file work, code/config edits, disk/process checks, curl API lookups, npm, tar.\n' +
      '2. {"cmd":"<jarvis command name>","args":"<args>"} - run one of your own bot commands. Prefer this when a command fits. You may use ANY command, including owner and group-admin ones. Command index (Category(count): sample names; near-misses are auto-corrected): ' + jarvisCmds + '\n' +
      '3. {"bulk":{"cmd":"play","items":["<item>","<item>", ...]}} - bulk media delivery (2 or more items of the same kind; for large counts prefer ONE bulk step with all items). Each item is downloaded and delivered in this chat one by one, paced, with retries and its own progress. Use it for "download N songs/videos" goals: pick that artist\'s most popular tracks or the best matches yourself, matching the requested count exactly (for N items, produce N items).\n' +
      '4. {"send":{"to":"<phone digits only>","text":"<message>"}} - send a WhatsApp message from Jarvis\'s own number.\n' +
      '5. {"restart":true} - restart the bot (only when actually needed, e.g. after code edits).\n' +
      '6. Reviactyl panel control via shell curl (env vars REVIACTYL_PANEL_URL and REVIACTYL_CLIENT_KEY are set):\n' +
      '   - status/resources: curl -s -H "Authorization: Bearer $REVIACTYL_CLIENT_KEY" $REVIACTYL_PANEL_URL/api/client/servers/ccedcbbd/resources\n' +
      '   - list files: curl -s -H "Authorization: Bearer $REVIACTYL_CLIENT_KEY" "$REVIACTYL_PANEL_URL/api/client/servers/ccedcbbd/files/list?directory=/"\n' +
      '   - power: curl -s -X POST -H "Authorization: Bearer $REVIACTYL_CLIENT_KEY" -H "Content-Type: application/json" -d \'{"signal":"restart"}\' $REVIACTYL_PANEL_URL/api/client/servers/ccedcbbd/power\n' +
      '   Only ever use the "restart" signal - never "stop" or "kill", even if asked (they would take Jarvis fully offline). Prefer {"restart":true} for a normal bot restart.\n' +
      '7. {"schedule":{"cron":"<5-field cron>","goal":"<future instruction>"}} - set a recurring task (IST timezone). Use for "every night 2am" style requests.\n' +
      'Bias to ACTION: when a sensible default exists, pick it and act - deliver in this chat, choose the most popular or obvious picks, never ask about folders, sources, formats or counts.\n' +
      'People write short, vague, incomplete messages. Infer the most likely meaning from context and common sense, ACT on it, and mention the assumption in your reply (e.g. "Assuming you meant X..."). Asking is the LAST resort.\n' +
      'Reply [{"ask":"one short question"}] ONLY when even a best guess is impossible (e.g. a bare "download song" or a single word like "love" with zero clues). Before asking, double-check there is really no reasonable default.\n' +
      'Never guess phone numbers or recipients - only message the owner or a number explicitly given in the instruction.\n' +
      'Group-admin commands (kick, ban, promote, mute, tagall...) run in the group where the instruction was given, or the group explicitly named in it.\n' +
      'If the instruction contains a link (YouTube, Instagram, TikTok, X/Twitter, Facebook, Spotify...), do not ask questions: pick the matching downloader command (ytmp4/ytmp3/play/instagram/tiktok/twitter/facebook/spotify or whichever fits the domain) with the URL as its args, so the file lands in this chat. If the platform has no downloader or the content is private/DRM-protected, say plainly why it cannot be downloaded instead of asking. If the owner names a platform and a topic but gives no URL (e.g. "couple videos from pinterest"), find matching content yourself - use a suitable Jarvis search/download command, or an sh step with yt-dlp (it supports \'ytsearch5:<query>\' and many site URLs) - and deliver the best matches. Never ask the owner for URLs.\n' +
      'Rules: never read or print .env, auth/ session files, or anything containing keys/tokens/passwords. Never attack, spam, or spy on other people.\n' +
      'A missing or nonexistent Jarvis command is NEVER a reason to refuse: if no command fits and no sensible default exists, ask one short question instead. Refuse only requests that are unsafe, illegal, or violate someone\'s privacy. If the request is impossible or unsafe, reply [{"refuse":"short reason"}].\n' +
      'If a step failed earlier, adapt - different args or a different command - never repeat a failed step verbatim.\n' +
      'Accuracy: report numbers in EXACTLY the units the owner asked for and convert carefully (1 byte = 8 bits, 1 MB = 8 megabits, 1 MiB = 8.3886 megabits); re-check the math before answering. The panel /resources "uptime" is the SERVER uptime, not the bot\'s - for bot uptime read data/agent-boot (epoch ms of the last bot start) and always label which uptime you mean.\n' +
      'Judge every instruction on its OWN intent - never answer a previous task\'s pending question when the instruction is a new topic.\n' +
      'Examples:\n' +
      '- "love" -> [{"ask":"Love what - a love quote, a romantic song, shayari?"}]\n' +
      '- If the request says "video" ("video song", "video songs", "videos", "mp4"), use the video command (MP4), not play. Use play only when the request asks for audio/mp3/songs without the word video.\n' +
    '- "download arijit singh love songs" -> [{"bulk":{"cmd":"play","items":["Tum Hi Ho","Channa Mereya","Agar Tum Saath Ho","Raabta","Ae Dil Hai Mushkil"]}}]\n' +
      '- "download 100 couple kissing videos from pinterest" -> [{"bulk":{"cmd":"pinterest","items":["couple kissing video","romantic couple kissing video","couple kissing hd video", ...]}}] - for pinterest VIDEO requests, end every item query with the word "video" (the downloader detects it); never use "album" for videos, albums are images.\n' +
    '- "download 20 couple memes from pinterest" -> [{"bulk":{"cmd":"pinterest","items":["album couple meme","album funny couple meme","album couple meme hindi","album cute couple meme","album couple meme quotes","album desi couple meme","album couple meme love"]}}] - for Pinterest use "album <query>" args (3 pins each) and vary the queries to reach the count.\n' +
      '- "how much ram is free" -> [{"sh":"free -m"}]\n' +
      '- "every night 2am cleanup" -> [{"schedule":{"cron":"0 2 * * *","goal":"clean old logs and temp files"}}]\n' +
      'For a single "download/play a song" goal, use one play command step. No other text.' + history,
      { allowKeyless: true, temperature: 0.1, prefer: 'groq' });
    const parsed = parseShellPlan(r?.text || r);
    if (!parsed) logger.warn('[agent] plan parse failed, raw: ' + String(r?.text || r || '').replace(/\s+/g, ' ').slice(0, 400));
    return parsed;
  } catch (e) {
    logger.warn('[agent] planner failed: ' + (e?.message || 'error'));
    return null;
  }
}

async function execStep(ctx, step, results) {
  if (step.type === 'note') { results.push({ cmd: 'note', code: 0, out: step.text }); return; }
  if (step.type === 'schedule') {
    const list = loadSchedules();
    const entry = { id: Math.random().toString(36).slice(2, 8), cron: step.cron, goal: step.goal, createdAt: Date.now() };
    if (scheduleOne(entry)) {
      list.push(entry); saveSchedules(list);
      shell.audit('SCHEDULE SET id=' + entry.id + ' cron="' + entry.cron + '" goal="' + entry.goal + '"');
      results.push({ cmd: 'schedule "' + step.goal.slice(0, 60) + '"', code: 0, out: 'Scheduled: ' + step.cron + ' (IST). It will run and report here. To cancel, say "/agent unschedule ' + entry.id + '".' });
    } else {
      results.push({ cmd: 'schedule', code: 1, out: 'Invalid cron "' + step.cron + '"' });
    }
    return;
  }
  if (step.type === 'send') {
    try {
      await ctx.sock.sendMessage(step.to + '@s.whatsapp.net', { text: step.text });
      logger.info('[agent] sent WhatsApp message to ' + step.to + ' (' + step.text.length + ' chars)');
      shell.audit('SEND to=' + step.to + ' text="' + step.text.slice(0, 200) + '"');
      results.push({ cmd: 'send message to ' + step.to, code: 0, out: 'Delivered: "' + step.text.slice(0, 120) + '"' });
    } catch (e) {
      results.push({ cmd: 'send message to ' + step.to, code: 1, out: 'Failed: ' + (e?.message || 'error') });
    }
    return;
  }
  if (step.type === 'bulk') {
    try {
      agentqueue.enqueue(ctx.jid, step.items.map((a) => ({ cmd: step.cmd, args: a })), ctx.__goal || 'bulk download');
      results.push({ cmd: 'bulk /' + step.cmd + ' x' + step.items.length, code: 0, out: 'Queued ' + step.items.length + ' downloads via /' + step.cmd + '. Sending them to this chat one by one, each with retries - watch the separate progress message. Say "/agent retry" later to redo any that fail.' });
    } catch (e) {
      results.push({ cmd: 'bulk /' + step.cmd, code: 1, out: 'Failed to queue: ' + (e?.message || 'error') });
    }
    return;
  }
  if (step.type === 'cmd') {
    const cmd = registry.get(step.cmd);
    const cap = [];
    try {
      await cmd.run({ ...ctx, args: step.args ? step.args.split(/\s+/) : [], reply: async (t) => { cap.push(String(t).slice(0, 500)); return null; } });
      logger.info('[agent] ran /' + step.cmd + ' ' + step.args);
      shell.audit('CMD /' + step.cmd + ' ' + step.args);
      results.push({ cmd: '/' + step.cmd + (step.args ? ' ' + step.args : ''), code: 0, out: cap.join('\n').slice(0, 1500) || 'Done.' });
    } catch (e) {
      results.push({ cmd: '/' + step.cmd, code: 1, out: 'Failed: ' + (e?.message || 'error') });
    }
    return;
  }
  const r = await shell.execShell(step.sh);
  logger.info('[agent] shell: ' + step.sh.slice(0, 80) + ' -> ' + r.code);
  shell.audit('SHELL ' + step.sh + ' -> exit ' + r.code);
  results.push({ cmd: step.sh, ...r });
}

async function runUndo(ctx) {
  let files = [];
  try { files = fs.readdirSync('data').filter((f) => /^ops-backup-.*\.tar\.gz$/.test(f)).sort(); } catch {}
  if (!files.length) return ctx.reply('No backup found to undo to. Nothing has been changed through me yet.');
  const newest = 'data/' + files[files.length - 1];
  const preview = await shell.execShell('tar tzf ' + JSON.stringify(newest) + ' | head -15');
  shell.stage(['tar -xzf ' + JSON.stringify(newest)]);
  shell.audit('UNDO STAGED restore=' + newest);
  await ctx.reply('↩️ Undo: I will restore everything from backup ' + files[files.length - 1] + '. It contains:\n' + (preview.out || '(listing failed)') +
    '\nReply YES within 5 minutes to restore, or NO to cancel.');
}

async function runUnschedule(ctx, id) {
  const list = loadSchedules();
  const found = list.find((e) => e.id === id);
  if (!found) return ctx.reply('No scheduled task with id "' + id + '". Say "/agent schedules" to see them.');
  const task = schedJobs.get(id); if (task) { try { task.stop(); } catch {} schedJobs.delete(id); }
  saveSchedules(list.filter((e) => e.id !== id));
  shell.audit('UNSCHEDULE id=' + id + ' goal="' + found.goal.slice(0, 80) + '"');
  await ctx.reply('Removed the scheduled task "' + found.goal.slice(0, 80) + '" (' + found.cron + '). It will not run again.');
}

async function runListSchedules(ctx) {
  const list = loadSchedules();
  if (!list.length) return ctx.reply('No scheduled tasks set. Example: "/agent every night at 2am clean old logs".');
  await ctx.reply('Scheduled tasks:\n' + list.map((e) => '- [' + e.id + '] "' + e.goal.slice(0, 60) + '" at ' + e.cron + ' (IST)').join('\n'));
}

async function runShellMode(ctx, goal, taskId) {
  // Raw output on request
  if (/^(raw|raw output|exact output)$/i.test(goal)) {
    if (lastRaw && Date.now() - lastRaw.ts < 600e3) return ctx.reply('Exact output:\n' + lastRaw.text.slice(0, 3500));
    return ctx.reply('No recent output to show. Run something first.');
  }
  const tid = taskId || taskStart(goal);
  try {
    return await runShellModeBody(ctx, goal, tid);
  } catch (e) {
    taskFinish(tid, 'failed', e?.message || 'error');
    logger.warn('[agent] task crashed: ' + (e?.stack || e?.message || 'error'));
    return ctx.reply('That task hit an internal error: ' + (e?.message || 'error') + '. Nothing was left half-applied.');
  }
}

async function runShellModeBody(ctx, goal, tid) {
  ctx.__goal = goal;
  const prog = createProgressMessage(ctx, 'task', 20000);
  await prog.begin();
  const tick = setInterval(() => { try { prog.update({}); } catch {} }, 20000); tick.unref?.();
  const live = null; // the progress message owns the chat message now
  // Full registry, compact: every category with counts + sample names; names are fuzzy-resolved on use.
  const byCat = new Map();
  for (const c of registry.list()) {
    const k = c.category || 'Misc';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(c.name);
  }
  const jarvisCmds = [...byCat.entries()].sort().map(([k, v]) => k + '(' + v.length + '): ' + v.slice(0, 10).join(' ')).join('; ');
  const transcript = [], results = [];
  const stagedShells = [];
  let restartsPlanned = 0, finalNote = null, executed = 0;

  const goalNumbers = (goal.match(/\+?[0-9][0-9\s-]{6,16}[0-9]/g) || []).map((s) => s.replace(/\D/g, ''));
  const ownNumber = String(config.ownerNumber).replace(/\D/g, '');
  for (let round = 1; round <= 10 && executed < SH_EXEC_CAP; round++) {
    let plan = null;
    try {
      plan = await planRound(goal, transcript, jarvisCmds);
    } catch (e) {
      logger.warn('[agent] round ' + round + ' crashed: ' + (e?.stack || e?.message || 'error'));
      if (round === 1) finalNote = 'Something went wrong while planning. Try again in a moment.';
      break;
    }
    if (!plan && round === 1) {
      await new Promise((r) => setTimeout(r, 15000));
      try { plan = await planRound(goal, transcript, jarvisCmds); } catch { plan = null; }
    }
    if (!plan) { if (round === 1) finalNote = 'I could not plan that safely. Try rephrasing the instruction.'; break; }
    if (plan.refuse) { finalNote = 'I can\'t do that: ' + plan.refuse; break; }
    if (plan.ask) { finalNote = plan.ask; break; }
    if (plan.done) { logger.info('[agent] verified: ' + plan.done); break; }

    const runnable = [];
    let blocked = null;
    const goalWantsVideo = /\bvideos?\b|\bmp4\b/i.test(goal) && !/\b(audio|mp3)\b/i.test(goal);
    for (const step of plan.steps) {
      if (step.type === 'restart') { restartsPlanned++; continue; }
      if (step.type === 'send') {
        if (step.to !== ownNumber && !goalNumbers.includes(step.to)) {
          runnable.push({ type: 'note', text: 'Skipped a message to ' + step.to + ' - I only message you, or a number you explicitly gave in the instruction.' });
          continue;
        }
        runnable.push(step); continue;
      }
      if (step.type === 'cmd') {
        const found = resolveCmd(step.cmd);
        if (!found) runnable.push({ type: 'note', text: 'The /' + step.cmd + ' command is not available, so that part was skipped.' });
        else {
          let name = found.name;
          if (name === 'play' && goalWantsVideo && resolveCmd('video')) name = 'video';
          runnable.push({ type: 'cmd', cmd: name, args: step.args });
        }
        continue;
      }
      if (step.type === 'bulk') {
        const found = resolveCmd(step.cmd);
        if (!found) runnable.push({ type: 'note', text: 'The /' + step.cmd + ' command is not available, so the bulk download was skipped.' });
        else {
          let name = found.name;
          if (name === 'play' && goalWantsVideo && resolveCmd('video')) name = 'video';
          runnable.push({ type: 'bulk', cmd: name, items: step.items });
        }
        continue;
      }
      if (/npm\s+run\s+start|node\s+(\.\/)?(src\/)?index\.js/.test(step.sh)) {
        runnable.push({ type: 'note', text: 'Skipped starting a second Jarvis process - it is already running. Use a restart step instead.' });
        continue;
      }
      if (/\/power\b/.test(step.sh) && /"signal"\s*:\s*"(stop|kill)"/.test(step.sh)) {
        runnable.push({ type: 'note', text: 'Refused: stopping or killing the server would take Jarvis fully offline - only restart is allowed.' });
        continue;
      }
      const cls = shell.classify(step.sh);
      if (cls === 'secret') { blocked = 'Stopped: one step would read secrets (.env/auth/keys). I never print those. Rephrase without touching secret files.'; break; }
      if (cls === 'refused') { blocked = 'I refuse that - it looks like an attack or privacy violation.'; break; }
      (cls === 'destructive' ? stagedShells : runnable).push(step);
    }
    if (blocked) { finalNote = blocked; break; }

    if (!runnable.length) {
      if (stagedShells.length || restartsPlanned) break; // staged or finishing with a restart
      if (round === 1) finalNote = 'Nothing to run for that.';
      break;
    }
    let si = 0;
    for (const step of runnable) {
      si++;
      const label = step.type === 'cmd' ? '/' + step.cmd : step.type === 'bulk' ? 'queue bulk /' + step.cmd + ' x' + step.items.length : step.type === 'send' ? 'send message' : step.type === 'schedule' ? 'set schedule' : step.type === 'note' ? 'note' : String(step.sh || '').slice(0, 60);
      try { prog.update({ name: 'Step ' + (executed + 1) + ': ' + label, received: executed, total: executed + (runnable.length - si + 1) }); } catch {}
      try {
        await execStep(ctx, step, results);
      } catch (e) {
        logger.warn('[agent] step crashed: ' + (e?.stack || e?.message || 'error'));
        results.push({ cmd: step.sh || step.cmd || step.type, code: 1, out: 'Step failed internally: ' + (e?.message || 'error') });
      }
      executed++;
      transcript.push(results[results.length - 1].cmd + ' -> exit ' + results[results.length - 1].code + '\n' + results[results.length - 1].out);
    }
    if (stagedShells.length || restartsPlanned) break; // confirm/restart before continuing
  }

  if (results.length) {
    lastRaw = { ts: Date.now(), text: results.map((r) => '$ ' + r.cmd + ' (exit ' + r.code + ')\n' + r.out).join('\n---\n') };
  }
  const rawForAi = results.map((r) => r.cmd + ' -> exit ' + r.code + (r.out ? '\n' + r.out : '')).join('\n');
  const bulkOnly = results.length > 0 && results.every((r) => r.code === 0 && /^bulk \//.test(r.cmd));
  if (stagedShells.length && !finalNote) finalNote = '';
  let text = finalNote || (bulkOnly ? results.map((r) => r.out).join('\n')
    : (results.length ? ((await summarize(rawForAi)) || fallbackSummary(results)) : 'Nothing to run for that.'));

  if (stagedShells.length && (stagedShells.some((s) => s.sh) || restartsPlanned > 0) && !(results.length === 0 && stagedShells.length === 0)) {
    const stagedCmds = stagedShells.map((s) => s.sh);
    shell.stage(stagedCmds, { restarts: restartsPlanned });
    shell.audit('STAGED shells=' + JSON.stringify(stagedCmds).slice(0, 300) + ' restarts=' + restartsPlanned);
    const info = shell.describeTargets(stagedCmds);
    const parts = [];
    parts.push(info.count > 0
      ? 'change/delete ' + info.count + ' item(s) on the server' + (info.bytes ? ' (about ' + fmtMB(info.bytes) + ')' : '')
      : 'make a system-level change (e.g. stopping a process)');
    if (restartsPlanned) parts.push('restart me (back in about a minute)');
    restartsPlanned = 0; // the restart now rides on the YES confirmation
    text += (text ? '\n\n' : '') + '⚠️ This will ' + parts.join(' and ') +
      '. A backup is taken automatically before anything runs.\nReply YES within 5 minutes to go ahead, or NO to cancel.';
  }
  clearInterval(tick);
  try { await prog.text(text); } catch { await ctx.reply(text); }
  saveSession(goal, text);
  taskFinish(tid, 'done', text.slice(0, 150));
  if (restartsPlanned) {
    shell.audit('AUTO RESTART after goal="' + goal.slice(0, 120) + '"');
    await ctx.reply('Restarting Jarvis now - back in about a minute.').catch(() => {});
    try {
      const { shutdown } = await import('../connection/whatsapp.js');
      setTimeout(() => shutdown(0), 3000);
    } catch (e) { logger.warn('[agent] restart failed: ' + (e?.message || 'error')); }
  }
}

async function runSafeMode(ctx, goal) {
  const live = await ctx.reply('🤖 Planning...').catch(() => null);
  const available = registry.list().map((c) => c.name).sort().slice(0, 80).join(', ');
  let plan = null;
  try {
    const r = await askAi(
      'Goal: ' + goal + '\n\n' +
      'You may plan at most ' + MAX_STEPS + ' steps using ONLY these commands: ' + SAFE.join(', ') + '.\n' +
      'Reply with ONLY a JSON array like [{"cmd":"weather","args":"Kolkata"}].\n' +
      'If the goal cannot be done with those commands, reply with a single step [{"answer":"one or two sentences that clearly say what you can and cannot do"}]. ' +
      'For Jarvis capabilities, these commands exist: ' + available + ' - mention the relevant ones by name in the answer. Never invent shell commands.\nNo other text.',
      { allowKeyless: true, temperature: 0.1 });
    plan = parsePlan(r?.text || r);
  } catch (e) { logger.warn('[agent] planner failed: ' + (e?.message || 'error')); }
  if (!plan) {
    return editOrReply(ctx, live, 'I could not make a safe plan for that. Try a simpler goal, or run the commands yourself (weather, news, ask, define, translate, wiki, time, stock, quote, lyrics).');
  }
  const answerStep = plan.find((s) => s.answer);
  if (answerStep) return editOrReply(ctx, live, answerStep.answer);
  const names = plan.map((s) => s.cmd + (s.args ? ' ' + s.args : ''));
  if (live?.key) { try { await ctx.sock.sendMessage(ctx.jid, { text: '🤖 Plan (' + plan.length + ' steps):\n' + names.map((n, i) => (i + 1) + '. /' + n).join('\n') + '\n\nRunning...', edit: live.key }); } catch {} }
  for (const step of plan) {
    if (step.answer) continue;
    const cmd = registry.get(step.cmd);
    if (!cmd) { await ctx.reply('Step skipped: /' + step.cmd + ' is unavailable right now.'); continue; }
    try {
      await cmd.run({ ...ctx, args: step.args ? step.args.split(/\s+/) : [] });
    } catch (e) {
      logger.warn('[agent] step ' + step.cmd + ' failed: ' + (e?.message || 'error'));
      await ctx.reply('Step /' + step.cmd + ' failed. Moving on.');
    }
  }
  await ctx.reply('🤖 Done - ' + plan.length + ' step(s) finished.');
}

export default {
  name: 'agent',
  aliases: ['do', 'plan'],
  category: 'AI',
  description: 'Give Jarvis a goal - it plans and runs a few safe steps itself',
  usage: 'agent <goal, e.g. "weather in Kolkata and top 3 news headlines">',
  async run(ctx) {
    if (!featOn('agent')) return ctx.reply('Agent mode is turned off right now.');
    const goal = ctx.args.join(' ').trim().slice(0, MAX_GOAL);
    if (!goal) return ctx.reply('Tell me the goal. Example: ' + config.prefix + 'agent weather in Kolkata and today\'s top news');
    // "/agent yes" and "/agent no" answer a pending destructive confirmation
    if (/^(yes|no)$/i.test(goal) && featOn('ownershell')) {
      if (await handlePendingAnswer(ctx, /^yes$/i.test(goal))) return;
    }
    if (featOn('ownershell') && shell.isVerifiedOwnerDM(ctx)) {
      if (/^retry\b/i.test(goal)) {
        const n = agentqueue.retryFailed();
        return ctx.reply(n ? '🔁 Retrying the ' + n + ' failed download(s) - one by one, as before.' : 'Nothing failed recently to retry.');
      }
      if (/^undo\b/i.test(goal)) return runUndo(ctx);
      const um = goal.match(/^unschedule\s+(\w+)$/i);
      if (um) return runUnschedule(ctx, um[1]);
      if (/^(schedules|list schedules)$/i.test(goal)) return runListSchedules(ctx);
    }
    if (!ctx.isOwner && !allow(ctx.sender, 3)) return ctx.reply('Agent mode is taking a breather. Try again in a little while.');
    if (featOn('ownershell') && shell.isVerifiedOwnerDM(ctx)) {
      if (/^\s*install\b/i.test(goal) || parseInstallGoal(goal)) return runInstallFlow(ctx, goal);
      if (/^\s*update\b/i.test(goal)) return runUpdateFlow(ctx, goal);
      if (isInfoQuestion(goal)) return runInfoAnswer(ctx, goal);
      if (isJunkCleanupGoal(goal)) return runJunkCleanup(ctx);
      if (isCancelDownloadGoal(goal)) {
        const r = agentqueue.cancelQueue();
        if (!r.cancelled && !r.active) return ctx.reply('No download queue is running right now.');
        return ctx.reply('🛑 Cancelled the download queue: ' + r.cancelled + ' pending item(s) cancelled.' +
          (r.active ? ' The file downloading right now will finish, then everything stops.' : ''));
      }
      return runShellMode(ctx, goal);
    }
    return runSafeMode(ctx, goal);
  },
};
