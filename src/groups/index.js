// Group management module entry. Hooked in from the message handler; never touches the connection code.
import logger from '../utils/logger.js';
import { initStore, settings, store } from './store.js';
import { startScheduler } from './scheduler.js';
import { out } from './limiter.js';
import { getMeta, dropMeta, num } from './perms.js';

process.on('exit', (c) => console.log('[groups] process exit, code', c));
let current = null;
const attached = new WeakSet();
let ready = null;

const pid = (p) => (typeof p === 'string' ? p : p?.id || p?.jid || '');
const fill = (tpl, vars) => String(tpl).replace(/\{(user|group|count)\}/g, (_, k) => vars[k]);

async function onParticipants(sock, ev) {
  try {
    const gid = ev.id;
    dropMeta(gid);
    const action = ev.action;
    if (!['add', 'remove'].includes(action)) return;
    const s = settings(gid);
    if (action === 'add' ? !s.welcome : !s.goodbye) return;
    const ids = (ev.participants || []).map(pid).filter(Boolean);
    if (!ids.length) return;
    // Never greet the bot itself.
    const me = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num);
    const people = ids.filter((i) => !me.includes(num(i))).slice(0, 5);
    if (!people.length) return;
    const meta = await getMeta(sock, gid, true);
    const tpl = action === 'add' ? s.welcomeMsg : s.goodbyeMsg;
    const text = fill(tpl, { user: people.map((i) => `@${num(i)}`).join(' '), group: meta?.subject || 'the group', count: meta?.participants?.length ?? '' });
    await out.schedule(() => sock.sendMessage(gid, { text, mentions: people }));
  } catch (err) {
    logger.warn(`[groups] welcome/goodbye failed: ${String(err.message).slice(0, 100)}`);
  }
}

/** Called once per socket from the message handler. Safe to call repeatedly. */
export function attachGroups(sock) {
  current = sock;
  if (attached.has(sock)) return;
  attached.add(sock);
  ready ||= initStore().then(() => startScheduler(() => current)).catch((err) => logger.error('[groups] init failed:', err));
  sock.ev.on('group-participants.update', (ev) => { onParticipants(sock, ev).catch(() => {}); });
  sock.ev.on('groups.update', (list) => { for (const g of list || []) if (g?.id) dropMeta(g.id); });
}

export const groupsReady = () => ready || Promise.resolve();
export { store };
