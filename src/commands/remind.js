import {reminders} from '../ops/index.js';
import config from '../config/config.js';
import {parseReminder,formatWhen} from '../utilities/naturalTime.js';
const PER_USER=5;
const who=(ctx)=>String(ctx.senderJid||ctx.sender||'').split(':')[0].split('@')[0];
const mine=(ctx)=>reminders.jobs.filter((j)=>j.owner===who(ctx)&&j.state==='waiting');
export default {name:'remind',aliases:['reminder','remindme'],category:'Utilities',description:'Set a reminder in plain words (works for everyone)',
 usage:'remind 30m drink water | remind 6pm call mom | remind tomorrow 9am gym | remind list | remind cancel <id>',minArgs:1,
 async run(ctx){
  const p=config.prefix;const [a,...rest]=ctx.args;const act=a.toLowerCase();
  if(act==='list'){const l=mine(ctx).sort((x,y)=>x.at-y.at);return ctx.reply(l.length?'⏰ Your reminders:\n'+l.map((j)=>`${j.id}: ${formatWhen(j.at)} - ${j.text.slice(0,80)}`).join('\n')+'\n\nCancel: '+p+'remind cancel <id>':'You have no active reminders.');}
  if(act==='cancel'||act==='delete'){const id=rest[0];if(!id)return ctx.reply('Usage: '+p+'remind cancel <id> (see '+p+'remind list)');if(!mine(ctx).some((j)=>j.id===id))return ctx.reply('No reminder of yours with that id.');reminders.cancel(id);return ctx.reply('✅ Reminder cancelled.');}
  const r=parseReminder(ctx.args);
  if(!r)return ctx.reply('Tell me when and what. Examples:\n'+p+'remind 30m drink water\n'+p+'remind 6pm call mom\n'+p+'remind tomorrow 9am gym\n'+p+'remind monday 10am meeting');
  if(r.error==='min')return ctx.reply('Minimum is 1 minute.');
  if(r.error==='time')return ctx.reply('I could not read the time. Try: 30m, 2h, 6pm, 18:30, tomorrow 9am, monday 10am.');
  if(r.error==='text')return ctx.reply('What should I remind you about? Example: '+p+'remind 6pm call mom');
  if(r.text.length>300)return ctx.reply('Reminder text: max 300 characters.');
  if(r.at-Date.now()>90*86400000)return ctx.reply('Max 90 days ahead.');
  if(mine(ctx).length>=PER_USER)return ctx.reply('You already have '+PER_USER+' active reminders. Cancel one first ('+p+'remind list).');
  const to=ctx.jid;const text=ctx.isGroup?`@${who(ctx)}: ${r.text}`:r.text;
  try{const j=reminders.create(text,r.at,to,who(ctx));return ctx.reply(`✅ Reminder set for ${formatWhen(r.at)}\n"${r.text}"\nid: ${j.id}`+(ctx.isGroup?'\n_It will be posted in this group._':''));}
  catch(e){return ctx.reply('Could not save the reminder: it may be too many reminders on the bot right now. Try again later.');}
 }};
