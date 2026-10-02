// Group management commands. Each one is exported by name and wrapped by a thin file in src/commands/.
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { store, settings, DEFAULTS } from './store.js';
import { out, admin as adminQ, rateLimited, cooldown } from './limiter.js';
import { getMeta, dropMeta, findMember, botMember, isAdminP, levelOf, levelOfMember, num, LEVEL, LEVEL_NAME } from './perms.js';
import { validTime, normTime } from './scheduler.js';

const P = () => config.prefix;
const onoff = (v) => (v ? 'ON' : 'off');
const fmtDate = (ts) => new Date(ts).toLocaleString('en-IN', { timeZone: process.env.BOT_TZ || 'Asia/Calcutta', day: '2-digit', month: 'short', year: 'numeric' });

function ctxInfoOf(msg) {
  const m = msg.message?.ephemeralMessage?.message || msg.message || {};
  return m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || null;
}

/** Works out the target member: @mention, quoted message sender, or a phone number argument. */
function targetOf(ctx, meta) {
  const info = ctxInfoOf(ctx.msg);
  const mention = info?.mentionedJid?.[0];
  if (mention) return { member: findMember(meta, mention), raw: mention };
  const digits = ctx.args.map((a) => a.replace(/\D/g, '')).find((d) => d.length >= 7);
  if (digits) return { member: findMember(meta, digits), raw: `${digits}@s.whatsapp.net`, digits };
  if (info?.participant) return { member: findMember(meta, info.participant), raw: info.participant };
  return null;
}

function reasonText(ctx) {
  return ctx.args.filter((a) => !/^@?\+?\d{5,}$/.test(a)).join(' ').trim().slice(0, 200);
}

/** Wraps a handler with group-only, permission, bot-admin and rate-limit checks. */
function def(name, o) {
  return {
    name,
    category: 'Group',
    aliases: o.aliases || [],
    description: o.description,
    usage: o.usage || name,
    minArgs: o.minArgs || 0,
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('👥 This command only works inside a group.');
      if (!store()) return ctx.reply('⚠️ Group tools are still starting. Try again in a moment.');
      if (rateLimited(`cmd:${ctx.jid}:${ctx.sender}`, 10, 60_000) && !ctx.isOwner) return;
      const meta = await getMeta(ctx.sock, ctx.jid);
      if (!meta) return ctx.reply('⚠️ Could not read this group right now. Please try again.');
      const level = levelOf(ctx.sock, meta, ctx.msg, ctx.isOwner);
      const need = o.level || LEVEL.member;
      if (level < need) {
        return ctx.reply(`🔒 ${need >= LEVEL.owner ? 'Only the bot owner' : need >= LEVEL.botAdmin ? 'Only bot admins' : 'Only group admins'} can use this command.`);
      }
      const me = botMember(ctx.sock, meta);
      if (o.botAdmin && !isAdminP(me)) return ctx.reply('⚠️ Make me a group admin first, then try again.');
      const g = { meta, level, me, s: settings(ctx.jid), st: store() };
      await o.run(ctx, g);
    },
  };
}

const A = LEVEL.groupAdmin;
export const cmds = {};
const add = (name, o) => { cmds[name] = def(name, o); };

add('groupinfo', {
  aliases: ['ginfo'], description: 'Show info about this group', usage: 'groupinfo',
  async run(ctx, { meta, s }) {
    const admins = meta.participants.filter(isAdminP).length;
    const lines = [
      `*${meta.subject}*`,
      meta.desc ? `\n${String(meta.desc).slice(0, 300)}\n` : '',
      `👥 Members: ${meta.participants.length}`,
      `🛡️ Admins: ${admins}`,
      meta.creation ? `📅 Created: ${fmtDate(meta.creation * 1000)}` : '',
      `💬 Who can send: ${meta.announce ? 'admins only' : 'everyone'}`,
      `⚙️ Welcome ${onoff(s.welcome)}, goodbye ${onoff(s.goodbye)}, antilink ${onoff(s.antilink)}, antispam ${onoff(s.antispam)}`,
    ];
    await ctx.reply(lines.filter(Boolean).join('\n'));
  },
});

add('grouplink', {
  aliases: ['link'], description: 'Get the invite link (admins)', usage: 'grouplink', level: A, botAdmin: true,
  async run(ctx) {
    const code = await ctx.sock.groupInviteCode(ctx.jid);
    await ctx.reply(`🔗 https://chat.whatsapp.com/${code}`);
  },
});

add('revoke', {
  aliases: ['resetlink'], description: 'Reset the invite link (admins)', usage: 'revoke', level: A, botAdmin: true,
  async run(ctx) {
    const code = await ctx.sock.groupRevokeInvite(ctx.jid);
    await ctx.reply(`✅ Old link is now dead.\nNew link: https://chat.whatsapp.com/${code}`);
  },
});

add('add', {
  description: 'Add a person by number (admins)', usage: 'add 919876543210', level: A, botAdmin: true, minArgs: 1,
  async run(ctx, { meta }) {
    const digits = ctx.args[0].replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return ctx.reply(`⚠️ Send the full number with country code.\nExample: ${P()}add 919876543210`);
    if (findMember(meta, digits)) return ctx.reply('ℹ️ That person is already in the group.');
    const res = await adminQ.schedule(() => ctx.sock.groupParticipantsUpdate(ctx.jid, [`${digits}@s.whatsapp.net`], 'add'));
    const r = res?.[0];
    const status = String(r?.status || '200');
    dropMeta(ctx.jid);
    if (status === '200') return ctx.reply('✅ Added.');
    if (status === '403') return ctx.reply('⚠️ Their privacy settings block adding. Share the group link instead: ' + P() + 'grouplink');
    if (status === '408') return ctx.reply('⚠️ They left this group recently and cannot be added right now.');
    if (status === '409') return ctx.reply('ℹ️ That person is already in the group.');
    return ctx.reply(`⚠️ Could not add that number (code ${status}).`);
  },
});

async function rankAction(ctx, g, action, verb) {
  const t = targetOf(ctx, g.meta);
  if (!t) return ctx.reply(`⚠️ Mention a person, reply to their message, or send their number.\nExample: ${P()}${ctx.msg ? '' : ''}${verb} @person`);
  if (!t.member) return ctx.reply('ℹ️ That person is not in this group.');
  const target = t.member;
  if (findMember(g.meta, ctx.sock.user?.id, ctx.sock.user?.lid)?.id === target.id) return ctx.reply('😅 I will not do that to myself.');
  const tl = levelOfMember(ctx.sock, target);
  if (action === 'remove' && tl >= g.level) return ctx.reply('🔒 You cannot remove someone with the same or higher rank.');
  if (action === 'remove' && tl >= LEVEL.owner) return ctx.reply('🔒 I will not remove the bot owner.');
  if (action === 'promote' && isAdminP(target)) return ctx.reply('ℹ️ Already an admin.');
  if (action === 'demote' && !isAdminP(target)) return ctx.reply('ℹ️ Not an admin.');
  if (action === 'demote' && tl >= g.level && g.level < LEVEL.botAdmin) return ctx.reply('🔒 You cannot demote someone with the same or higher rank.');
  await adminQ.schedule(() => ctx.sock.groupParticipantsUpdate(ctx.jid, [target.id], action));
  dropMeta(ctx.jid);
  const done = { remove: 'removed', promote: 'promoted to admin', demote: 'demoted' }[action];
  await ctx.sock.sendMessage(ctx.jid, { text: `✅ @${num(target.id)} ${done}.`, mentions: [target.id] }, { quoted: ctx.msg });
}
for (const [name, action, desc] of [['remove', 'remove', 'Remove a person (admins)'], ['promote', 'promote', 'Make someone an admin (admins)'], ['demote', 'demote', 'Remove admin rights (admins)']]) {
  add(name, { aliases: name === 'remove' ? ['kick'] : [], description: desc, usage: `${name} @person`, level: A, botAdmin: true, run: (ctx, g) => rankAction(ctx, g, action, name) });
}

add('tagall', {
  aliases: ['everyone'], description: 'Mention everyone once (admins, 10 min cooldown)', usage: 'tagall [message]', level: A,
  async run(ctx, { meta, level }) {
    if (level < LEVEL.botAdmin) {
      const wait = cooldown(`tagall:${ctx.jid}`, 10 * 60_000);
      if (wait) return ctx.reply(`⏳ ${P()}tagall is limited to protect the number. Try again in ${Math.ceil(wait / 60000)} min.`);
    }
    const ids = meta.participants.map((p) => p.id).slice(0, 1024);
    const note = ctx.args.join(' ').slice(0, 300);
    const body = `📢 *${note || 'Attention everyone'}*\n\n` + ids.map((i) => `@${num(i)}`).join(' ');
    await out.schedule(() => ctx.sock.sendMessage(ctx.jid, { text: body, mentions: ids }));
  },
});

add('warn', {
  description: 'Warn a member (admins)', usage: 'warn @person [reason]', level: A,
  async run(ctx, g) {
    const t = targetOf(ctx, g.meta);
    if (!t?.member) return ctx.reply(`⚠️ Mention a person or reply to their message.\nExample: ${P()}warn @person spam`);
    if (levelOfMember(ctx.sock, t.member) >= LEVEL.groupAdmin) return ctx.reply('🔒 Admins cannot be warned.');
    const reason = reasonText(ctx) || 'no reason given';
    const id = t.member.id;
    const count = g.st.addWarn(ctx.jid, num(id), num(ctx.senderJid), reason);
    let text = `⚠️ @${num(id)} warned (${count}/${g.s.warnLimit}).\nReason: ${reason}`;
    if (count >= g.s.warnLimit) {
      if (g.s.warnAction === 'kick' && isAdminP(g.me)) {
        await adminQ.schedule(() => ctx.sock.groupParticipantsUpdate(ctx.jid, [id], 'remove')).catch((e) => logger.warn(`[groups] remove failed: ${e.message}`));
        g.st.clearWarns(ctx.jid, num(id));
        dropMeta(ctx.jid);
        text += '\n🚫 Limit reached: removed from the group.';
      } else text += `\n🚫 Limit reached. Admins can use ${P()}remove.`;
    }
    await ctx.sock.sendMessage(ctx.jid, { text, mentions: [id] }, { quoted: ctx.msg });
  },
});

add('warnings', {
  aliases: ['warns'], description: 'Show warnings of a member', usage: 'warnings [@person]',
  async run(ctx, g) {
    const t = targetOf(ctx, g.meta);
    let member = t?.member;
    if (t && g.level < A && member && member.id !== findMember(g.meta, ctx.msg.key.participant, ctx.msg.key.participantAlt)?.id) {
      return ctx.reply('🔒 Only admins can check other people. Use the command without a name to see yours.');
    }
    if (!t) member = findMember(g.meta, ctx.msg.key.participant, ctx.msg.key.participantAlt);
    if (!member) return ctx.reply('ℹ️ I could not tell who that is.');
    const list = g.st.listWarns(ctx.jid, num(member.id));
    if (!list.length) return ctx.sock.sendMessage(ctx.jid, { text: `✅ @${num(member.id)} has no warnings.`, mentions: [member.id] }, { quoted: ctx.msg });
    const lines = list.slice(-10).map((w, i) => `${i + 1}. ${fmtDate(w.ts)}: ${w.reason || '-'}`);
    await ctx.sock.sendMessage(ctx.jid, { text: `⚠️ @${num(member.id)}: ${list.length}/${g.s.warnLimit} warnings\n${lines.join('\n')}`, mentions: [member.id] }, { quoted: ctx.msg });
  },
});

add('resetwarn', {
  aliases: ['clearwarn'], description: 'Clear warnings of a member (admins)', usage: 'resetwarn @person', level: A,
  async run(ctx, g) {
    const t = targetOf(ctx, g.meta);
    if (!t?.member) return ctx.reply(`⚠️ Mention a person or reply to their message.\nExample: ${P()}resetwarn @person`);
    const n = g.st.clearWarns(ctx.jid, num(t.member.id));
    await ctx.sock.sendMessage(ctx.jid, { text: n ? `✅ Cleared ${n} warning(s) for @${num(t.member.id)}.` : `ℹ️ @${num(t.member.id)} had no warnings.`, mentions: [t.member.id] }, { quoted: ctx.msg });
  },
});

function toggle(name, key, label, extra = '') {
  add(name, {
    description: `Turn ${label} on or off (admins)`, usage: `${name} on|off`, level: A,
    async run(ctx, g) {
      const v = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return ctx.reply(`${label}: ${onoff(g.s[key])}\nUse ${P()}${name} on or ${P()}${name} off`);
      g.st.setSetting(ctx.jid, key, v === 'on');
      let note = '';
      if (v === 'on' && ['antilink', 'antispam', 'antiflood', 'badwords'].includes(key) && !isAdminP(g.me)) note = '\nℹ️ I am not an admin here, so I can warn but not delete messages.';
      await ctx.reply(`✅ ${label} is now ${v.toUpperCase()}.${note}${v === 'on' ? extra : ''}`);
    },
  });
}
toggle('antilink', 'antilink', 'Anti-link', '\nLinks from members are deleted and warned. Admins are exempt.');
toggle('antispam', 'antispam', 'Anti-spam', '\nRepeated identical messages are deleted and warned.');
toggle('antiflood', 'antiflood', 'Anti-flood', '\nVery fast message bursts are warned.');
toggle('welcome', 'welcome', 'Welcome message');
toggle('goodbye', 'goodbye', 'Goodbye message');

add('blockword', {
  aliases: ['badword'], description: 'Manage blocked words (admins)', usage: 'blockword add|remove|list [word]', level: A,
  async run(ctx, g) {
    const sub = (ctx.args[0] || 'list').toLowerCase();
    const word = ctx.args.slice(1).join(' ').toLowerCase().trim().slice(0, 40);
    if (sub === 'add' && word) {
      g.st.addWord(ctx.jid, word);
      g.st.setSetting(ctx.jid, 'badwords', true);
      return ctx.reply(`✅ Blocked: "${word}". The word filter is ON for this group.`);
    }
    if (sub === 'remove' && word) return ctx.reply(g.st.delWord(ctx.jid, word) ? `✅ Removed "${word}".` : 'ℹ️ That word was not in the list.');
    if (sub === 'off' || sub === 'on') { g.st.setSetting(ctx.jid, 'badwords', sub === 'on'); return ctx.reply(`✅ Word filter ${sub.toUpperCase()}.`); }
    const list = g.st.words(ctx.jid);
    await ctx.reply(`🚫 Word filter: ${onoff(g.s.badwords)}\n${list.length ? list.map((w) => `• ${w}`).join('\n') : 'No words yet.'}\n\nUsage: ${P()}blockword add|remove <word>`);
  },
});

add('rules', {
  description: 'Show the group rules', usage: 'rules',
  async run(ctx, { s, meta }) {
    if (!s.rules) return ctx.reply(`ℹ️ No rules set yet. Admins can use ${P()}setrules <text>.`);
    await ctx.reply(`📜 *Rules of ${meta.subject}*\n\n${s.rules}`);
  },
});

add('setrules', {
  description: 'Set the group rules (admins)', usage: 'setrules <text>', level: A,
  async run(ctx, g) {
    const text = ctx.text.replace(/^\S+\s*/, '').trim().slice(0, 1500);
    if (!text) return ctx.reply(`⚠️ Write the rules after the command.\nExample: ${P()}setrules 1. Be kind 2. No spam`);
    g.st.setSetting(ctx.jid, 'rules', text);
    await ctx.reply('✅ Rules saved. Members can read them with ' + P() + 'rules.');
  },
});

add('groupstats', {
  aliases: ['gstats'], description: 'Message counts and top members', usage: 'groupstats',
  async run(ctx, { meta, st }) {
    const t = st.totals(ctx.jid);
    const top = st.topUsers(ctx.jid, 5);
    const names = top.map((u, i) => `${i + 1}. @${u.user} (${u.msgs})`);
    const mentions = top.map((u) => meta.participants.find((p) => num(p.id) === u.user)?.id).filter(Boolean);
    await ctx.sock.sendMessage(ctx.jid, {
      text: [`📊 *${meta.subject}*`, `👥 Members: ${meta.participants.length}`, `💬 Messages counted: ${t.msgs} from ${t.users} people`, `⚠️ Warnings given: ${st.warnTotal(ctx.jid)}`, '', names.length ? '🏆 Top talkers\n' + names.join('\n') : 'No activity counted yet.'].join('\n'),
      mentions,
    }, { quoted: ctx.msg });
  },
});

const SETTABLE = {
  warnlimit: ['warnLimit', 'number', 1, 10],
  warnaction: ['warnAction', ['notify', 'kick']],
  floodlimit: ['floodLimit', 'number', 3, 30],
  floodwindow: ['floodWindow', 'number', 3, 60],
  spamrepeat: ['spamRepeat', 'number', 2, 10],
  spamwindow: ['spamWindow', 'number', 5, 120],
  welcomemsg: ['welcomeMsg', 'text'],
  goodbyemsg: ['goodbyeMsg', 'text'],
  badwords: ['badwords', 'bool'],
};
add('groupconfig', {
  aliases: ['gconfig', 'gsettings'], description: 'View or change group settings (admins)', usage: 'groupconfig [setting value]', level: A,
  async run(ctx, g) {
    const key = (ctx.args[0] || '').toLowerCase();
    if (!key) {
      const s = g.s;
      return ctx.reply([
        `⚙️ *${g.meta.subject} settings*`,
        `welcome: ${onoff(s.welcome)}   goodbye: ${onoff(s.goodbye)}`,
        `antilink: ${onoff(s.antilink)}   antispam: ${onoff(s.antispam)}   antiflood: ${onoff(s.antiflood)}`,
        `word filter: ${onoff(s.badwords)} (${g.st.words(ctx.jid).length} words)`,
        `warn limit: ${s.warnLimit}   at limit: ${s.warnAction}`,
        `flood: ${s.floodLimit} msgs / ${s.floodWindow}s   spam: ${s.spamRepeat} repeats / ${s.spamWindow}s`,
        `rules: ${s.rules ? 'set' : 'not set'}   schedules: ${g.st.listSchedules(ctx.jid).length}`,
        '',
        `Change: ${P()}groupconfig <setting> <value>`,
        'Settings: warnlimit, warnaction (notify|kick), floodlimit, floodwindow, spamrepeat, spamwindow, welcomemsg, goodbyemsg',
        'Placeholders for messages: {user} {group} {count}',
        `Reset a setting: ${P()}groupconfig <setting> reset`,
      ].join('\n'));
    }
    const spec = SETTABLE[key];
    if (!spec) return ctx.reply(`⚠️ Unknown setting "${key}". Use ${P()}groupconfig to see the list.`);
    const raw = ctx.text.replace(/^\S+\s+\S+\s*/, '').trim();
    if (!raw) return ctx.reply(`${key} is now: ${String(g.s[spec[0]]).slice(0, 200)}`);
    if (raw.toLowerCase() === 'reset') { g.st.setSetting(ctx.jid, spec[0], DEFAULTS[spec[0]]); return ctx.reply(`✅ ${key} reset to default.`); }
    let val;
    if (spec[1] === 'number') {
      val = Number(raw);
      if (!Number.isInteger(val) || val < spec[2] || val > spec[3]) return ctx.reply(`⚠️ ${key} must be a whole number from ${spec[2]} to ${spec[3]}.`);
    } else if (spec[1] === 'text') val = raw.slice(0, 500);
    else if (spec[1] === 'bool') { if (!['on', 'off'].includes(raw.toLowerCase())) return ctx.reply('⚠️ Use on or off.'); val = raw.toLowerCase() === 'on'; }
    else { val = raw.toLowerCase(); if (!spec[1].includes(val)) return ctx.reply(`⚠️ ${key} must be one of: ${spec[1].join(', ')}.`); }
    g.st.setSetting(ctx.jid, spec[0], val);
    await ctx.reply(`✅ ${key} set to: ${String(val).slice(0, 200)}`);
  },
});

add('announce', {
  description: 'Post an announcement (admins)', usage: 'announce <text>', level: A, minArgs: 1,
  async run(ctx) {
    const text = ctx.text.replace(/^\S+\s*/, '').trim().slice(0, 2000);
    await out.schedule(() => ctx.sock.sendMessage(ctx.jid, { text: `📢 *Announcement*\n\n${text}` }));
  },
});

add('schedule', {
  description: 'Daily scheduled message (admins)', usage: 'schedule 09:00 text | list | del <id>', level: A,
  async run(ctx, g) {
    const sub = (ctx.args[0] || 'list').toLowerCase();
    if (sub === 'list') {
      const l = g.st.listSchedules(ctx.jid);
      return ctx.reply(l.length ? '📅 *Scheduled messages (daily)*\n' + l.map((x) => `#${x.id} ${x.hhmm} - ${x.text.slice(0, 60)}`).join('\n') : `ℹ️ Nothing scheduled.\nExample: ${P()}schedule 09:00 Good morning everyone`);
    }
    if (sub === 'del' || sub === 'delete') {
      const id = Number(ctx.args[1]);
      return ctx.reply(Number.isInteger(id) && g.st.delSchedule(ctx.jid, id) ? `✅ Removed #${id}.` : 'ℹ️ No such schedule id.');
    }
    if (!validTime(sub)) return ctx.reply(`⚠️ Time must be 24 hour HH:MM.\nExample: ${P()}schedule 09:00 Good morning`);
    const text = ctx.text.replace(/^\S+\s+\S+\s*/, '').trim().slice(0, 1000);
    if (!text) return ctx.reply('⚠️ Add the message text after the time.');
    if (g.st.listSchedules(ctx.jid).length >= 5) return ctx.reply('⚠️ Max 5 scheduled messages per group.');
    const id = g.st.addSchedule(ctx.jid, normTime(sub), text, num(ctx.senderJid));
    await ctx.reply(`✅ Scheduled #${id}: every day at ${normTime(sub)} (${process.env.BOT_TZ || 'Asia/Calcutta'}).`);
  },
});

for (const [name, announce, desc] of [['mute', true, 'Only admins can send (admins)'], ['unmute', false, 'Everyone can send (admins)']]) {
  add(name, {
    description: desc, usage: name, level: A, botAdmin: true,
    async run(ctx) {
      await adminQ.schedule(() => ctx.sock.groupSettingUpdate(ctx.jid, announce ? 'announcement' : 'not_announcement'));
      dropMeta(ctx.jid);
      await ctx.reply(announce ? '🔇 Group muted. Only admins can send messages.' : '🔊 Group unmuted. Everyone can send messages.');
    },
  });
}

add('botadmin', {
  description: 'Manage bot admins (owner only)', usage: 'botadmin add|remove|list @person', level: LEVEL.owner,
  async run(ctx, g) {
    const sub = (ctx.args[0] || 'list').toLowerCase();
    if (sub === 'list') {
      const l = g.st.botAdmins();
      return ctx.reply(l.length ? '🛡️ Bot admins\n' + l.map((n) => `• +${n}`).join('\n') : 'ℹ️ No bot admins yet.');
    }
    const t = targetOf({ ...ctx, args: ctx.args.slice(1) }, g.meta);
    const n = t?.digits || (t?.member && (num(t.member.phoneNumber || '') || num(t.member.id)));
    if (!n) return ctx.reply(`⚠️ Mention the person or send their number.\nExample: ${P()}botadmin add 919876543210`);
    if (sub === 'add') { g.st.addBotAdmin(n); return ctx.reply(`✅ +${n} is now a bot admin.`); }
    if (sub === 'remove') return ctx.reply(g.st.delBotAdmin(n) ? `✅ Removed +${n}.` : 'ℹ️ They were not a bot admin.');
    await ctx.reply(`Usage: ${P()}botadmin add|remove|list @person`);
  },
});

export { LEVEL_NAME };
