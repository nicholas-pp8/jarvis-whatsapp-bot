import config from '../config/config.js';
import logger from '../utils/logger.js';
import { bump } from '../database/database.js';

const seen = new Set();
const MAX_SEEN = 2000;

/** Marks a newly posted WhatsApp status as viewed (only when AUTO_STATUS_VIEW=true). */
export async function handleStatus(sock, msg) {
  if (!config.autoStatusView) return;
  try {
    const key = msg.key;
    if (!key?.id || key.fromMe) return;
    const id = `${key.participant || key.participantAlt || ''}:${key.id}`;
    if (seen.has(id)) return; // duplicate event
    seen.add(id);
    if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
    await sock.readMessages([key]);
    bump('statusViewed');
    logger.info('Status viewed');
  } catch (err) {
    logger.warn('Status view failed:', err);
  }
}
