import config from '../config/config.js';
import {getState,setEnabled,setMessage,DEFAULT_MESSAGE} from '../autoreply/index.js';
export default {name:'autoreply',aliases:['ar'],category:'Tools',ownerOnly:true,description:'Auto reply when you are busy (DMs and group mentions)',
 usage:'autoreply on|off|status|set <message>|reset',minArgs:0,
 async run(ctx){
  const p=config.prefix;const a=(ctx.args[0]||'status').toLowerCase();
  if(a==='on'||a==='off'){setEnabled(a==='on');return ctx.reply('Auto reply is now '+a.toUpperCase()+(a==='on'?'.\nI will reply once (per person, every 30 min) when someone DMs you or mentions/replies to you in a group.':'.'));}
  if(a==='set'){const m=ctx.args.slice(1).join(' ').trim();if(!m)return ctx.reply('Usage: '+p+'autoreply set <your message>');if(m.length>500)return ctx.reply('Max 500 characters.');setMessage(m);return ctx.reply('✅ Auto reply message saved:\n"'+m+'"\nTurn it on with '+p+'autoreply on');}
  if(a==='reset'){setMessage('');return ctx.reply('Auto reply message reset to default:\n"'+DEFAULT_MESSAGE+'"');}
  if(a==='status'){const s=getState();return ctx.reply('Auto reply: *'+(s.enabled?'ON':'OFF')+'*\nMessage: "'+s.text+'"\n\n'+p+'autoreply on|off\n'+p+'autoreply set <message>\n'+p+'autoreply reset');}
  return ctx.reply('Usage: '+p+'autoreply on|off|status|set <message>|reset');
 }};
