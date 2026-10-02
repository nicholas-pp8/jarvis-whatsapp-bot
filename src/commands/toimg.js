import { findMedia, downloadMedia, stickerToImage, friendly } from '../utils/imageTools.js';
import logger from '../utils/logger.js';

export default {
  name: 'toimg',
  aliases: ['toimage', 'unsticker'],
  category: 'Image',
  description: 'Turn a sticker into an image',
  usage: 'toimg (reply to a sticker)',
  async run(ctx) {
    const media = findMedia(ctx.msg);
    if (!media || media.type !== 'sticker') return ctx.reply('🖼️ Reply to a sticker with /toimg.');
    try {
      const buf = await downloadMedia(ctx.sock, media);
      const out = await stickerToImage(buf, 'png');
      await ctx.sock.sendMessage(ctx.jid, { image: out, caption: '✅ Done' }, { quoted: ctx.msg });
      logger.info('[image] toimg ok');
    } catch (err) {
      logger.warn(`[image] toimg failed: ${err.message}`);
      await ctx.reply(friendly(err, 'convert that sticker'));
    }
  },
};
