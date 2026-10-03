// Short in-memory conversation context for /ask (per chat and sender). Not persisted.
const TTL_MS = 30 * 60 * 1000;
const MAX_TURNS = 6;
const mem = new Map();
const key = (chat, user) => chat + '|' + user;
export function recall(chat, user, now = Date.now()) {
  const m = mem.get(key(chat, user));
  if (!m || now - m.t > TTL_MS) { mem.delete(key(chat, user)); return []; }
  return m.turns;
}
export function remember(chat, user, q, a, now = Date.now()) {
  const k = key(chat, user);
  const turns = [...recall(chat, user, now), { q: String(q).slice(0, 400), a: String(a).slice(0, 500) }].slice(-MAX_TURNS);
  mem.set(k, { t: now, turns });
  if (mem.size > 2000) mem.delete(mem.keys().next().value);
}
export function forget(chat, user) { return mem.delete(key(chat, user)); }
export function withContext(turns, question) {
  if (!turns.length) return question;
  const hist = turns.map((x) => `User: ${x.q}\nAssistant: ${x.a}`).join('\n');
  return `Earlier in this conversation:\n${hist}\n\nNow answer the user's new message (use the earlier context only if relevant).\nUser: ${question}`;
}
