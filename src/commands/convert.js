import { findMedia, downloadMedia, convertImage, friendly } from '../utils/imageTools.js';
import logger from '../utils/logger.js';

const FORMATS = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' };

export default {
  name: 'convert',
  aliases: ['toformat'],
  category: 'Image',
  description: 'Convert an image to png, jpg or webp',
  usage: 'convert png (png, jpg or webp)',
  minArgs: 1,
  async run(ctx) {
    const fmt = FORMATS[String(ctx.args[0]).toLowerCase().replace(/^\./, '')];
    if (!fmt) return ctx.reply('⚠️ Pick a format: png, jpg or webp. Example: /convert png');
    const media = findMedia(ctx.msg);
    if (!media || !['image', 'sticker'].includes(media.type)) return ctx.reply('🖼️ Send an image with /convert png as the caption, or reply to an image or sticker.');
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const { out, mime, ext } = await convertImage(buf, fmt);
      await ctx.sock.sendMessage(ctx.jid, { document: out, mimetype: mime, fileName: `converted.${ext}`, caption: `✅ Converted to ${ext.toUpperCase()}` }, { quoted: ctx.msg });
      logger.info('[image] convert ok');
    } catch (err) {
      logger.warn(`[image] convert failed: ${err.message}`);
      await ctx.reply(friendly(err, 'convert that'));
    }
  },
};
