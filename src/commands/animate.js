import {downloadMediaMessage} from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import {findMedia} from '../utils/imageTools.js';
import {createJobDir, removeJobDir} from '../utils/fileManager.js';
import {downloadQueue} from '../utils/downloader.js';
import {saveImageStream} from '../services/imageEnhancer.js';
import {animatePhoto, animateLimiter} from '../services/hfMedia.js';
import {ensureWhatsApp} from '../services/agnesVideo.js';

const stamps = new Map();
export default {
  name: 'animate', aliases: ['img2vid', 'photo2video', 'i2v'], category: 'AI',
  description: 'Turn a photo into a short video (free AI, image to video)',
  usage: 'animate [motion idea] (send or reply to a photo)',
  async run(ctx) {
    if (process.env.ANIMATE_ENABLED === 'false') return ctx.reply('Photo animation is switched off right now.');
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'image' || media.animated) return ctx.reply('Send or reply to a photo with ' + config.prefix + 'animate [optional motion idea]\nFor text to video use ' + config.prefix + 'aivideo.');
    if (Number(media.node.fileLength) > 10 * 1048576) return ctx.reply('Photo is too big (max 10MB).');
    const prompt = ctx.args.join(' ').trim().slice(0, 250);
    const now = Date.now();
    const mine = (stamps.get(ctx.sender) || []).filter((t) => now - t < 900000);
    if (mine.length >= 2) return ctx.reply('Limit: 2 animations per 15 minutes. Try again shortly.');
    if (!animateLimiter.ok()) return ctx.reply('Photo animation is busy or at its hourly cap. Try again in a few minutes.');
    mine.push(now); stamps.set(ctx.sender, mine); if (stamps.size > 5000) stamps.clear();
    await ctx.reply('🎞️ Animating your photo... this takes 1-3 minutes.');
    let dir;
    try {
      await downloadQueue.add(ctx.sender, async () => {
        dir = await createJobDir();
        const input = path.join(dir, 'input');
        await saveImageStream(await downloadMediaMessage(media.message, 'stream', {}, {logger, reuploadRequest: ctx.sock.updateMediaMessage}), input);
        const jpeg = await sharp(input, {limitInputPixels: 16e6, failOn: 'error'}).rotate().resize(832, 832, {fit: 'inside', withoutEnlargement: true}).flatten({background: '#fff'}).jpeg({quality: 90}).toBuffer();
        let vid;
        try { vid = await animateLimiter.run(() => animatePhoto(jpeg, prompt)); }
        catch (e) {
          logger.warn('animate failed: ' + (e?.message || 'error'));
          if (e?.quota) return ctx.reply('The free AI daily limit for animation is used up. Try again later (it resets daily).');
          return ctx.reply('Could not animate the photo (the free AI service is busy). Try again in a few minutes.');
        }
        const raw = path.join(dir, 'v.mp4'); await fs.writeFile(raw, vid);
        const {file} = await ensureWhatsApp(raw, {ffmpeg: config.tools?.ffmpeg || 'ffmpeg', ffprobe: config.tools?.ffprobe || 'ffprobe'});
        await ctx.sock.sendMessage(ctx.jid, {video: await fs.readFile(file), mimetype: 'video/mp4', caption: '🎞️ Animated by a free public AI service (Wan 2.2). Your photo was sent to it.'}, {quoted: ctx.msg});
      });
    } catch (e) { logger.warn('animate error: ' + (e?.message || 'error')); await ctx.reply('Photo animation failed.'); }
    finally { await removeJobDir(dir); }
  },
};
