import { jidToNumber } from '../utils/helpers.js';
import { quiet } from '../recover/index.js';
import logger from '../utils/logger.js';

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
    // Try every form of the id WhatsApp may accept (phone id, own device id, LID) and keep the reason.
    const tries = [jid];
    const me = jidToNumber(ctx.sock.user?.id || '');
    if (me && jidToNumber(jid) === me) tries.unshift(ctx.sock.user.id.replace(/:\d+@/, '@'));
    try {
      const lid = await ctx.sock.signalRepository?.lidMapping?.getLIDForPN?.(jid);
      if (lid) tries.push(lid);
    } catch { /* no mapping */ }
    if (ctx.sock.user?.lid && me && jidToNumber(jid) === me) tries.push(ctx.sock.user.lid.replace(/:\d+@/, '@'));
    let url = null;
    let why = '';
    for (const t of [...new Set(tries)]) {
      for (const kind of ['image', 'preview']) {
        try { url = await ctx.sock.profilePictureUrl(t, kind); if (url) break; } catch (err) { why = String(err?.message || err?.data || err); logger.info(`[getpp] ${kind} for ${jidToNumber(t)}@${t.split('@')[1]} failed: ${why.slice(0, 60)}`); }
      }
      if (url) break;
    }
    if (!url) {
      const reason = /not-authorized|401|forbidden/i.test(why) ? 'WhatsApp says the photo is private (their privacy setting hides it from this linked device).'
        : /item-not-found|404/i.test(why) ? 'They have no profile picture set.'
        : /timed? ?out|timeout/i.test(why) ? 'WhatsApp did not answer in time. Try again.'
        : `They may have none or hide it.${why ? ` (WhatsApp said: ${why.slice(0, 40)})` : ''}`;
      return ctx.sock.sendMessage(to, { text: `No profile picture for +${jidToNumber(jid)}. ${reason}` });
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const isImage = (buf[0] === 0xff && buf[1] === 0xd8) || buf.slice(1, 4).toString() === 'PNG' || buf.slice(8, 12).toString() === 'WEBP';
      logger.info(`[getpp] fetched ${buf.length} bytes, type ${res.headers?.get?.('content-type') || 'unknown'}, image=${isImage}`);
      if (!isImage || buf.length < 200) throw new Error('not an image');
      await ctx.sock.sendMessage(to, { image: buf, caption: `Profile picture of +${jidToNumber(jid)}` });
    } catch {
      await ctx.sock.sendMessage(to, { text: 'Could not download that picture. Try again in a moment.' });
    }
  },
};
