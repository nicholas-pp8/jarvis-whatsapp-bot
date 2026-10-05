import {t} from '../i18n/index.js';
import {replyFailure} from '../recovery/reply.js';
// Shared flow for download commands (files starting with "_" are not loaded as commands).
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { fetchMedia } from '../downloaders/index.js';
import { DownloadError, downloadQueue } from '../utils/downloader.js';
import { createJobDir, removeJobDir, freeDiskBytes } from '../utils/fileManager.js';
import { sendMediaFile } from '../utils/sender.js';
import { createProgressMessage } from '../utils/progressBar.js';
import { bump } from '../database/database.js';
import { formatBytes } from '../utils/helpers.js';

const require = createRequire(import.meta.url);
const socialUse=new Map();
export function limitSocial(user,now=Date.now()){const recent=(socialUse.get(user)||[]).filter(t=>now-t<60000);if(recent.length>=3)throw new DownloadError('Public-video limit:3 requests per minute. Please wait.');socialUse.set(user,[...recent,now]);if(socialUse.size>5000)socialUse.clear();}

/** Finds the top YouTube result for a text query. Returns { url, title } or null. */
export async function searchYoutube(query) {
  const yts = require('yt-search');
  const r = await Promise.race([
    yts(query),
    new Promise((_, rej) => setTimeout(() => rej(new Error('search timeout')), 20000)),
  ]);
  const v = (r?.videos || []).find((x) => x?.url);
  return v ? { url: v.url, title: v.title } : null;
}

/**
 * URL -> validator -> platform detector -> downloader -> file validation
 * -> WhatsApp sender -> temp cleanup.
 */
export async function runDownloadCommand(ctx, { expect, kind, label }) {
  let rawUrl = ctx.args[0];
  let dir = null;
  try {
    if(['instagram','facebook','twitter'].includes(expect))limitSocial(ctx.sender);
    if (expect === 'pinterest' && !/^https?:\/\//i.test(String(rawUrl || ''))) {
      const query = ctx.args.join(' ').trim();
      logger.info('Pin search started');
      let hit = null;
      try {
        const { searchPin } = await import('../downloaders/pinterest.js');
        hit = await searchPin(query);
      } catch (e) {
        logger.warn('Pin search failed');
        throw new DownloadError('❌ Pinterest search is not working right now. Please try again, or send a pin link.', { code: 'SEARCH_FAIL' });
      }
      if (!hit) throw new DownloadError(`🔎 No pins found for "${query}". Try different words or send a pin link.`, { code: 'NO_RESULTS' });
      logger.info('Pin search result picked');
      await ctx.reply(`📌 ${hit.title||''}`);
      rawUrl = hit.url;
    }
    if (expect === 'youtube' && !/^https?:\/\//i.test(String(rawUrl || ''))) {
      const query = ctx.args.join(' ').trim();
      logger.info('Search started');
      let hit = null;
      try {
        hit = await searchYoutube(query);
      } catch (e) {
        logger.warn('Search failed');
        throw new DownloadError('❌ Search is not working right now. Please try again, or send a link.', { code: 'SEARCH_FAIL' });
      }
      if (!hit) throw new DownloadError(`🔎 No results found for "${query}". Try different words or send a link.`, { code: 'NO_RESULTS' });
      logger.info('Search result picked');
      await ctx.reply(`🔎 ${hit.title}`);
      rawUrl = hit.url;
    }
    if ((await freeDiskBytes()) < config.limits.minFreeDiskBytes) {
      throw new DownloadError('💾 The server is low on disk space. Please try again later.', { code: 'DISK' });
    }

    let progress = null;
    const result = await downloadQueue.add(
      ctx.sender,
      async () => {
        dir = await createJobDir();
        logger.info(`Download started (${label})`);
        if (expect === 'youtube') { progress = createProgressMessage(ctx, kind); await progress.begin(); }
        else await ctx.reply(['instagram','facebook','twitter'].includes(expect)?'Downloading public '+expect+' video...':'⏳ '+t(ctx,'cat_Downloaders')+': '+t(ctx,'desc_'+(expect==='youtube'?(kind==='audio'?'play':'video'):'pinterest')));
        let media;
        try { media = await fetchMedia(rawUrl, { dir, kind, expect, onProgress: progress ? (p) => progress.update(p) : undefined }); }
        catch (e) { progress?.close(); throw e; }
        await progress?.finish(true);
        logger.info('Download completed');

        // File validation
        for (const f of media.files) {
          const st = await fs.stat(f.path).catch(() => null);
          if (!st || st.size === 0) throw new DownloadError('❌ The downloaded file was empty. Please try again.', { code: 'EMPTY' });
          if (st.size > config.limits.maxFileBytes) {
            throw new DownloadError(`📦 The file is ${formatBytes(st.size)}, which is over the ${formatBytes(config.limits.maxFileBytes)} limit.`, { code: 'TOO_LARGE' });
          }
          f.size = st.size;
        }

        const say = (m) => (progress ? progress.text(m) : ctx.reply(m));
        for (const f of media.files){let timer,state={phase:'preparing'};if(f.type==='video'){await say('Full download complete. Preparing the full video. Processing limit:1hour per stage. Estimating from real progress; upload time depends on WhatsApp/network.');timer=setInterval(()=>{const eta=state.remainingSeconds===null||state.remainingSeconds===undefined?'estimating...':Math.ceil(state.remainingSeconds/60)+'min approximately for this stage';say('Video '+state.phase+(state.percent!==null&&state.percent!==undefined?' '+state.percent+'%':'')+'. Remaining: '+eta+'. '+(state.phase==='converting'?'Full checking and upload follow.':state.phase==='checking'?'Upload follows.':'Upload time cannot yet be estimated.')+' No partial video will be sent.').catch(()=>{});},60000);timer.unref();}try{await sendMediaFile(ctx.sock,ctx.jid,f,ctx.msg,f.type==='audio'?'':`✅ ${media.title}`,{onProgress:p=>{state=p;}});}finally{clearInterval(timer);}}

        logger.info('File sent');
        return media;
      },
      (pos) => ctx.reply('🕒 '+pos+' - '+t(ctx,'cat_Downloaders')).catch(() => {}),
    );
    bump('downloads');
    return result;
  } catch (err) {
    bump('failures');
    if(['instagram','facebook','twitter'].includes(expect)&&err instanceof DownloadError) await ctx.reply(err.userMessage);
    else await replyFailure(ctx,expect==='youtube'?(kind==='audio'?'play':'video'):'pinterest',err);
  } finally {
    await removeJobDir(dir);
  }
  return null;
}
