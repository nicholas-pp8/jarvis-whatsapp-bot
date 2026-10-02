import {t,preference} from '../i18n/index.js';
import {isSudo} from '../permissions/index.js';
export default {name:'checksudo',category:'Permissions',description:'Check your own permission status',usage:'checksudo',async run(ctx){if(preference(ctx)!=='eng'){await ctx.reply(t(ctx,'desc_checksudo')+': '+(ctx.isOwner?'owner':isSudo(ctx)?'sudo':'user'));return;}await ctx.reply(ctx.isOwner?'You are the primary owner.':isSudo(ctx)?'You are a sudo user with full command access.':'You are a regular user.');}};
