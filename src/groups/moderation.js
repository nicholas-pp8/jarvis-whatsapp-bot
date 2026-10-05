import {rt} from '../i18n/runtime.js';
// Optional auto-moderation. Every feature is OFF until a group admin turns it on.
import validator from 'validator';
import logger from '../utils/logger.js';
import { record as recordActivity } from './activity.js';
import { store, settings } from './store.js';
import { out } from './limiter.js';
import { getMeta, botMember, isAdminP, levelOf, findMember, num, LEVEL } from './perms.js';

const recent = new Map(); // gid:user -> [{t, text}]
const notified = new Map(); // gid:user -> last notice time

const URL_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/)\S+/i;
export function hasLink(text, whitelist = []) {
  if (!text) return false;
  const all = text.match(new RegExp(URL_RE.source, 'gi'));
  if (!all) return false;
  const wl = (Array.isArray(whitelist) ? whitelist : []).map((d) => String(d).toLowerCase());
  for (const m of all) {
    const raw = m.replace(/[.,;!?)]+$/, '');
    const isInvite = /chat\.whatsapp\.com\//i.test(raw);
    const isLink = isInvite || validator.isURL(raw, { require_protocol: false }) || /^https?:\/\//i.test(raw);
    if (!isLink) continue;
    if (isInvite) return true;
    let host = '';
    try { host = new URL(/^https?:\/\//i.test(raw) ? raw : 'http://' + raw).hostname.toLowerCase().replace(/^www\./, ''); } catch { /* keep empty */ }
    if (host && wl.some((d) => host === d || host.endsWith('.' + d))) continue;
    return true;
  }
  return false;
}

export function textOf(message) {
  const m = message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message || {};
  return (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || '').trim();
}

const STRIKE_WINDOW_MS = 45_000;
async function strike(sock, msg, gid, memberId, reason, s, canDelete) {
  const st = store();
  if (canDelete) await out.schedule(() => sock.sendMessage(gid, { delete: msg.key })).catch((e) => logger.warn(`[groups] delete failed: ${String(e.message).slice(0, 80)}`));
  else logger.info("[groups] cannot delete (bot is not admin)");
  const key = `${gid}:${memberId}`;
  const last = notified.get(key) || 0;
  // One burst = one strike: extra offending messages inside the window are only deleted.
  if (Date.now() - last < STRIKE_WINDOW_MS) return;
  if (notified.size > 5000) notified.clear();
  notified.set(key, Date.now());
  const count = st.addWarn(gid, memberId, 'auto', reason);
  const ctx={jid:gid,isGroup:true,sender:memberId};const tag = `@${num(memberId)}`;
  const reasonText=rt(ctx,reason);
  let text = rt(ctx,'moderation_warning',{user:tag,reason:reasonText,count,limit:s.warnLimit});
  if (count >= s.warnLimit) {
    if (s.warnAction === 'kick' && canDelete) {
      await out.schedule(() => sock.groupParticipantsUpdate(gid, [memberId], 'remove')).catch((e) => logger.warn(`[groups] auto remove failed: ${e.message}`));
      st.clearWarns(gid, memberId);
      text = rt(ctx,'moderation_removed',{user:tag,limit:s.warnLimit});
    } else {
      text = rt(ctx,'moderation_review',{user:tag,limit:s.warnLimit});
    }
  }
  await out.schedule(() => sock.sendMessage(gid, { text, mentions: [memberId] })).catch(() => {});
}

/** Called for every group message that is not from the bot. Never throws. */
export async function moderate(sock, msg, isOwner) {
  try {
    const gid = msg.key.remoteJid;
    const s = settings(gid);
    const st = store();
    if (!st) return;
    const text = textOf(msg.message);
    const sender = msg.key.participant || msg.key.participantAlt;
    if (!sender) return;

    const meta = await getMeta(sock, gid);
    if (!meta) return;
    const member = findMember(meta, msg.key.participant, msg.key.participantAlt);
    const memberId = member?.id || sender;
    st.bump(gid, num(memberId));
    recordActivity(gid, num(memberId));

    if (!(s.antilink || s.antiinvite || s.antispam || s.antiflood || s.badwords)) return;
    if (levelOf(sock, meta, msg, isOwner) >= LEVEL.groupAdmin) return; // admins are exempt
    const me = botMember(sock, meta);
    const canDelete = isAdminP(me);

    const k = `${gid}:${num(memberId)}`;
    const now = Date.now();
    const list = (recent.get(k) || []).filter((x) => now - x.t < 60_000);
    list.push({ t: now, text });
    recent.set(k, list);
    if (recent.size > 3000) recent.clear();

    if (s.antiinvite && /chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(text)) return strike(sock, msg, gid, memberId, 'moderation_links', s, canDelete);
    if (s.antilink && hasLink(text, s.linkWhitelist)) return strike(sock, msg, gid, memberId, 'moderation_links', s, canDelete);
    if (s.badwords) {
      const lower = text.toLowerCase();
      const words = st.words(gid);
      if (words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(lower))) {
        return strike(sock, msg, gid, memberId, 'moderation_words', s, canDelete);
      }
    }
    if (s.antispam && text) {
      const same = list.filter((x) => x.text === text && now - x.t < s.spamWindow * 1000).length;
      if (same >= s.spamRepeat) return strike(sock, msg, gid, memberId, 'moderation_repeat', s, canDelete);
    }
    if (s.antiflood) {
      const burst = list.filter((x) => now - x.t < s.floodWindow * 1000).length;
      if (burst > s.floodLimit) return strike(sock, msg, gid, memberId, 'moderation_fast', s, canDelete);
    }
  } catch (err) {
    logger.warn(`[groups] moderation error: ${String(err.message).slice(0, 100)}`);
  }
}
