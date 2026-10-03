import fs from 'node:fs/promises';
import path from 'node:path';
import {fileTypeFromFile} from 'file-type';
import config from '../config/config.js';
import {DownloadError,runYtDlp,friendlyYtDlpError} from '../utils/downloader.js';
import {safeFileName} from '../utils/fileManager.js';
const domains={instagram:['instagram.com'],facebook:['facebook.com','fb.watch'],twitter:['twitter.com','x.com']};
export function socialPlatform(url){if(url.protocol!=='https:'||url.username||url.password||url.port)return null;return Object.entries(domains).find(([,hosts])=>hosts.some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))?.[0]||null;}
export function canonicalSocial(url,platform){if(socialPlatform(url)!==platform)return null;const p=url.pathname;
 if(platform==='instagram'&&!/^\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+\/?$/.test(p))return null;
 if(platform==='twitter'&&!/^\/(?:[A-Za-z0-9_]+\/status|i\/status)\/\d+\/?$/.test(p))return null;
 if(platform==='facebook'&&url.hostname!=='fb.watch'&&!(/\/videos\//.test(p)||/^\/reel\/\d+\/?$/.test(p)||p==='/watch/'&&/^\d+$/.test(url.searchParams.get('v')||'')||/^\/share\/(?:v|r)\/[A-Za-z0-9]+\/?$/.test(p)))return null;
 const clean=new URL(url);for(const k of [...clean.searchParams.keys()])if(!(platform==='facebook'&&k==='v'))clean.searchParams.delete(k);clean.hash='';return clean.href;}
export function makeSocial(platform){return {name:platform,matches:url=>socialPlatform(url)===platform,download:async(url,{dir,kind})=>{
 const clean=canonicalSocial(url,platform);if(!clean)throw new DownloadError('Send a public video/reel/post link, not a profile, story or search page.',{code:'INVALID'});if(kind==='audio')throw new DownloadError('This command downloads video only.');
 const maxMb=Math.round(config.limits.maxFileBytes/1048576);const publicOptions={timeoutMs:60000,useCookies:false};
 try{const {stdout}=await runYtDlp(['--skip-download','--dump-single-json','--socket-timeout','15',clean],publicOptions);const meta=JSON.parse(stdout);
 if(meta._type==='playlist'||meta.entries||meta.is_live||meta.live_status==='is_live')throw new DownloadError('Playlists and live streams are not supported.');
 if(meta.availability&&meta.availability!=='public')throw new DownloadError('Only public videos are supported. No login or private-content access.');
 if(meta.duration>1800)throw new DownloadError('This video exceeds the30-minute limit.');
 await runYtDlp(['-f',`bv*[height<=${config.limits.maxVideoHeight}][ext=mp4]+ba[ext=m4a]/b[height<=${config.limits.maxVideoHeight}][ext=mp4]/b[height<=${config.limits.maxVideoHeight}]`,'--merge-output-format','mp4','--max-filesize',String(config.limits.maxFileBytes),'--socket-timeout','15','--retries','1','--fragment-retries','1','-o',path.join(dir,'social.%(ext)s'),clean],{cwd:dir,useCookies:false});
 const names=(await fs.readdir(dir)).filter(n=>/^social\.(mp4|webm|mov)$/.test(n));if(names.length!==1)throw new DownloadError('The site did not return a supported video.');const file=path.join(dir,names[0]);const st=await fs.stat(file);const type=await fileTypeFromFile(file);if(!st.size||st.size>config.limits.maxFileBytes||!type?.mime.startsWith('video/'))throw new DownloadError('Returned file is empty, too large or not a video.');
 return {title:safeFileName(meta.title,platform),files:[{path:file,type:'video',mimetype:type.mime,fileName:safeFileName(meta.title,platform)+'.'+type.ext,size:st.size}]};
 }catch(e){if(e instanceof DownloadError&&!['FAILED','NETWORK','PRIVATE','UNAVAILABLE','REGION','BOT_CHECK','TOO_LARGE','UNSUPPORTED'].includes(e.code))throw e;throw new DownloadError(friendlyYtDlpError(e,maxMb).replace('YouTube',platform),{code:e.code,cause:e});}
 }};}
