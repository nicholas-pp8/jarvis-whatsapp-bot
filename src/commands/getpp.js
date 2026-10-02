import { jidToNumber } from '../utils/helpers.js';
import { quiet } from '../recover/index.js';

export default {
  name: 'getpp',
  aliases: ['pp', 'dp'],
  category: 'Recover',
  description: 'Get the profile picture of a user',
  usage: 'getpp (reply, @mention or number)',
  async run(ctx) {
    const m = ctx.msg.message || {};
    const info = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo;
    const digits = (ctx.args.join('') || '').replace(/\D/g, '');
    let jid = info?.participant || info?.mentionedJid?.[0] || (digits.length >= 7 ? `${digits}@s.whatsapp.net` : '');
    if (!jid) jid = ctx.isGroup ? ctx.senderJid : ctx.jid;
    const to = ctx.isOwner ? await quiet(ctx) : ctx.jid;
    let url = null;
    for (const kind of ['image', 'preview']) {
      try { url = await ctx.sock.profilePictureUrl(jid, kind); if (url) break; } catch { /* hidden or none */ }
    }
    if (!url) return ctx.sock.sendMessage(to, { text: `No profile picture for +${jidToNumber(jid)}. They may have none or hide it.` });
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await ctx.sock.sendMessage(to, { image: buf, caption: `Profile picture of +${jidToNumber(jid)}` });
    } catch {
      await ctx.sock.sendMessage(to, { text: 'Could not download that picture. Try again in a moment.' });
    }
  },
};
