import {pick} from '../games/engine.js';import {answers} from '../games/data.js';
export default {name:'8ball',category:'Games',description:'Playful random answer, not advice',usage:'8ball <question>',minArgs:1,async run(ctx){if(ctx.args.join(' ').length>300)throw new Error('Question must be under 300 characters');await ctx.reply('For fun: '+pick(answers));}};
