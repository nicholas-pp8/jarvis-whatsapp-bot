import {getNews,formatNews,topicList} from '../fun/news.js';
import {makeRate} from '../fun/limiter.js';
const rate=makeRate(5);
export default {name:'news',aliases:['headlines'],category:'Utilities',description:'Latest news headlines (India by default)',usage:'news [india|world|tech|sports|business|entertainment|science|health|<topic>]',
 async run(ctx){
  if(!rate(ctx.sender))return ctx.reply('Slow down - max 5 news requests per minute.');
  const arg=(ctx.args||[]).join(' ').trim();let items;
  try{items=await getNews(arg);}catch{return ctx.reply('News service is busy right now. Try again in a minute.');}
  if(!items.length)return ctx.reply('No news found for "'+arg.slice(0,40)+'". Topics: '+topicList().join(', '));
  return ctx.reply(formatNews(arg?arg[0].toUpperCase()+arg.slice(1,40):'India',items));
 }};
