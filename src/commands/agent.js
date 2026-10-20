// Agent Mode: give Jarvis a goal, it plans a few steps and runs them.
// - Everyone (SAFE mode): read-only whitelist commands only. Out-of-scope goals
//   get a clear answer, never generic shell dumps.
// - Verified owner DM (shell mode, flag 'ownershell'): full-access shell planner.
//   Safe commands run right away; destructive ones are staged and need a literal
//   one-word YES within 5 min (auto backup first). Secrets are never printed and
//   attacks/privacy violations are refused.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { askAi } from '../ai/providers.js';
import { registry } from '../handlers/commandHandler.js';
import * as shell from '../utilities/ownershell.js';

const SAFE = ['weather', 'news', 'ask', 'define', 'translate', 'wiki', 'time', 'stock', 'quote', 'lyrics'];
const MAX_STEPS = 5, MAX_GOAL = 300, MAX_ARG = 120, SH_STEPS = 6;

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
      const sh = String(s?.sh || '').trim();
      if (!sh || sh.length > 300 || /\r|\n/.test(sh)) return null;
      steps.push(sh);
    }
    return steps.length ? { steps } : null;
  } catch { return null; }
}

async function editOrReply(ctx, live, text) {
  if (live?.key) { try { return void await ctx.sock.sendMessage(ctx.jid, { text, edit: live.key }); } catch {} }
  return ctx.reply(text);
}

async function runShellMode(ctx, goal) {
  const live = await ctx.reply('🤖 Working on it...').catch(() => null);
  let plan = null;
  try {
    const r = await askAi(
      'You are Jarvis operating your own Linux server (Node.js WhatsApp bot app; code in src/, data in data/, cwd is the app root).\n' +
      'Owner instruction: ' + goal + '\n\n' +
      'Break it into at most ' + SH_STEPS + ' POSIX shell commands run from the app root. Prefer simple standard tools (ls, du, df, find, ps, free, cat of non-secret files, tar, npm).\n' +
      'Rules: never read or print .env, auth/ session files, or anything containing keys/tokens/passwords. Never attack or spy on other people.\n' +
      'Reply with ONLY a JSON array like [{"sh":"ls -la data"}]. If the request is impossible or unsafe, reply [{"refuse":"short reason"}]. No other text.',
      { allowKeyless: true, temperature: 0.1 });
    plan = parseShellPlan(r?.text || r);
  } catch (e) { logger.warn('[agent] shell planner failed: ' + (e?.message || 'error')); }
  if (!plan) return editOrReply(ctx, live, 'I could not plan that safely. Try rephrasing the instruction.');
  if (plan.refuse) return editOrReply(ctx, live, 'I can\'t do that: ' + plan.refuse);

  const runnable = [], staged = [];
  for (const sh of plan.steps) {
    const cls = shell.classify(sh);
    if (cls === 'secret') return editOrReply(ctx, live, 'Stopped: one step would read secrets (.env/auth/keys). I never print those. Rephrase without touching secret files.');
    if (cls === 'refused') return editOrReply(ctx, live, 'I refuse that - it looks like an attack or privacy violation.');
    (cls === 'destructive' ? staged : runnable).push(sh);
  }

  const lines = [];
  for (const sh of runnable) {
    const r = await shell.execShell(sh);
    logger.info('[agent] shell: ' + sh.slice(0, 80) + ' -> ' + r.code);
    lines.push('`$ ' + sh.slice(0, 90) + '`' + (r.code ? ' (exit ' + r.code + ')' : '') + (r.out ? '\n' + r.out : ''));
  }
  let text = lines.join('\n---\n') || '';
  if (staged.length) {
    shell.stage(staged);
    text += (text ? '\n\n' : '') + '⚠️ These need confirmation (a backup will be taken first):\n' +
      staged.map((s, i) => (i + 1) + '. `$ ' + s.slice(0, 90) + '`').join('\n') +
      '\n\nReply YES within 5 minutes to run them, or NO to cancel.';
  }
  await editOrReply(ctx, live, text || 'Nothing to run.');
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
    if (!allow(ctx.sender, ctx.isOwner ? 10 : 3)) return ctx.reply('Agent mode is taking a breather. Try again in a little while.');
    if (featOn('ownershell') && shell.isVerifiedOwnerDM(ctx)) return runShellMode(ctx, goal);
    return runSafeMode(ctx, goal);
  },
};
