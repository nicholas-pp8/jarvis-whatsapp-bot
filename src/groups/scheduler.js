// Scheduled group messages: "/schedule 09:00 text" posts every day at that time (bot timezone).
import logger from '../utils/logger.js';
import { store } from './store.js';
import { out } from './limiter.js';

const TZ = process.env.BOT_TZ || 'Asia/Calcutta';
let cron = null;
try { cron = (await import('node-cron')).default; } catch { /* fallback below */ }
let task = null;
let timer = null;

function nowParts() {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { hhmm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`, day: `${p.year}-${p.month}-${p.day}` };
}

async function tick(getSock) {
  try {
    const sock = getSock();
    if (!sock || !store()) return;
    const { hhmm, day } = nowParts();
    for (const s of store().listSchedules()) {
      if (s.hhmm !== hhmm || s.last_day === day) continue;
      store().markSchedule(s.id, day);
      await out.schedule(() => sock.sendMessage(s.gid, { text: `📅 ${s.text}` })).catch((e) => logger.warn(`[groups] scheduled send failed: ${String(e.message).slice(0, 80)}`));
    }
  } catch (err) {
    logger.warn(`[groups] scheduler error: ${String(err.message).slice(0, 80)}`);
  }
}

export function startScheduler(getSock) {
  if (task || timer) return;
  if (cron) task = cron.schedule('* * * * *', () => tick(getSock), { timezone: TZ });
  else timer = setInterval(() => tick(getSock), 30_000);
  logger.info(`[groups] scheduler running (${cron ? 'node-cron' : 'interval'}, ${TZ})`);
}
export const validTime = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t || '');
export const normTime = (t) => t.padStart(5, '0');
