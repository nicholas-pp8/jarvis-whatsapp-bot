import {controlCommand} from './_games.js';
import {economy} from '../economy/index.js';import {t} from '../i18n/index.js';
export default {name:'leaderboard',category:'Economy',description:'Virtual economy leaderboard',usage:'leaderboard [games]',async run(ctx){if(ctx.args[0]==='games')return controlCommand('leaderboard').run(ctx);const rows=economy.leaders();await ctx.reply(t(ctx,'leaderboard_title')+'\n'+(rows.length?rows.map(x=>t(ctx,'leaderboard_row',x)).join('\n'):t(ctx,'none')));}};
