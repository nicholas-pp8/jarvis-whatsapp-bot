import { parseRequest, speak, rateCheck, TtsError } from '../tts/index.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';

export default {
  name: 'tts',
  aliases: ['speak', 'say'],
  category: 'AI',
  description: 'Turn text into a voice message',
  usage: 'tts [language] [male|female|voice] <text>',
  async run(ctx) {
    const m = ctx.msg.message || {};
    const info = m.extendedTextMessage?.contextInfo;
    const q = info?.quotedMessage;
    const quoted = q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || '';
    const req = parseRequest(ctx.args, quoted);
    if (!req.text) {
      const p = config.prefix;
      return ctx.reply(`Send text to turn into a voice note.\n\nExamples:\n${p}tts Hello everyone\n${p}tts hi Namaste dosto\n${p}tts en male Good morning\n${p}tts bn Kemon acho\n\nYou can also reply to a message with ${p}tts.\nLanguages and voices: ${p}ttsvoices`);
    }
    if (!ctx.isOwner) {
      const wait = rateCheck(ctx.sender);
      if (wait) return ctx.reply(`Slow down a little. Try again in ${wait} seconds.`);
    }
    try {
      await ctx.sock.sendPresenceUpdate?.('recording', ctx.jid).catch(() => {});
      const out = await speak(req);
      await ctx.sock.sendMessage(ctx.jid, { audio: out.buf, mimetype: out.mimetype, ptt: out.ptt }, { quoted: ctx.msg });
      logger.info(`[tts] sent ${out.lang} voice note via ${out.provider} (${req.text.length} chars)`);
    } catch (err) {
      if (err instanceof TtsError) return ctx.reply(err.message);
      logger.error('[tts] failed:', err);
      await ctx.reply('Could not make the voice note. Please try again.');
    } finally {
      await ctx.sock.sendPresenceUpdate?.('paused', ctx.jid).catch(() => {});
    }
  },
};
