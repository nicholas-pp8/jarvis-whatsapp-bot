import { getPollMessage, applyUpdates as applyPollUpdates, resume as resumePolls } from '../polls/index.js';
import {bindPairedOwner} from '../permissions/paired-owner.js';
import fs from 'node:fs/promises';
import readline from 'node:readline';
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import {connection,stop as stopOps} from '../ops/index.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import { handleMessage, trackOutgoing } from '../handlers/messageHandler.js';
import { getCached, cacheMessage } from '../utils/msgCache.js';
import { observe, onRevokeKey } from '../recover/index.js';
import { createPairing, createProofRelay, loadSaved } from '../ecosystem/pairing.js';

const MAX_PAIRING_ATTEMPTS = 3;
const MAX_MESSAGE_AGE_S = 120;

let sock = null;
let stopping = false;
let reconnectAttempts = 0;
let pairingAttempts = 0;
let pairingNumber = config.pairingNumber || config.ownerNumber || '';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function promptNumber() {
  for (let i = 0; i < 3; i++) {
    const answer = (await ask('Enter the WhatsApp number to connect (country code, digits only, e.g. 919876543210): ')).replace(/\D/g, '');
    if (answer.length >= 8 && answer.length <= 15) return answer;
    console.log('That does not look like a valid phone number. Try again.');
  }
  throw new Error('No valid phone number provided');
}

async function wipeAuth() {
  await fs.rm(config.paths.auth, { recursive: true, force: true });
  await fs.mkdir(config.paths.auth, { recursive: true });
}

async function requestPairing(s) {
  try {
    if (!pairingNumber) pairingNumber = await promptNumber();
    pairingAttempts++;
    if (pairingAttempts > MAX_PAIRING_ATTEMPTS) {
      logger.error('Pairing was not completed after several attempts. Stopping to avoid WhatsApp rate limits. Start the bot again when ready.');
      return shutdown(1);
    }
    const code = await s.requestPairingCode(pairingNumber);
    pairing?.relayCode(code).catch(() => {});
    const pretty = code.match(/.{1,4}/g)?.join('-') || code;
    // Printed on purpose: this one-time code is what the user types into WhatsApp.
    console.log('\n==============================================');
    console.log(`  PAIRING CODE:  ${pretty}`);
    console.log('  WhatsApp > Settings > Linked devices > Link a device');
    console.log('  > "Link with phone number instead" and enter the code.');
    console.log('  The code expires in about 2 minutes.');
    console.log('==============================================\n');
  } catch (err) {
    logger.error('Could not get a pairing code:', err);
  }
}

// Pairing portal hooks. Inactive unless ecosystem.portalUrl and ecosystem.ticket are set in settings.js.
let pairing = null;
const proofRelay = (process.env.PORTAL_URL && process.env.PORTAL_PROOF_KEY) ? createProofRelay({ log: (m) => logger.warn(m) }) : null;
function setupPairing(s) {
  const saved = loadSaved(config.paths.data);
  if (saved && !config.ecosystem.sid) config.ecosystem.sid = saved;
  pairing = createPairing({
    eco: config.ecosystem, dir: config.paths.data, log: (m) => logger.warn(m),
    applySid: (sid) => { config.ecosystem.sid = sid; },
    sendText: (num, text) => s.sendMessage(String(num).replace(/\D/g, '') + '@s.whatsapp.net', { text }),
    sendSelf: (text) => { const me = String(s.user?.id || '').split('@')[0].split(':')[0]; return s.sendMessage(me + '@s.whatsapp.net', { text }); },
  });
}

export async function startWhatsApp() {
  stopping = false;
  const { state, saveCreds } = await useMultiFileAuthState(config.paths.auth);
  // Ask for the number BEFORE opening the socket, so the pairing code is fresh when it appears.
  if (!pairingNumber && !state.creds.registered && config.ecosystem.ticket && config.ecosystem.number) pairingNumber = config.ecosystem.number;
  if (!state.creds.registered && !pairingNumber) {
    try {
      pairingNumber = await promptNumber();
    } catch (err) {
      logger.error(err.message);
      return shutdown(1);
    }
  }
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    logger.warn('Could not fetch the latest WhatsApp Web version, using the library default');
  }
  const silent = pino({ level: 'silent' });

  const s = makeWASocket({
    version,
    logger: silent,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silent) },
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    // Lets WhatsApp re-send messages we could not decrypt the first time (needed for full media delivery).
    getMessage: async (key) => getCached(key?.id)?.message || getPollMessage(key?.id),
  });
  sock = s;
  trackOutgoing(s);
  setupPairing(s);
  try { resumePolls(s); } catch { /* polls are optional */ }

  s.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (err) {
      logger.error('Saving credentials failed:', err);
    }
  });

  let pairingRequested = false;
  s.ev.on('connection.update', async (update) => {
    try {
      const { connection: connectionState, lastDisconnect, qr } = update;

      // A QR event means the socket is ready and not logged in: ask for a pairing code instead.
      if (qr && !s.authState.creds.registered && !pairingRequested) {
        pairingRequested = true;
        await sleep(1500);
        await requestPairing(s);
      }

      if (connectionState === 'connecting') logger.info('Connecting to WhatsApp…');

      if (connectionState === 'open') {
        try { await bindPairedOwner(s,state.creds.me,config); } catch { config.ownerNumber=''; logger.error('Paired owner identity/save failed. Stopping; check auth storage and connected identity.');return shutdown(1); }
        connection(s,true);
        reconnectAttempts = 0;
        pairingAttempts = 0;
        logger.info('WhatsApp connection established');
        pairing?.onLinked().catch(() => {});
      }

      if (connectionState === 'close') {
        connection(s,false);
        const code = lastDisconnect?.error?.output?.statusCode;
        if (stopping) return;
        if (code === DisconnectReason.loggedOut) {
          logger.warn('Logged out from WhatsApp (session removed). Clearing saved login; a new pairing will be needed.');
          await wipeAuth();
          pairingNumber = config.pairingNumber || config.ownerNumber || pairingNumber;
          return setTimeout(() => startWhatsApp().catch((e) => logger.error('Restart failed:', e)), 3000);
        }
        if (code === DisconnectReason.connectionReplaced) {
          logger.error('This session was replaced by another login. Stopping.');
          return shutdown(1);
        }
        if (code === DisconnectReason.badSession) {
          logger.warn('Saved session is corrupted. Clearing it.');
          await wipeAuth();
        }
        reconnectAttempts++;
        const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2000 * 2 ** Math.min(reconnectAttempts, 5));
        logger.warn(`Connection closed (code ${code ?? 'unknown'}). Reconnecting in ${Math.round(delay / 1000)}s…`);
        setTimeout(() => startWhatsApp().catch((e) => logger.error('Reconnect failed:', e)), delay);
      }
    } catch (err) {
      logger.error('connection.update handler failed:', err);
    }
  });

  // Deletes can also arrive as an update with a revoke stub; handle both paths (duplicates are ignored).
  s.ev.on('messages.update', async (updates) => {
    for (const u of updates || []) {
      try {
        if (u?.update?.pollUpdates && u.key?.id) applyPollUpdates(u.key.id, u.update.pollUpdates);
        const stub = u?.update?.messageStubType;
        if ((stub === 1 || stub === 'REVOKE') && u.key?.id) await onRevokeKey(s, u.key);
      } catch (err) { logger.warn('Delete update failed:', err.message); }
    }
  });

  s.ev.on('messages.upsert', async ({ messages, type }) => {
    // Offline/history deliveries are only remembered for recovery, never run as commands.
    if (type !== 'notify') {
      for (const msg of messages || []) { cacheMessage(msg); observe(s, msg).catch(() => {}); }
      return;
    }
    for (const msg of messages) {
      if (proofRelay && !msg.key?.fromMe) { const pt = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''; if (pt.startsWith('JARVIS-PROOF ')) { const who = String(msg.key?.remoteJid || ''); const alt = String(msg.key?.remoteJidAlt || ''); const nj = who.endsWith('@s.whatsapp.net') ? who : alt.endsWith('@s.whatsapp.net') ? alt : ''; proofRelay(pt, nj.split('@')[0]).catch(() => {}); continue; } }
      const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp ?? 0);
      if (ts && Date.now() / 1000 - ts > MAX_MESSAGE_AGE_S) continue; // ignore old/offline backlog
      handleMessage(s, msg).catch((err) => logger.error('Unhandled message error:', err));
    }
  });

  return s;
}

/** Logs the current WhatsApp login out (used by the API session revoke; the owner must pair again). */
export async function logoutSession() { if (!sock) throw new Error('not connected'); await sock.logout(); }

export async function shutdown(exitCode = 0) {
  if (stopping && exitCode === 0) return;
  stopping = true;
  stopOps();
  try {
    sock?.end(undefined);
  } catch {
    /* ignore */
  }
  const { flushDatabase } = await import('../database/database.js');
  await flushDatabase().catch(() => {});
  logger.info('Shut down');
  setTimeout(() => process.exit(exitCode), 200);
}
