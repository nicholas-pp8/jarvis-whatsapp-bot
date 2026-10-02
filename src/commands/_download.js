// Shared flow for download commands (files starting with "_" are not loaded as commands).
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { fetchMedia } from '../downloaders/index.js';
import { DownloadError, downloadQueue } from '../utils/downloader.js';
import { createJobDir, removeJobDir, freeDiskBytes } from '../utils/fileManager.js';
import { sendMediaFile } from '../utils/sender.js';
import { bump } from '../database/database.js';
import { formatBytes } from '../utils/helpers.js';

const require = createRequire(import.meta.url);

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
    if (expect === 'pinterest' && !/^https?:\/\//i.test(String(rawUrl || ''))) {
      const query = ctx.args.join(' ').trim();
      logger.info('Pin search started');
      let hit = null;
      try {
        const { searchPin } = await import('../downloaders/pinterest.js');
        hit = await searchPin(query);
      } catch (e) {
        logger.warn(`Pin search failed: ${e.message}`);
        throw new DownloadError('❌ Pinterest search is not working right now. Please try again, or send a pin link.', { code: 'SEARCH_FAIL' });
      }
      if (!hit) throw new DownloadError(`🔎 No pins found for "${query}". Try different words or send a pin link.`, { code: 'NO_RESULTS' });
      logger.info('Pin search result picked');
      await ctx.reply(`📌 Found: ${hit.title || 'a pin'}`);
      rawUrl = hit.url;
    }
    if (expect === 'youtube' && !/^https?:\/\//i.test(String(rawUrl || ''))) {
      const query = ctx.args.join(' ').trim();
      logger.info('Search started');
      let hit = null;
      try {
        hit = await searchYoutube(query);
      } catch (e) {
        logger.warn(`Search failed: ${e.message}`);
        throw new DownloadError('❌ Search is not working right now. Please try again, or send a link.', { code: 'SEARCH_FAIL' });
      }
      if (!hit) throw new DownloadError(`🔎 No results found for "${query}". Try different words or send a link.`, { code: 'NO_RESULTS' });
      logger.info('Search result picked');
      await ctx.reply(`🔎 Found: ${hit.title}`);
      rawUrl = hit.url;
    }
    if ((await freeDiskBytes()) < config.limits.minFreeDiskBytes) {
      throw new DownloadError('💾 The server is low on disk space. Please try again later.', { code: 'DISK' });
    }

    const result = await downloadQueue.add(
      ctx.sender,
      async () => {
        dir = await createJobDir();
        logger.info(`Download started (${label})`);
        await ctx.reply(`⏳ Downloading ${label}…`);
        const media = await fetchMedia(rawUrl, { dir, kind, expect });
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

        for (const f of media.files) await sendMediaFile(ctx.sock, ctx.jid, f, ctx.msg, f.type === 'audio' ? '' : `✅ ${media.title}`);
        logger.info('File sent');
        return media;
      },
      (pos) => ctx.reply(`🕒 You are #${pos} in the queue. I will start as soon as a slot is free.`).catch(() => {}),
    );
    bump('downloads');
    return result;
  } catch (err) {
    bump('failures');
    logger.warn(`Download failed [${err.code || 'ERROR'}]`);
    if (err.cause) logger.error('Technical detail:', err.cause);
    else if (!(err instanceof DownloadError)) logger.error('Unexpected error:', err);
    const friendly = err instanceof DownloadError ? err.userMessage : '❌ Unable to download this.\n\nThe link may be invalid, unavailable, private, or unsupported.';
    await ctx.reply(friendly).catch(() => {});
  } finally {
    await removeJobDir(dir);
  }
  return null;
}
