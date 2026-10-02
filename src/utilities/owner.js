import {isSudo} from '../permissions/index.js';
/** PN and LID are different namespaces. Strip device suffixes, never compare bare digits. */
const typedJid=value=>typeof value==='string'&&/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(value)?value.replace(/:\d+@/,'@'):null;
export function selfChat(ctx){
 if(!ctx.isOwner||ctx.isGroup||!ctx.msg?.key?.fromMe)return false;
 const own=new Set([typedJid(ctx.sock?.user?.id),typedJid(ctx.sock?.user?.lid)].filter(Boolean));
 const destination=typedJid(ctx.jid);
 if(destination&&own.has(destination))return true;
 // Only use the provider's alternate destination for this very same message/chat.
 if(ctx.msg.key.remoteJid!==ctx.jid)return false;
 const alternate=typedJid(ctx.msg.key.remoteJidAlt);
 return !!alternate&&own.has(alternate);
}
export function privateOperator(ctx){return selfChat(ctx)||(!ctx.isGroup&&isSudo(ctx)&&!ctx.msg?.key?.fromMe&&ctx.msg?.key?.remoteJid===ctx.jid&&/^\d+@(lid|s\.whatsapp\.net)$/.test(ctx.jid));}
