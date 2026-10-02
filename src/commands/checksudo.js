import {isSudo} from '../permissions/index.js';
export default {name:'checksudo',category:'Permissions',description:'Check your own permission status',usage:'checksudo',async run(ctx){await ctx.reply(ctx.isOwner?'You are the primary owner.':isSudo(ctx)?'You are a sudo user with full command access.':'You are a regular user.');}};
