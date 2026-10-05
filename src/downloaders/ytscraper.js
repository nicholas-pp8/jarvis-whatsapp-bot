import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { DownloadError } from '../utils/downloader.js';
import { safeFileName } from '../utils/fileManager.js';

const require = createRequire(import.meta.url);
const QUALITIES = [144, 360, 480, 720, 1080];

/** Downloads via @vreden/youtube_scraper (third-party converter), bypassing the YouTube IP check. */
export async function downloadViaScraper(cleanUrl, { kind, dir, onProgress }) {
  const yt = require('@vreden/youtube_scraper');
  const h = config.limits.maxVideoHeight;
  const q = [...QUALITIES].reverse().find((x) => x <= h) || 360;
  const res = kind === 'audio' ? await yt.ytmp3(cleanUrl, 128) : await yt.ytmp4(cleanUrl, q);
  if (!res?.status || !res.download?.status || !res.download.url) {
    throw new DownloadError('❌ Unable to download this video.', { code: 'SCRAPER_FAIL' });
  }
  const meta = res.metadata || {};
  const ext = kind === 'audio' ? '.mp3' : '.mp4';
  const file = path.join(dir, `media${ext}`);
  const r = await fetch(res.download.url, { signal: AbortSignal.timeout(config.limits.maxDownloadSeconds * 1000) });
  if (!r.ok || !r.body) throw new DownloadError('❌ Unable to download this video.', { code: 'SCRAPER_HTTP' });
  const len = Number(r.headers.get('content-length') || 0);
  if (len > config.limits.maxFileBytes) throw new DownloadError('📦 That file is too large to send.', { code: 'TOO_LARGE' });
  const title0 = safeFileName(meta.title || res.download.filename, 'youtube');
  let received = 0;
  onProgress?.({ name: title0, total: len, received: 0 });
  const counter = new Transform({ transform(chunk, _e, cb) { received += chunk.length; try { onProgress?.({ name: title0, total: len, received }); } catch { /* ignore */ } cb(null, chunk); } });
  await pipeline(Readable.fromWeb(r.body), counter, fs.createWriteStream(file));
  const size = fs.statSync(file).size;
  if (size < 1000) throw new DownloadError('❌ Unable to download this video.', { code: 'SCRAPER_EMPTY' });
  if (size > config.limits.maxFileBytes) {
    fs.unlinkSync(file);
    throw new DownloadError('📦 That file is too large to send.', { code: 'TOO_LARGE' });
  }
  logger.info(`[ytscraper] ok ${kind} ${Math.round(size / 1024)} KB`);
  const title = safeFileName(meta.title || res.download.filename, 'youtube');
  return {
    title,
    duration: meta.seconds,
    files: [{ path: file, type: kind === 'audio' ? 'audio' : 'video', mimetype: kind === 'audio' ? 'audio/mpeg' : 'video/mp4', fileName: `${title}${ext}` }],
  };
}
