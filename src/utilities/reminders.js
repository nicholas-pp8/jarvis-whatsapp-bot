import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export class Reminders {
 constructor(file,send,now=()=>Date.now()){this.file=file;this.send=send;this.now=now;this.jobs=[];this.busy=false;try{this.jobs=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}if(!Array.isArray(this.jobs))this.jobs=[];}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.jobs));fs.renameSync(this.file+'.tmp',this.file);}
 create(text,at){if(typeof text!=='string'||!text.trim()||text.length>1000)throw new Error('Reminder text must be 1-1000 characters');if(!Number.isFinite(at)||at<=this.now()||at-this.now()>90*86400000)throw new Error('Reminder must be in the next 90 days');if(this.jobs.length>=20)throw new Error('Maximum 20 reminders');const job={id:crypto.randomBytes(4).toString('hex'),text,at,state:'waiting'};this.jobs.push(job);this.save();return job;}
 cancel(id){const n=this.jobs.length;this.jobs=this.jobs.filter(x=>x.id!==id);if(this.jobs.length===n)throw new Error('Reminder ID not found');this.save();}
 async tick(){if(this.busy)return;this.busy=true;try{for(const j of this.jobs.filter(x=>x.state==='waiting'&&x.at<=this.now())){
  // Claim persistently before delivery. A crash can lose this one send, but never duplicates it.
  j.state='sending';this.save();try{if(await this.send('Reminder: '+j.text)){this.jobs=this.jobs.filter(x=>x.id!==j.id);}else j.state='waiting';}catch{j.state='uncertain';}this.save();
 }}finally{this.busy=false;}}
}
