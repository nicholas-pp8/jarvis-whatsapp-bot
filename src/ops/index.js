import fs from 'node:fs';import path from 'node:path';
import config from '../config/config.js';import {Updater,healthy} from './update.js';
import {prune} from '../recover/store.js';
import {Usage} from './usage.js';import {Health} from './health.js';
import {cleanupStaleJobs} from '../utils/fileManager.js';
export const usage=new Usage(path.join(config.paths.data,'usage.json'));
export const updater=new Updater(config.root,config.paths.data);
const health=new Health();let socket=null;let online=false;let pendingOffline=false;let running=false;let started=false;let timer=null;let healthTimer=null;
const file=path.join(config.paths.data,'ops.json');let state={};try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
function save(){try{fs.mkdirSync(config.paths.data,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);}catch{}}
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function recordError(){health.error();}
export function connection(sock,up){socket=sock;online=up;globalThis.__jarvisWA=up?'online':'offline';clearTimeout(healthTimer);if(up){healthTimer=setTimeout(()=>{if(online)healthy(config.paths.data).catch(()=>{});},30000);healthTimer.unref();}}
function ownChat(){const digits=String(socket?.user?.id||'').split('@')[0].split(':')[0];return digits&&(!config.ownerNumber||digits===config.ownerNumber)?digits+'@s.whatsapp.net':null;}
export async function notify(text){const to=ownChat();if(!online||!to)return false;try{await socket.sendMessage(to,{text:'Jarvis\n'+text});return true;}catch{return false;}}
function number(file){try{const v=fs.readFileSync(file,'utf8').trim();return v==='max'?0:Number(v);}catch{return 0;}}
export function resources(){const current=number('/sys/fs/cgroup/memory.current'),limit=number('/sys/fs/cgroup/memory.max');let diskBytes=0;try{const s=fs.statfsSync(config.root);diskBytes=Number(s.bsize)*Number(s.bavail);}catch{}return {rss:process.memoryUsage().rss,ramRatio:limit?current/limit:0,diskBytes};}
export function report(title='Usage report',days=7){const s=usage.summary(days),fmt=rows=>rows.slice(0,5).map(([n,c])=>`${config.prefix}${n}: ${c}`).join(', ')||'none';return `${title}\nCommands: ${s.total}\nTop: ${fmt(s.top)}\nCommand errors: ${fmt(s.errors)}`;}
export async function tick(){if(running)return;running=true;try{
 const r=resources();let ownSize=0;
 if(!state.cleanupAt||Date.now()-state.cleanupAt>600000){await cleanupStaleJobs();prune();state.cleanupAt=Date.now();}
 // Shared host limit supplied explicitly, never confuse filesystem free space with the panel quota.
 const quota=Number(process.env.HOST_DISK_LIMIT_MB)||0;let diskRatio=0;
 if(quota&&(!state.diskCheckedAt||Date.now()-state.diskCheckedAt>600000)){const {dirSize}=await import('../utils/fileManager.js');ownSize=await dirSize(config.root);state.diskRatio=ownSize/(quota*1048576);state.diskCheckedAt=Date.now();}diskRatio=state.diskRatio||0;
 const issues=health.check({online,ramRatio:r.ramRatio,diskRatio});
 for(const issue of issues){
  if(issue==='offline'){pendingOffline=true;health.mark(issue);continue;}
  if(issue==='disk')await cleanupStaleJobs();
  const msg={errors:'Repeated errors detected. Recent failures are recorded; no source code changed.',ram:'Shared host RAM stayed above 90% for three checks. No process was killed.',disk:'Jarvis files are near the configured quota. Only stale job folders were cleaned.'}[issue];
  if(await notify(msg))health.mark(issue);
 }
 if(pendingOffline&&online&&await notify('WhatsApp connection recovered after a sustained disconnect. Alerts cannot arrive while WhatsApp is disconnected.'))pendingOffline=false;
 const today=date();const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}).format(new Date()));
 if(online&&hour>=Math.min(23,Math.max(0,Number(process.env.OPS_REPORT_HOUR??10)))&&state.daily!==today&&await notify(`Daily self-check\nWhatsApp: online\nBot RAM: ${(r.rss/1048576).toFixed(1)} MiB\n`+report('Today',1))){state.daily=today;save();}
 if(online){try{const next=await updater.check();if(next&&state.updateNotified!==next.sha&&await notify(`New update: v${next.version}\nCommit: ${next.sha}\n${next.notes}\nUse ${config.prefix}update to review and confirm.`)){state.updateNotified=next.sha;save();}}catch{/* GitHub offline/rate-limit: no repeated alerts */}}
 try{const resultFile=path.join(config.paths.data,'update-result.json');const r=JSON.parse(fs.readFileSync(resultFile,'utf8'));if(await notify(r.ok?`Update v${r.version} is online.`:`Update v${r.version} failed health checks. Previous source restored.`))fs.unlinkSync(resultFile);}catch{}
 const weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',weekday:'long'}).format(new Date());
 if(online&&weekday==='Sunday'&&hour>=Math.min(23,Math.max(0,Number(process.env.OPS_REPORT_HOUR??10)))&&state.weekly!==today&&await notify(report('Weekly usage',7))){state.weekly=today;save();}
 }finally{running=false;}}
export function start(){if(started)return;started=true;timer=setInterval(()=>tick().catch(()=>{}),60000);timer.unref?.();}
export function stop(){clearInterval(timer);clearTimeout(healthTimer);started=false;usage.flush();}
