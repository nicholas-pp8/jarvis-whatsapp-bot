import config from '../config/config.js';
import logger from '../utils/logger.js';
import {makeLimiter,translateText} from '../services/publicAi.js';
const limiter=makeLimiter('TRANSLATE','TRANSLATE_PER_HOUR',120,2);
const users=new Map();
function userLimit(u,now=Date.now()){const a=(users.get(u)||[]).filter(t=>now-t<60000);if(a.length>=5)return false;users.set(u,[...a,now]);if(users.size>5000)users.clear();return true;}
export const LANGS={en:'English',english:'English',hi:'Hindi',hindi:'Hindi',es:'Spanish',spanish:'Spanish',fr:'French',french:'French',de:'German',german:'German',it:'Italian',italian:'Italian',pt:'Portuguese',portuguese:'Portuguese',ru:'Russian',russian:'Russian',ar:'Arabic',arabic:'Arabic',ur:'Urdu',urdu:'Urdu',bn:'Bengali',bengali:'Bengali',zh:'Chinese',chinese:'Chinese',ja:'Japanese',japanese:'Japanese',ko:'Korean',korean:'Korean',tr:'Turkish',turkish:'Turkish',id:'Indonesian',indonesian:'Indonesian',nl:'Dutch',dutch:'Dutch',sv:'Swedish',swedish:'Swedish',pl:'Polish',polish:'Polish',vi:'Vietnamese',vietnamese:'Vietnamese',th:'Thai',thai:'Thai',fa:'Persian',persian:'Persian',el:'Greek',greek:'Greek',he:'Hebrew',hebrew:'Hebrew',ta:'Tamil',tamil:'Tamil',te:'Telugu',telugu:'Telugu',mr:'Marathi',marathi:'Marathi'};
export function parseTranslate(args,quoted=''){
  const a=[...(args||[])];let to='English';
  if(a.length&&LANGS[a[0].toLowerCase()]){to=LANGS[a.shift().toLowerCase()];}
  else if(!a.length&&!quoted)return {error:'usage'};
  const text=(a.join(' ').trim()||quoted||'').trim().slice(0,1500);
  return text?{to,text}:{error:'usage'};
}
function quotedText(msg){const m=msg.message||{};const q=m.extendedTextMessage?.contextInfo?.quotedMessage;return q?.conversation||q?.extendedTextMessage?.text||q?.imageMessage?.caption||q?.videoMessage?.caption||'';}
export default {name:'translate',aliases:['tr','trans'],category:'AI',description:'Translate text (free public AI)',usage:'translate <language> <text>  or reply: translate <language>',
async run(ctx){
  const p=parseTranslate(ctx.args,quotedText(ctx.msg));
  if(p.error)return ctx.reply('Usage: '+config.prefix+'translate hindi Good morning\nOr reply to a message: '+config.prefix+'translate english\nLanguages: '+[...new Set(Object.values(LANGS))].join(', ')+'.');
  if(!userLimit(ctx.sender))return ctx.reply('Limit: 5 translations per minute. Try again shortly.');
  if(!limiter.ok())return ctx.reply('Translation is busy or turned off right now. Try again in a minute.');
  try{
    const out=await limiter.run(()=>translateText(p.text,'Auto Detect',p.to,{timeoutMs:30000}));
    await ctx.reply('*'+p.to+'*\n'+out+'\n\n_Machine translation by a free public AI service (Helsinki-NLP on Hugging Face); quality varies, your text was sent to it._');
  }catch(e){logger.warn('translate failed: '+(e?.message||'error'));await ctx.reply('Translation failed (that language pair may be unsupported, or the free service is busy). Try again.');}
}};
