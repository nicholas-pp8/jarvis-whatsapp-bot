import config from '../config/config.js';
import { downloadQueue } from '../utils/downloader.js';
import { formatBytes, formatDuration } from '../utils/helpers.js';
import { snapshot, istFull, ist } from '../utils/botstats.js';

const SC = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', y: 'ʏ', z: 'ᴢ' };
const sc = (t) => String(t).toLowerCase().replace(/[a-z]/g, (ch) => SC[ch] || ch);
const LINE = '━━━━━━━━━━━━━━━━━━';

function table(rows) {
  const w = Math.max(...rows.map((r) => r[0].length)) + 2;
  return ['```', ...rows.map(([a, b]) => `${a.padEnd(w)}${b}`), '```'];
}

export default {
  name: 'status',
  category: 'WhatsApp',
  description: 'Show bot status: uptime, memory, usage and more',
  usage: 'status',
  async run(ctx) {
    const s = await snapshot(ctx.commands);
    const q = downloadQueue.stats;
    const p = config.prefix;
    const state = s.wa === 'online' ? 'ᴏɴʟɪɴᴇ' : s.wa === 'offline' ? 'ᴏꜰꜰʟɪɴᴇ' : 'ꜱᴛᴀʀᴛɪɴɢ';
    const lines = [`*${sc(s.botName)} ${sc('status')}*`, sc('live bot report'), LINE, ''];
    lines.push(sc('general'), ...table([
      [sc('state'), state],
      [sc('time ist'), sc(istFull(s.now))],
      [sc('uptime'), sc(formatDuration(s.uptimeSec))],
      [sc('plugins'), String(s.plugins)],
    ]), '');
    lines.push(sc('server'), ...table([
      [sc('ram'), `${formatBytes(s.ramUsed)} / ${formatBytes(s.ramLimit)}`],
      [sc('cpu'), `${s.cpuPct}%`],
      [sc('disk free'), s.diskFree == null ? '-' : formatBytes(s.diskFree)],
      [sc('queue'), `${q.running} / ${q.waiting}`],
    ]), '');
    const top = s.usage.slice(0, 8);
    lines.push(sc('usage'), ...table([
      [sc('total'), String(s.totalCommands)],
      ...top.map(([n, c]) => [`${p}${sc(n)}`, String(c)]),
    ]), '');
    if (s.recent.length) {
      lines.push(sc('recent'), ...table(s.recent.map((r) => [ist(r.at), `${p}${sc(r.name)}`])), '');
    }
    lines.push(LINE, sc(`downloads ${s.downloads}  failed ${s.failures}`));
    await ctx.reply(lines.join('\n'));
  },
};
