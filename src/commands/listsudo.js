import {t,preference} from '../i18n/index.js';
import {sudoList} from '../permissions/index.js';
export default {name:'listsudo',category:'Permissions',ownerOnly:true,description:'List limited sudo users privately',usage:'listsudo',async run(ctx){if(ctx.isGroup)return ctx.reply(t(ctx,'permission',{level:'private owner'}));await ctx.reply(sudoList().map(j=>'+'+j.split('@')[0]).join('\n')||(preference(ctx)==='eng'?'No sudo users':t(ctx,'none')));}};
