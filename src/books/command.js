import fs from 'node:fs/promises';import crypto from 'node:crypto';import path from 'node:path';import {fileURLToPath}from'node:url';
import {loadEdition,contents,readingPages,label}from'./library.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../assets/books');
const sessions=new Map();const ownerKey=(ctx,id)=>`${ctx.jid}:${ctx.senderJid||ctx.sender}:${id}`;
export function bookCommand(id){return {name:id,category:'Books',description:'Read the complete '+id+' selected edition, with source labels',usage:id+(id==='bible'?' <book-number> <chapter> [verse[-end]]':' <chapter> [verse[-end]]')+' | contents | full | next | prev',async run(ctx){
 const key=ownerKey(ctx,id),args=ctx.args||[];
 try{
  const {index,full}=await loadEdition(root,id);
  const prefix=label(index)+'\n'+(id==='quran'?'Tanzil Project, copyright2007-2021, CC BY3.0; verbatim, https://tanzil.net\n':'');
  if(args[0]==='full'){
   if(args.length!==1)return ctx.reply('Use /'+id+' full');
   if(id==='bible'){const archive=await fs.readFile(path.join(root,'bible','source-html.zip'));const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));if(crypto.createHash('sha256').update(archive).digest('hex')!==manifest.bible.sourceArchiveSha256)throw Error('Source archive integrity failed');return ctx.sock.sendMessage(ctx.jid,{document:archive,mimetype:'application/zip',fileName:'world-english-bible-66-complete-html.zip',caption:prefix+'\nComplete publisher HTML book, including headings/notes. Extract ZIP and open index.htm to read offline. Chapter reading uses base verse text plus source notes.'},{quoted:ctx.msg});}
   return ctx.sock.sendMessage(ctx.jid,{document:full,mimetype:'text/plain',fileName:id+'-'+index.language.split(' ')[0].toLowerCase()+'.txt',caption:prefix+'\nComplete text of this selected edition.'},{quoted:ctx.msg});
  }
  if(!args.length||args[0]==='contents'){
   const toc=id==='bible'?contents(index).map(b=>`${b.number}. ${b.name} (${b.chapters}chapters)`):index.books[0].chapters.map(c=>`${c.number}. ${c.name||'Surah '+c.number} (${c.verses.length}verses)`);
   return ctx.reply(prefix+'\n\n'+toc.join('\n')+'\n\n'+(id==='bible'?'Use /bible book-number chapter verse, e.g. /bible 43 3 16':'Use /'+id+' chapter verse, e.g. /'+id+(id==='gita'?' 2 47':' 1 1'))+'\n/full via /'+id+' full; /'+id+' next or prev continues chapter pages.');
  }
  if(['next','prev'].includes(args[0])){
   const s=sessions.get(key);if(args.length!==1||!s||s.expires<Date.now())return ctx.reply('Reading expired. Open a chapter again.');
   const page=s.page+(args[0]==='next'?1:-1);if(page<0||page>=s.pages.length)return ctx.reply(prefix+'\nNo more pages in this selection. Choose another chapter.');
   s.page=page;return ctx.reply(prefix+'\nPage '+(page+1)+'/'+s.pages.length+'\n\n'+s.pages[page].body);
  }
  const shift=id==='bible'?1:0,book=shift?Number(args[0]):1,chapter=Number(args[shift]);
  if(args.length<shift+1||args.length>shift+2||args.some(x=>!/^\d+(?:-\d+)?$/.test(x)))return ctx.reply('Use /'+id+' contents for references.');
  const range=args[shift+1]?.split('-').map(Number),first=range?.[0]??1,last=range?(range[1]??range[0]):undefined;
  const pages=readingPages(index,{book,chapter,first,last},2200);if(sessions.size>=500)sessions.clear();sessions.set(key,{pages,page:0,expires:Date.now()+1800000});
  await ctx.reply(prefix+'\nPage1/'+pages.length+'\n\n'+pages[0].body+(pages.length>1?'\n\n/'+id+' next for the next page.':''));
 }catch{await ctx.reply('Book unavailable or invalid reference. Use /'+id+' contents. No generated substitute text.');}
}};}
