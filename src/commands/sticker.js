import { findMedia, downloadMedia, toSticker, friendly, MEDIA_LIMIT } from '../utils/imageTools.js';
import logger from '../utils/logger.js';

export default {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  category: 'Image',
  description: 'Make a sticker from an image or short video',
  usage: 'sticker (send or reply to an image)',
  async run(ctx) {
    const media = findMedia(ctx.msg);
    if (!media) return ctx.reply('🖼️ Send an image or short video with /sticker as the caption, or reply to one with /sticker.');
    if (Number(media.node.fileLength || 0) > MEDIA_LIMIT) return ctx.reply('📦 That file is too big. Please use something under 15 MB.');
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const out = await toSticker(buf, { animated: media.animated, pack: 'Jarvis', author: 'Rohan' });
      await ctx.sock.sendMessage(ctx.jid, { sticker: out }, { quoted: ctx.msg });
      logger.info(`[image] sticker ok ${Math.round(out.length / 1024)} KB`);
    } catch (err) {
      logger.warn(`[image] sticker failed: ${err.message}`);
      await ctx.reply(friendly(err, 'make the sticker'));
    }
  },
};
