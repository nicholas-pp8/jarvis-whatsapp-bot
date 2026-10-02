import {sudoList} from '../permissions/index.js';
export default {name:'listsudo',category:'Permissions',ownerOnly:true,description:'List limited sudo users privately',usage:'listsudo',async run(ctx){if(ctx.isGroup)return ctx.reply('Use your private self-chat for the sudo list');await ctx.reply(sudoList().map(j=>'+'+j.split('@')[0]).join('\n')||'No sudo users');}};
