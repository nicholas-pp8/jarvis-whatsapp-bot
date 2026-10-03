import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {makeLimiter} from '../services/publicAi.js';
import {parseVideoArgs, createTask, waitTask, download, ensureWhatsApp, tmpDir, VideoError} from '../services/agnesVideo.js';

const limiter = makeLimiter('VIDEO', 'VIDEO_PER_HOUR', 20, 2);
const stamps = new Map();
export default {
  name: 'aivideo', aliases: ['t2v', 'genvideo', 'text2video'], category: 'AI',
  description: 'Text to video (free AI, takes 1-3 minutes)',
  usage: 'aivideo <describe the scene> [--720]',
  minArgs: 1,
  async run(ctx) {
    const key = process.env.AGNES_API_KEY;
    if (!key || process.env.VIDEO_ENABLED === 'false') return ctx.reply('Video generation is switched off right now.');
    const {res, prompt} = parseVideoArgs(ctx.args);
    if (prompt.length < 5) return ctx.reply('Usage: ' + config.prefix + 'aivideo <describe the scene>\nExample: ' + config.prefix + 'aivideo a cat walking on a beach at sunset');
    if (prompt.length > 400) return ctx.reply('Prompt too long (max 400 characters).');
    const now = Date.now();
    const mine = (stamps.get(ctx.sender) || []).filter((t) => now - t < 600000);
    if (mine.length >= 2) return ctx.reply('Limit: 2 videos per 10 minutes. Try again shortly.');
    if (!limiter.ok()) return ctx.reply('Video generation is busy or at its hourly cap. Try again in a few minutes.');
    mine.push(now); stamps.set(ctx.sender, mine); if (stamps.size > 5000) stamps.clear();
    await ctx.reply('🎬 Generating your video (' + res + '). This takes about 1-3 minutes...');
    let dir;
    try {
      const file = await limiter.run(async () => {
        const id = await createTask(prompt, res, key);
        const url = await waitTask(id, key);
        dir = await tmpDir();
        return download(url, path.join(dir, 'v.mp4'));
      });
      const {file: out} = await ensureWhatsApp(file, {ffmpeg: config.tools?.ffmpeg || 'ffmpeg', ffprobe: config.tools?.ffprobe || 'ffprobe'});
      const buf = await fs.readFile(out);
      await ctx.sock.sendMessage(ctx.jid, {video: buf, mimetype: 'video/mp4', caption: '🎬 ' + prompt.slice(0, 120) + '\n_Made by a free public AI service (Agnes). Your prompt was sent to it._'}, {quoted: ctx.msg});
    } catch (e) {
      logger.warn('video failed: ' + (e?.message || 'error'));
      if (e?.code === 'timeout') return ctx.reply('The video took too long. The free service is busy - try again in a few minutes.');
      if (e?.code === 'busy') return ctx.reply('The free video service is at its rate limit. Try again in a minute.');
      return ctx.reply('Could not make the video right now. Try again later or with a simpler prompt.');
    } finally { if (dir) await fs.rm(dir, {recursive: true, force: true}).catch(() => {}); }
  },
};
