import {selfChat} from '../utilities/owner.js';
import config from '../config/config.js';import {updater,notify} from '../ops/index.js';import {shutdown} from '../connection/whatsapp.js';
export default {name:'update',category:'WhatsApp',ownerOnly:true,description:'Review and confirm a GitHub update',usage:'update [confirm <commit>]',async run(ctx){
 if(!selfChat(ctx)){await ctx.reply('Run this command in your own self-chat from the linked phone.');return;}
 if(ctx.args[0]==='confirm'){
  if(ctx.args.length!==2){await ctx.reply(`Usage: ${config.prefix}update confirm <full commit SHA>`);return;}
  try{const r=await updater.install(ctx.args[1]);await notify(`Installed v${r.version}. Restarting only Jarvis now.`);await shutdown(0);}catch(e){await ctx.reply(`Update stopped: ${e.message}`);}return;
 }
 try{const n=await updater.check(true);await ctx.reply(n?`Update v${n.version}\nCommit: ${n.sha}\n${n.notes}\n\nSame dependency versions only. Auth, data and config stay unchanged.\nConfirm within 10 minutes:\n${config.prefix}update confirm ${n.sha}`:'Jarvis is up to date.');}catch(e){await ctx.reply(`Update check stopped: ${e.message}`);}
}};
