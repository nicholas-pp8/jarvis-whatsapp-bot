import {isSudo} from '../permissions/index.js';
import {jidToNumber} from '../utils/helpers.js';
export function selfChat(ctx){return !!ctx.isOwner&&!ctx.isGroup&&!!ctx.msg?.key?.fromMe&&jidToNumber(ctx.jid)===jidToNumber(ctx.sock?.user?.id||'');}

export function privateOperator(ctx){return selfChat(ctx)||(!ctx.isGroup&&isSudo(ctx)&&!ctx.msg?.key?.fromMe&&ctx.msg?.key?.remoteJid===ctx.jid&&/^\d+@(lid|s\.whatsapp\.net)$/.test(ctx.jid));}
