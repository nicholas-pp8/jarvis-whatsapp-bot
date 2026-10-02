import {economy} from '../economy/index.js';import {t} from '../i18n/index.js';
export default {name:'leaderboard',category:'Economy',description:'Virtual economy leaderboard',usage:'leaderboard',async run(ctx){const rows=economy.leaders();await ctx.reply(t(ctx,'leaderboard_title')+'\n'+(rows.length?rows.map(x=>t(ctx,'leaderboard_row',x)).join('\n'):t(ctx,'none')));}};
