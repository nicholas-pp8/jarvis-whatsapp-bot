// Optional auto-moderation. Every feature is OFF until a group admin turns it on.
import validator from 'validator';
import logger from '../utils/logger.js';
import { store, settings } from './store.js';
import { out } from './limiter.js';
import { getMeta, botMember, isAdminP, levelOf, findMember, num, LEVEL } from './perms.js';

const recent = new Map(); // gid:user -> [{t, text}]
const notified = new Map(); // gid:user -> last notice time

const URL_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/)\S+/i;
export function hasLink(text) {
  if (!text) return false;
  const m = text.match(URL_RE);
  if (!m) return false;
  const raw = m[0].replace(/[.,;!?)]+$/, '');
  if (/chat\.whatsapp\.com\//i.test(raw)) return true;
  return validator.isURL(raw, { require_protocol: false }) || /^https?:\/\//i.test(raw);
}

export function textOf(message) {
  const m = message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message || {};
  return (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || '').trim();
}

async function strike(sock, msg, gid, memberId, reason, s, canDelete) {
  const st = store();
  if (canDelete) await out.schedule(() => sock.sendMessage(gid, { delete: msg.key })).catch((e) => logger.warn(`[groups] delete failed: ${String(e.message).slice(0, 80)}`));
  else logger.info("[groups] cannot delete (bot is not admin)");
  const count = st.addWarn(gid, memberId, 'auto', reason);
  const key = `${gid}:${memberId}`;
  const last = notified.get(key) || 0;
  if (Date.now() - last < 30_000) return;
  notified.set(key, Date.now());
  const tag = `@${num(memberId)}`;
  let text = `⚠️ ${tag} ${reason}. Warning ${count}/${s.warnLimit}.`;
  if (count >= s.warnLimit) {
    if (s.warnAction === 'kick' && canDelete) {
      await out.schedule(() => sock.groupParticipantsUpdate(gid, [memberId], 'remove')).catch((e) => logger.warn(`[groups] auto remove failed: ${e.message}`));
      st.clearWarns(gid, memberId);
      text = `🚫 ${tag} reached ${s.warnLimit} warnings and was removed.`;
    } else {
      text = `🚫 ${tag} reached ${s.warnLimit} warnings. Admins, please review.`;
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

    if (!(s.antilink || s.antispam || s.antiflood || s.badwords)) return;
    if (levelOf(sock, meta, msg, isOwner) >= LEVEL.groupAdmin) return; // admins are exempt
    const me = botMember(sock, meta);
    const canDelete = isAdminP(me);

    const k = `${gid}:${num(memberId)}`;
    const now = Date.now();
    const list = (recent.get(k) || []).filter((x) => now - x.t < 60_000);
    list.push({ t: now, text });
    recent.set(k, list);
    if (recent.size > 3000) recent.clear();

    if (s.antilink && hasLink(text)) return strike(sock, msg, gid, memberId, 'links are not allowed here', s, canDelete);
    if (s.badwords) {
      const lower = text.toLowerCase();
      const words = st.words(gid);
      if (words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(lower))) {
        return strike(sock, msg, gid, memberId, 'that word is not allowed here', s, canDelete);
      }
    }
    if (s.antispam && text) {
      const same = list.filter((x) => x.text === text && now - x.t < s.spamWindow * 1000).length;
      if (same >= s.spamRepeat) return strike(sock, msg, gid, memberId, 'please do not repeat the same message', s, canDelete);
    }
    if (s.antiflood) {
      const burst = list.filter((x) => now - x.t < s.floodWindow * 1000).length;
      if (burst > s.floodLimit) return strike(sock, msg, gid, memberId, 'you are sending messages too fast', s, canDelete);
    }
  } catch (err) {
    logger.warn(`[groups] moderation error: ${String(err.message).slice(0, 100)}`);
  }
}
