import {privateOperator,selfChat} from '../utilities/owner.js';
import {reminders} from '../ops/index.js';import {deadline} from '../utilities/time.js';
const pending=new Map();
export default {name:'remind',category:'Utilities',ownerOnly:true,description:'Reviewed owner self-chat reminders',usage:'remind add YYYY-MM-DDTHH:mm Asia/Kolkata <text> | list | cancel <id> | confirm <code>',async run(ctx){
 if(!privateOperator(ctx))return ctx.reply('Use the owner self-chat or your sudo private DM');
 const recipient=selfChat(ctx)?null:ctx.senderJid.split(':')[0].split('@')[0]+'@s.whatsapp.net';
 const [action,...args]=ctx.args;
 if(action==='list')return ctx.reply(reminders.jobs.filter(j=>(j.recipient||null)===recipient).map(j=>`${j.id}: ${new Date(j.at).toISOString()} - ${j.text}${j.state!=='waiting'?' (delivery uncertain after interrupted send)':''}`).join('\n')||'No reminders');
 if(action==='cancel'){reminders.cancel(args[0],recipient);return ctx.reply('Reminder cancelled');}
 if(action==='confirm'){const p=pending.get(ctx.sender);if(!p||p.code!==args[0]||p.expires<Date.now())throw new Error('Run remind add again and review the exact reminder');const j=reminders.create(p.text,p.at,recipient);pending.delete(ctx.sender);return ctx.reply(`Saved reminder ${j.id}`);}
 if(action!=='add'||args.length<3)throw new Error('Use remind add YYYY-MM-DDTHH:mm Asia/Kolkata <text>');
 const at=deadline(args[0],args[1]),text=args.slice(2).join(' ');if(at<=Date.now()||at-Date.now()>90*86400000||!text||text.length>1000)throw new Error('Use 1-1000 characters and a future time within 90 days');
 const code=(await import('node:crypto')).randomBytes(3).toString('hex');pending.set(ctx.sender,{at,text,code,expires:Date.now()+600000});
 return ctx.reply(`Review reminder\nDestination: your own private chat\nTime: ${args[0]} ${args[1]}\nText: ${text}\nConfirm within 10 minutes: ${(await import('../config/config.js')).default.prefix}remind confirm ${code}`);
}};
