import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import config from '../config/config.js';
export const MODES=['power','balanced','save'];
export function hostBudget(){let memory=os.totalmem(),cores=os.availableParallelism?.()||os.cpus().length;for(const p of ['/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory/memory.limit_in_bytes'])try{const n=Number(fs.readFileSync(p,'utf8').trim());if(n>0)memory=Math.min(memory,n);}catch{}try{const [q,p]=fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim().split(/\s+/);if(q!=='max')cores=Math.min(cores,Number(q)/Number(p));}catch{try{const q=Number(fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_quota_us','utf8')),p=Number(fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_period_us','utf8'));if(q>0&&p>0)cores=Math.min(cores,q/p);}catch{}}return{memory,cores};}
export function modeProfile(mode,budget=hostBudget()){if(!MODES.includes(mode))throw Error('Invalid performance mode.');const small=budget.memory<512*1048576||budget.cores<1;return Object.freeze({mode,concurrency:mode==='power'&&!small?2:1,ffmpegThreads:mode==='power'&&!small?Math.min(2,Math.max(1,Math.floor(budget.cores))):1,delayMs:mode==='save'?3000:0,sharpCacheMB:mode==='save'?0:mode==='power'&&!small?64:small?16:50,sharpThreads:mode==='power'&&!small?2:1,limited:mode==='power'&&small});}
export class ModeStore{
 constructor(file,budget=hostBudget()){this.file=file;this.budget=budget;this.mode='balanced';this.corrupt=false;try{const j=JSON.parse(fs.readFileSync(file,'utf8'));if(!MODES.includes(j.mode))throw Error('Invalid saved mode');this.mode=j.mode;}catch(e){if(e.code!=='ENOENT')this.corrupt=true;}}
 get profile(){return modeProfile(this.mode,this.budget);}
 set(mode){if(!MODES.includes(mode))throw Error('Invalid performance mode.');if(this.corrupt)throw Error('Mode settings damaged; repair the settings file before changing mode.');fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify({mode}),{mode:0o600});fs.renameSync(tmp,this.file);}catch(e){try{fs.unlinkSync(tmp);}catch{}throw Error('Settings store unavailable; mode not changed.');}this.mode=mode;return this.profile;}
}
export const performanceMode=new ModeStore(path.join(config.paths.data,'performance-mode.json'));
export const getPerformanceProfile=()=>performanceMode.profile;
function applySharp(){const p=getPerformanceProfile();sharp.concurrency(p.sharpThreads);sharp.cache({memory:p.sharpCacheMB,files:0,items:p.mode==='save'?0:50});}
applySharp();
export function setPerformanceMode(mode){const p=performanceMode.set(mode);applySharp();return p;}
export const mediaDelay=()=>new Promise(r=>setTimeout(r,getPerformanceProfile().delayMs));
