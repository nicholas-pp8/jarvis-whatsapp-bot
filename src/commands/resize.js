import { findMedia, downloadMedia, resizeImage, friendly } from '../utils/imageTools.js';
import { formatBytes } from '../utils/helpers.js';
import logger from '../utils/logger.js';

export default {
  name: 'resize',
  category: 'Image',
  description: 'Resize an image to a width in pixels',
  usage: 'resize 800 (send or reply to an image)',
  minArgs: 1,
  async run(ctx) {
    const width = Math.round(Number(ctx.args[0]));
    if (!Number.isFinite(width) || width < 16 || width > 4096) return ctx.reply('⚠️ Give a width between 16 and 4096, for example /resize 800.');
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'image') return ctx.reply('🖼️ Send an image with /resize 800 as the caption, or reply to an image.');
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const { out, meta } = await resizeImage(buf, width);
      const ext = meta.format === 'png' ? 'png' : meta.format === 'webp' ? 'webp' : 'jpg';
      await ctx.sock.sendMessage(ctx.jid, { document: out, mimetype: `image/${ext === 'jpg' ? 'jpeg' : ext}`, fileName: `resized-${width}.${ext}`, caption: `✅ ${meta.width} px to ${width} px (${formatBytes(out.length)})` }, { quoted: ctx.msg });
      logger.info('[image] resize ok');
    } catch (err) {
      logger.warn(`[image] resize failed: ${err.message}`);
      await ctx.reply(friendly(err, 'resize that'));
    }
  },
};
