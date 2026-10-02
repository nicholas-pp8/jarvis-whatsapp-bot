import { findMedia, downloadMedia, compressImage, friendly } from '../utils/imageTools.js';
import { formatBytes } from '../utils/helpers.js';
import logger from '../utils/logger.js';

export default {
  name: 'compress',
  aliases: ['shrink'],
  category: 'Image',
  description: 'Make an image smaller in file size',
  usage: 'compress 60 (quality 10-95, optional)',
  async run(ctx) {
    const q = ctx.args[0] ? Math.round(Number(ctx.args[0])) : 60;
    if (!Number.isFinite(q) || q < 10 || q > 95) return ctx.reply('⚠️ Quality must be between 10 and 95, for example /compress 60.');
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'image') return ctx.reply('🖼️ Send an image with /compress as the caption, or reply to an image.');
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const out = await compressImage(buf, q);
      await ctx.sock.sendMessage(ctx.jid, { document: out, mimetype: 'image/jpeg', fileName: 'compressed.jpg', caption: `✅ ${formatBytes(buf.length)} to ${formatBytes(out.length)} (quality ${q})` }, { quoted: ctx.msg });
      logger.info('[image] compress ok');
    } catch (err) {
      logger.warn(`[image] compress failed: ${err.message}`);
      await ctx.reply(friendly(err, 'compress that'));
    }
  },
};
