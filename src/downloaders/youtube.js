import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import { DownloadError, runYtDlp, friendlyYtDlpError, classifyYtDlpError } from '../utils/downloader.js';
import { safeFileName } from '../utils/fileManager.js';
import logger from '../utils/logger.js';
import { downloadViaScraper } from './ytscraper.js';

const HOSTS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];
const ID_RE = /^[\w-]{11}$/;

export const name = 'youtube';

export function matches(url) {
  return HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

/** Returns a clean canonical watch URL, or null if the link has no valid video id. */
export function canonicalUrl(url) {
  let id = null;
  if (url.hostname === 'youtu.be') id = url.pathname.split('/')[1];
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else {
    const m = url.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
    if (m) id = m[2];
  }
  return id && ID_RE.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

async function info(cleanUrl) {
  const { stdout } = await runYtDlp(['--skip-download', '--dump-single-json', cleanUrl], { timeoutMs: 60_000 });
  return JSON.parse(stdout);
}

/**
 * @param {URL} url
 * @param {{kind:'video'|'audio', dir:string}} opts
 */
export async function download(url, { kind, dir }) {
  const clean = canonicalUrl(url);
  if (!clean) throw new DownloadError('❌ That does not look like a valid YouTube video link.', { code: 'INVALID' });

  const maxMb = Math.round(config.limits.maxFileBytes / 1024 / 1024);
  if (process.env.YT_PROVIDER !== 'ytdlp') {
    try {
      return await downloadViaScraper(clean, { kind, dir });
    } catch (e) {
      if (e.code === 'TOO_LARGE') throw e;
      logger.warn(`[ytscraper] failed (${e.message}), falling back to yt-dlp`);
    }
  }
  let meta;
  try {
    meta = await info(clean);
  } catch (err) {
    throw new DownloadError(friendlyYtDlpError(err, maxMb), { code: err.code, cause: err.cause || err });
  }
  if (meta.is_live) throw new DownloadError('📡 Live streams cannot be downloaded.', { code: 'LIVE' });
  const maxSeconds = 3 * 3600;
  if (meta.duration && meta.duration > maxSeconds) throw new DownloadError('⏱️ That video is too long to download.', { code: 'TOO_LONG' });

  const title = safeFileName(meta.title, 'youtube');
  const out = path.join(dir, 'media.%(ext)s');
  const h = config.limits.maxVideoHeight;
  const max = String(config.limits.maxFileBytes);
  const args =
    kind === 'audio'
      ? ['-f', 'bestaudio[ext=m4a]/bestaudio', '--max-filesize', max, '-o', out, clean]
      : ['-f', `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`, '--merge-output-format', 'mp4', '--max-filesize', max, '-o', out, clean];

  try {
    await runYtDlp(args, { cwd: dir });
  } catch (err) {
    const code = err.code ?? classifyYtDlpError(err.cause?.message);
    throw new DownloadError(friendlyYtDlpError(Object.assign(err, { code }), maxMb), { code, cause: err.cause || err });
  }

  const files = (await fs.readdir(dir)).filter((f) => f.startsWith('media.') && !f.endsWith('.part') && !f.endsWith('.ytdl'));
  if (!files.length) throw new DownloadError('❌ Unable to download this video.\n\nThe link may be invalid, unavailable, private, or unsupported.', { code: 'NO_OUTPUT' });
  const file = path.join(dir, files[0]);
  const ext = path.extname(file).toLowerCase();
  const isAudio = kind === 'audio';
  const mimetype = isAudio ? (ext === '.m4a' || ext === '.mp4' ? 'audio/mp4' : ext === '.webm' || ext === '.opus' ? 'audio/ogg; codecs=opus' : 'audio/mpeg') : 'video/mp4';
  return { title, duration: meta.duration, files: [{ path: file, type: isAudio ? 'audio' : 'video', mimetype, fileName: `${title}${ext}` }] };
}
