import {ownerCommandContext} from '../utilities/owner.js';
import {count as telemetryCount} from '../telemetry/client.js';
import {rt} from '../i18n/runtime.js';
import {t} from '../i18n/index.js';import {replyFailure} from '../recovery/reply.js';
import {permitted,fullAccess} from '../permissions/index.js';
import {commandOn} from '../auth/features.js';
import {ownerGate} from '../auth/gate.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {usage} from '../ops/index.js';
import {quotedMediaMissing,MISSING_MEDIA_HINT} from '../utils/imageTools.js';
const QUOTED_MEDIA_CMDS=new Set(['sticker','toimg','removebg','resize','compress','ocr','animate','editimg','upscale','remini','restore','sharpen','denoise','facefix','depth','describe','ratemy','caption','anime']);
import { recordCommand } from '../database/database.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'commands');

class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
  }
  register(cmd) {
    if (!cmd?.name || typeof cmd.run !== 'function') throw new Error('Invalid command module');
    cmd.category ||= 'Other';
    cmd.usage ||= cmd.name;
    cmd.description ||= '';
    this.commands.set(cmd.name, cmd);
    for (const a of cmd.aliases || []) this.aliases.set(a, cmd.name);
  }
  get(name) {
    return this.commands.get(name) || this.commands.get(this.aliases.get(name));
  }
  list() {
    return [...this.commands.values()];
  }
}

import { lookup as customReply } from '../custom/index.js';
export const commandLoadFailures=[];
export const registry = new CommandRegistry();

/** Loads every command module in src/commands automatically (skips files starting with "_"). */
export async function loadCommands() {
  for (const f of (await fs.readdir(dir)).sort()) {
    if (!f.endsWith('.js') || f.startsWith('_')) continue;
    try {
      const mod = await import(pathToFileURL(path.join(dir, f)).href);
      registry.register(mod.default);
    } catch (err) {
      commandLoadFailures.push(f.replace(/\.js$/,''));
      logger.error(`Failed to load command file ${f}:`, err);
    }
  }
  logger.info(`Loaded ${registry.list().length} commands`);
}

const SMALL_CAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ';
const foldSmallCaps = (t) => [...t].map((ch) => { const i = SMALL_CAPS.indexOf(ch); return i === -1 ? ch : String.fromCharCode(97 + i); }).join('');

/** Splits "/cmd arg1 arg2" into { name, args } or returns null when it is not a command. */
export function parseCommand(text) {
  if (!text) return null;
  let used = config.prefix;
  // Escape hatch: "/setprefix ..." always works, so a bad prefix can never lock the owner out.
  if (!text.startsWith(used) && /^\/setprefix(\s|$)/i.test(text)) used = '/';
  if (!text.startsWith(used)) return null;
  const body = text.slice(used.length).trim();
  if (!body) return null;
  const [first, ...rest] = body.split(/\s+/);
  const name = foldSmallCaps(first.toLowerCase());
  if (!/^[a-z0-9_]{1,30}$/.test(name)) return null;
  return { name, args: rest };
}

const lastUse = new Map();
const utilityUse=new Map();

export async function handleCommand(ctx, parsed) {
  let cmd = registry.get(parsed.name);
  if (!cmd) {
    // Custom chat commands run through the SAME gates as built-ins (owner-only mode, permissions, switch-off, cooldowns) as a virtual command named "custom".
    const custom = customReply(ctx.jid, parsed.name, ctx.msg?.pushName);
    if (!custom) {
      logger.warn(`Unknown command: ${parsed.name.slice(0, 30)}`);
      return ctx.reply(t(ctx,'unknown'));
    }
    cmd = { name: 'custom', category: 'Custom', requiredLevel: 'user', usage: 'custom', description: '', minArgs: 0, virtual: true, run: (c) => c.reply(custom) };
  }
  if (config.ownerOnly && !fullAccess(ctx)) return;
  if(!await permitted(ctx,cmd))return ctx.reply(t(ctx,'permission',{level:rt(ctx,'role_'+(cmd.ownerOnly?'owner':cmd.requiredLevel||'user'))}));

  if(!commandOn(cmd))return ctx.reply(`${config.prefix}${cmd.name} is switched off by the owner.`);
  if(!await ownerGate(ctx,cmd))return;
  ctx = ownerCommandContext(ctx,cmd);
  const now = Date.now();
  if (config.limits.cooldownMs && !ctx.isOwner) {
    const prev = lastUse.get(ctx.sender) || 0;
    if (now - prev < config.limits.cooldownMs) return ctx.reply(t(ctx,'cooldown',{seconds:Math.ceil((config.limits.cooldownMs-(now-prev))/1000)}));
    lastUse.set(ctx.sender, now);
    if (lastUse.size > 5000) lastUse.clear();
  }

  if(['Utilities','Games','Permissions'].includes(cmd.category)){const key=ctx.sender;const prev=utilityUse.get(key)||0;if(now-prev<3000)return ctx.reply(t(ctx,'cooldown',{seconds:3}));utilityUse.set(key,now);if(utilityUse.size>5000)utilityUse.clear();}
  ctx.args = parsed.args; ctx.commandName = parsed.name;
  if ((cmd.minArgs || 0) > ctx.args.length) {
    return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:cmd.usage}));
  }
  if(QUOTED_MEDIA_CMDS.has(cmd.name)&&quotedMediaMissing(ctx.msg))return ctx.reply(MISSING_MEDIA_HINT);
  logger.info(`Command received: ${config.prefix}${cmd.name}`);
  recordCommand(cmd.name);
  usage.record(cmd.name,{owner:ctx.isOwner});telemetryCount(cmd.name);
  try {
    await cmd.run(ctx);
  } catch (err) {
    usage.record(cmd.name,{error:true});
    await replyFailure(ctx,cmd.name,err);
  }
}
