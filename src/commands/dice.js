import crypto from 'node:crypto';import {pick} from '../games/engine.js';import {jokes,quotes,facts} from '../games/data.js';
export default {name:'dice',category:'Games',description:'Roll one six-sided die',usage:'dice',async run(ctx){await ctx.reply('Dice: '+crypto.randomInt(1,7));}};
