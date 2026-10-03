import {rt} from '../i18n/runtime.js';
import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import {privateOperator} from '../utilities/owner.js';
import config from '../config/config.js';import {updater,notify} from '../ops/index.js';import {shutdown} from '../connection/whatsapp.js';
export default {name:'update',category:'WhatsApp',ownerOnly:true,description:'Review and confirm a GitHub update',usage:'update [confirm <commit>]',async run(ctx){
 if(!privateOperator(ctx)){await ctx.reply(t(ctx,'permission',{level:rt(ctx,'role_private_operator')}));return;}
 if(ctx.args[0]==='confirm'){
  if(ctx.args.length!==2){await ctx.reply(rt(ctx,'update_confirm_usage',{prefix:config.prefix}));return;}
  try{const r=await updater.install(ctx.args[1]);await notify(rt(ctx,'update_restarting',{version:r.version}));await shutdown(0);}catch(e){await replyFailure(ctx,'update',e);}return;
 }
 try{const n=await updater.check(true);await ctx.reply(n?rt(ctx,'update_review',{version:n.version,commit:n.sha,notes:n.notes,prefix:config.prefix}):rt(ctx,'update_current'));}catch(e){await replyFailure(ctx,'update',e);}
}};
