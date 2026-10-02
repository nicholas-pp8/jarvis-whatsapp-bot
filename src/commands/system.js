import {systemStats} from '../utilities/system.js';
export default {name:'system',aliases:['stats'],category:'Utilities',ownerOnly:true,description:'Non-sensitive server statistics',usage:'system',async run(ctx){if(ctx.isGroup)return ctx.reply('Use a private chat for server statistics');await ctx.reply(await systemStats());}};
