import {fetchHTML,extractHTML} from '../utilities/web.js';
export default {name:'html',category:'Utilities',description:'Extract text from a public HTML page',usage:'html <URL>',minArgs:1,async run(ctx){const p=extractHTML((await fetchHTML(ctx.args[0])).body);await ctx.reply([p.title,p.description,p.text].filter(Boolean).join('\n'));}};
