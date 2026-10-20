// P1 Agent Mode: give Jarvis a goal, it plans a few safe steps and runs them.
// Steps are limited to a whitelist of read-only commands - it can never download,
// delete, spend, post elsewhere, or touch group/admin actions.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';
import { askAi } from '../ai/providers.js';
import { registry } from '../handlers/commandHandler.js';

const SAFE = ['weather', 'news', 'ask', 'define', 'translate', 'wiki', 'time', 'stock', 'quote', 'lyrics'];
const MAX_STEPS = 5, MAX_GOAL = 300, MAX_ARG = 120;

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
    if (!Array.isArray(arr)) return null;
    const steps = [];
    for (const s of arr.slice(0, MAX_STEPS)) {
      const cmd = String(s?.cmd || '').toLowerCase().replace(/[^a-z]/g, '');
      const args = String(s?.args || '').slice(0, MAX_ARG).replace(/[\r\n]/g, ' ').trim();
      if (!SAFE.includes(cmd)) return null; // any unsafe/unknown step rejects the whole plan
      steps.push({ cmd, args });
    }
    return steps.length ? steps : null;
  } catch { return null; }
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
    const live = await ctx.reply('🤖 Planning...').catch(() => null);
    let plan = null;
    try {
      const r = await askAi(
        'Goal: ' + goal + '\n\nBreak this goal into at most ' + MAX_STEPS + ' steps using ONLY these commands: ' + SAFE.join(', ') + '.\nReply with ONLY a JSON array like [{"cmd":"weather","args":"Kolkata"}]. No other text.',
        { allowKeyless: true, temperature: 0.1 });
      plan = parsePlan(r?.text || r);
    } catch (e) { logger.warn('[agent] planner failed: ' + (e?.message || 'error')); }
    if (!plan) {
      const msg = 'I could not make a safe plan for that. Try a simpler goal, or run the commands yourself (weather, news, ask, define, translate, wiki, time, stock, quote, lyrics).';
      if (live?.key) { try { return void await ctx.sock.sendMessage(ctx.jid, { text: msg, edit: live.key }); } catch {} }
      return ctx.reply(msg);
    }
    const names = plan.map((s) => s.cmd + (s.args ? ' ' + s.args : ''));
    if (live?.key) { try { await ctx.sock.sendMessage(ctx.jid, { text: '🤖 Plan (' + plan.length + ' steps):\n' + names.map((n, i) => (i + 1) + '. /' + n).join('\n') + '\n\nRunning...', edit: live.key }); } catch {} }
    for (const step of plan) {
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
  },
};
