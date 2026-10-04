import {addNote,getNote,listNotes,delNote,LIMITS} from '../fun/notes.js';
const HELP='📝 *Notes* (private to you)\n• notes add <name> <text>\n• notes <name>\n• notes list\n• notes del <name>\nTip: use it in a private chat so others do not see your notes.';
export default {name:'notes',aliases:['note','memo'],category:'Utilities',description:'Save and read your personal notes',usage:'notes add <name> <text> | notes <name> | notes list | notes del <name>',
 async run(ctx){
  const u=String(ctx.sender),a=ctx.args||[],sub=(a[0]||'').toLowerCase();
  if(!a.length)return ctx.reply(HELP);
  if(sub==='list'){const l=listNotes(u);return ctx.reply(l.length?'📝 Your notes ('+l.length+'):\n'+l.map(x=>'• '+x).join('\n'):'You have no notes yet. Add one: notes add shopping milk, eggs');}
  if(sub==='add'||sub==='save'){
   if(a.length<3)return ctx.reply('Format: notes add <name> <text>\nExample: notes add wifi password is 1234');
   const r=addNote(u,a[1],a.slice(2).join(' '));
   if(r.error==='LONG')return ctx.reply(`Note too long. Max ${LIMITS.text} characters.`);
   if(r.error==='FULL')return ctx.reply(`You reached ${LIMITS.notes} notes. Delete one first: notes del <name>`);
   if(r.error)return ctx.reply('Could not save that note.');
   return ctx.reply((r.updated?'✏️ Updated':'✅ Saved')+' note "'+a[1].slice(0,LIMITS.name)+'".');
  }
  if(sub==='del'||sub==='delete'||sub==='remove'){
   if(!a[1])return ctx.reply('Format: notes del <name>');
   return ctx.reply(delNote(u,a[1])?'🗑️ Deleted "'+a[1].slice(0,LIMITS.name)+'".':'No note named "'+a[1].slice(0,LIMITS.name)+'".');
  }
  const t=getNote(u,a[0]);
  return ctx.reply(t!==null?'📝 *'+a[0].slice(0,LIMITS.name)+'*\n'+t:'No note named "'+a[0].slice(0,LIMITS.name)+'". See: notes list');
 }};
