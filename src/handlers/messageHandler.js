import {resolveSenderIdentity,ownerIdentity} from '../permissions/sender-identity.js';
import {takeApkChoice} from '../commands/apk/selection.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { jidToNumber } from '../utils/helpers.js';
import { handleCommand, parseCommand, registry } from './commandHandler.js';
import { handleStatus } from './statusHandler.js';
import { cacheMessage } from '../utils/msgCache.js';
import { observe } from '../recover/index.js';
import { attachGroups, groupsReady } from '../groups/index.js';
import { moderate } from '../groups/moderation.js';
import { maybeAutoReply } from '../autoreply/index.js';
import { maybeChatMode } from '../chatmodes/index.js';
import { record as logChat } from '../chatlog/index.js';
import { wordchainPlain } from '../commands/wordchain.js';
import { getGame as wordchainActive } from '../fun/wordchain.js';

const processed = new Set();
const botSent = new Set(); // ids of messages this bot sent itself
const MAX_SENT = 500;

/** Wraps sock.sendMessage so the bot can recognise (and ignore) its own replies. */
export function trackOutgoing(sock) {
  try { attachGroups(sock); } catch (err) { logger.error('Group module failed to attach:', err); }
  const original = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const noCache=!!args[2]?.jarvisNoCache;
    if(noCache){args[2]={...args[2]};delete args[2].jarvisNoCache;}
    const res = await original(...args);
    if(!noCache)cacheMessage(res);
    if (res?.key?.id) {
      botSent.add(res.key.id);
      if (botSent.size > MAX_SENT) botSent.delete(botSent.values().next().value);
    }
    return res;
  };
}
const MAX_PROCESSED = 2000;

/** Unwraps ephemeral/view-once/edited wrappers and returns the plain text of a message. */
export function extractText(message) {
  if (!message) return '';
  const m =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.documentWithCaptionMessage?.message ||
    message.editedMessage?.message?.protocolMessage?.editedMessage ||
    message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
}

export function classify(msg) {
  const jid = msg.key.remoteJid || '';
  if (jid === 'status@broadcast') return 'status';
  if (msg.key.fromMe) return 'self';
  if (jid.endsWith('@g.us')) return 'group';
  if (jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return 'ignore';
  return 'private';
}

function senderOf(msg, kind) {
  const raw = kind === 'group' ? msg.key.participantAlt || msg.key.participant : msg.key.remoteJidAlt || msg.key.remoteJid;
  return raw || msg.key.remoteJid;
}

export async function handleMessage(sock, msg) {
  try {
    if (!msg?.message || !msg.key?.id) return;
    if(msg.key.fromMe&&botSent.has(msg.key.id))return;
    cacheMessage(msg);
    observe(sock, msg).catch(() => {});
    const kind = classify(msg);
    if (kind === 'status') return handleStatus(sock, msg);
    if (kind === 'ignore') return;
    // Messages sent by the bot itself are never processed. Messages typed by the
    // owner from the linked phone also arrive as fromMe, so those are allowed through
    // (only when they are commands and were not produced by this bot).
    if (kind === 'self' && botSent.has(msg.key.id)) return;
    if (kind === 'group' && !config.allowGroups) return;

    const dedupeId = `${msg.key.remoteJid}:${msg.key.id}`;
    if (processed.has(dedupeId)) return;
    processed.add(dedupeId);
    if (processed.size > MAX_PROCESSED) processed.delete(processed.values().next().value);

const text = extractText(msg.message);
    if (kind === 'group' && !msg.key.fromMe) {
      // Optional moderation and activity counting; never blocks or crashes command handling.
      await groupsReady().catch(() => {});
      const owners = [config.ownerNumber, jidToNumber(sock.user?.id || '')].filter(Boolean);
      const who = jidToNumber(msg.key.participantAlt || msg.key.participant || '');
      await moderate(sock, msg, owners.includes(who));
    }
    let parsed = parseCommand(text);
    if (!parsed && !msg.key.fromMe && text && (kind === 'group' || kind === 'private')) logChat(msg.key.remoteJid, msg.pushName || jidToNumber(senderOf(msg, kind)), text);
    if(!parsed){const senderJid=kind==='self'?sock.user?.id||msg.key.remoteJid:senderOf(msg,kind);const choice=takeApkChoice(msg.key.remoteJid,jidToNumber(senderJid),text);if(choice)parsed={name:'apk',args:[choice.packageName]};}
    if (!parsed && kind === 'group' && wordchainActive(msg.key.remoteJid)) { const id = await resolveSenderIdentity(sock, msg, kind); await wordchainPlain({ sock, msg, jid: msg.key.remoteJid, sender: id.phoneNumber || jidToNumber(id.senderJid), text }); return; }
    if (!parsed) { if (kind === 'group' || kind === 'private') { if (await maybeChatMode(sock, msg, kind, text)) return; await maybeAutoReply(sock, msg, kind, text); } return; } // normal chatter and bare URLs are ignored

    const jid = msg.key.remoteJid;
    const identity = await resolveSenderIdentity(sock,msg,kind);
    const senderJid = identity.senderJid;
    const sender = identity.phoneNumber || jidToNumber(senderJid);
    if (kind === 'self') msg.fromOwnPhone = true;
    const ctx = {
      sock,
      msg,
      jid,
      sender,
      senderJid,
      text,
      args: [],
      isGroup: jid.endsWith('@g.us'),
      isOwner: ownerIdentity(identity,kind,config.ownerNumber,sock.user?.id || ''),
      commands: registry,
      reply: (content) => sock.sendMessage(jid, { text: content }, { quoted: msg }),
    };
    await handleCommand(ctx, parsed);
  } catch (err) {
    logger.error('Message handling failed:', err);
  }
}
