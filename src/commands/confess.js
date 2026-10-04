const last=new Map();
export const COOLDOWN_MS=60000, MAX_LEN=500;
export default {name:'confess',aliases:['confession'],category:'Games',description:'Post an anonymous confession to the group',usage:'confess <your confession>',minArgs:1,
 async run(ctx){
  if(!ctx.isGroup)return ctx.reply('Use /confess inside the group where you want to post.');
  const text=(ctx.args||[]).join(' ').replace(/\s+/g,' ').trim();
  if(text.length<3)return ctx.reply('Write your confession after the command.');
  if(text.length>MAX_LEN)return ctx.reply(`Too long. Keep it under ${MAX_LEN} characters.`);
  const now=Date.now(),prev=last.get(ctx.sender)||0;
  if(now-prev<COOLDOWN_MS)return ctx.reply('Please wait a minute before sending another confession.');
  last.set(ctx.sender,now);if(last.size>2000)last.clear();
  try{
   // Remove the command message so the sender is not shown (works when the bot is a group admin).
   if(ctx.msg?.key)await ctx.sock.sendMessage(ctx.jid,{delete:ctx.msg.key}).catch(()=>{});
   await ctx.sock.sendMessage(ctx.jid,{text:`🤫 *Anonymous Confession*\n\n"${text}"\n\n_Sent anonymously via the bot._`});
  }catch{last.delete(ctx.sender);return ctx.reply('Could not post the confession right now. Try again.');}
 }};
