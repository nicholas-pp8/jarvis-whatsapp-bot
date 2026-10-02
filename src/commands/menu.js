import {usage} from '../ops/index.js';
import config from '../config/config.js';
import { snapshot, istFull } from '../utils/botstats.js';
import { formatBytes, formatDuration } from '../utils/helpers.js';

const SECTIONS = [
  { cat: 'General', title: 'GENERAL' },
  { cat: 'Downloaders', title: 'DOWNLOADERS' },
  { cat: 'Image', title: 'IMAGE' },
  { cat: 'AI', title: 'AI' },
  { cat: 'Group', title: 'GROUP' },
  { cat: 'Recover', title: 'RECOVER' },
  { cat: 'WhatsApp', title: 'BOT' },
];
const SHORT = {
  menu: 'all commands',
  help: 'how to use',
  ping: 'speed check',
  video: 'video (MP4)',
  play: 'audio',
  pinterest: 'image/video',
  ask: 'ask any ai',
  sticker: 'image to sticker',
  toimg: 'sticker to image',
  resize: 'change width',
  compress: 'smaller file',
  convert: 'png jpg webp',
  status: 'uptime and stats',
  groupinfo: 'group details', grouplink: 'invite link', revoke: 'reset link', add: 'add by number', remove: 'remove member', promote: 'make admin', demote: 'remove admin',
  tagall: 'mention all', warn: 'warn member', warnings: 'view warnings', resetwarn: 'clear warnings', antilink: 'block links', antispam: 'block repeats', antiflood: 'slow floods',
  welcome: 'welcome msg', goodbye: 'goodbye msg', blockword: 'word filter', rules: 'group rules', setrules: 'set rules', groupstats: 'activity stats', groupconfig: 'group settings',
  statusdl: 'save statuses', antidelete: 'deleted msgs', deleted: 'deleted list', vv: 'view-once photo', vvn: 'view-once voice', getpp: 'profile picture',
  tts: 'text to voice', ttsvoices: 'voice list',
  announce: 'announcement', schedule: 'daily message', mute: 'admins only chat', unmute: 'open chat', botadmin: 'bot admins',
};
const ORDER = ['menu', 'help', 'ping', 'play', 'video', 'pinterest', 'sticker', 'toimg', 'resize', 'compress', 'convert', 'ask', 'status'];
const SC = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', y: 'ʏ', z: 'ᴢ' };
const sc = (t) => String(t).toLowerCase().replace(/[a-z]/g, (ch) => SC[ch] || ch);
const LINE = '━━━━━━━━━━━━━━━━━━';

export default {
  name: 'menu',
  aliases: ['start', 'commands'],
  category: 'General',
  description: 'Show all commands',
  usage: 'menu',
  async run(ctx) {
    const p = config.prefix;
    const all = ctx.commands.list().filter((c) => !c.hidden && (!c.ownerOnly||ctx.isOwner));
    const rank = (c) => (ORDER.indexOf(c.name) === -1 ? 99 : ORDER.indexOf(c.name));
    const known = new Set(SECTIONS.map((s) => s.cat));
    const sections = [...SECTIONS];
    for (const c of all) {
      if (!known.has(c.category)) {
        known.add(c.category);
        sections.push({ cat: c.category, title: String(c.category).toUpperCase() });
      }
    }
    const lines = [`*${sc(config.botName)} ${sc('menu')}*`, sc('whatsapp assistant'), LINE, ''];
    if(ctx.isOwner&&!ctx.isGroup){const favorites=usage.summary().owner.filter(([n])=>!['menu','help','status'].includes(n)).slice(0,4);if(favorites.length)lines.push(sc('favorites'),favorites.map(([n])=>p+sc(n)).join('  '),'');}
    try {
      const s = await snapshot(ctx.commands);
      const top = s.usage.slice(0, 4).map(([n, c]) => `${p}${sc(n)} ${c}`).join('  ') || '-';
      const rows = [
        [sc('time'), sc(istFull(s.now))],
        [sc('uptime'), sc(formatDuration(s.uptimeSec))],
        [sc('ram'), `${formatBytes(s.ramUsed)} / ${formatBytes(s.ramLimit)}`],
        [sc('cpu'), `${s.cpuPct}%`],
        [sc('plugins'), String(s.plugins)],
        [sc('used'), `${s.totalCommands} ${sc('commands')}`],
        [sc('top'), top],
      ];
      const w0 = Math.max(...rows.map((r) => r[0].length)) + 2;
      lines.push(sc('live'), '```', ...rows.map(([a, b]) => `${a.padEnd(w0)}${b}`), '```', '');
    } catch { /* stats are optional */ }
    for (const s of sections) {
      const cmds = all.filter((c) => c.category === s.cat).sort((a, b) => rank(a) - rank(b));
      if (!cmds.length) continue;
      const rows = cmds.map((c) => {
        return [`${p}${sc(c.name)}`, sc(SHORT[c.name] || c.description)];
      });
      const w = Math.max(...rows.map((r) => r[0].length)) + 2;
      lines.push(sc(s.title), '```', ...rows.map(([a, b]) => `${a.padEnd(w)}${b}`), '```', '');
    }
    lines.push(LINE, sc(`type ${p}help for a quick guide`));
    await ctx.reply(lines.join('\n'));
  },
};
