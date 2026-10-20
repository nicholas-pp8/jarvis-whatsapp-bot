// Multi-turn conversational commands: a per-chat session that receives the
// chat's next plain messages until it ends or expires. In-memory only - a
// restart drops active sessions (commands should say so when starting one).
const sessions = new Map(); // jid -> { cmd, onText, expiresAt }

/** Start a session for ctx.jid. onText(sctx, text, end) handles each message;
 *  sctx = { sock, jid, reply, state }. Call end() to finish. */
export function begin(ctx, { cmd, ttlMs = 5 * 60e3, state = {}, onText }) {
  if (typeof onText !== 'function') return false;
  sessions.set(ctx.jid, { cmd, onText, state, expiresAt: Date.now() + ttlMs });
  return true;
}
export function has(jid) {
  const s = sessions.get(jid);
  if (!s) return false;
  if (Date.now() > s.expiresAt) { sessions.delete(jid); return false; }
  return true;
}
export function end(jid) { sessions.delete(jid); }
/** Route one plain message into the active session. Returns true if consumed. */
export async function route(sock, msg, text) {
  const jid = msg.key.remoteJid;
  const s = sessions.get(jid);
  if (!s) return false;
  if (Date.now() > s.expiresAt) { sessions.delete(jid); return false; }
  const sctx = {
    sock, jid, state: s.state,
    reply: (t, o) => sock.sendMessage(jid, { text: t, ...(o || {}) }, { quoted: msg }),
  };
  try { await s.onText(sctx, text, () => sessions.delete(jid)); } catch { sessions.delete(jid); }
  return true;
}
