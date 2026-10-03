import {replyFailure} from '../recovery/reply.js';
import {t} from '../i18n/index.js';
import config from '../config/config.js';
import { askAi, PROVIDERS } from '../ai/providers.js';
import logger from '../utils/logger.js';
import { recall, remember, forget, withContext } from '../ai/chatMemory.js';

const MAX_CHARS = 3500;

export default {
  name: 'ask',
  aliases: ['ai'],
  category: 'AI',
  description: 'Ask an AI anything',
  usage: 'ask <question>',
  minArgs: 1,
  async run(ctx) {
    let args = [...ctx.args];
    let prefer;
    // "/ask groq: question" or "/ask gemini question" picks a provider.
    const first = (args[0] || '').toLowerCase().replace(/:$/, '');
    const hit = PROVIDERS.find((p) => p.id === first || p.label.toLowerCase().startsWith(first));
    if (hit && args.length > 1 && first === hit.id) {
      prefer = hit.id;
      args = args.slice(1);
    }
    const question = args.join(' ').trim();
    const who = String(ctx.senderJid || ctx.sender || '');
    if (/^(reset|clear|new)$/i.test(question)) { forget(ctx.jid, who); return ctx.reply('🧹 Conversation cleared. Ask something new.'); }
    if (!question) return ctx.reply(t(ctx,'missing_input',{usage:t(ctx,'usage'),prefix:config.prefix,command:'ask <question>'}));
    try {
      const q = question.slice(0, 2000);
      const r = await askAi(withContext(recall(ctx.jid, who), q), { prefer });
      remember(ctx.jid, who, q, r.text);
      let text = r.text.length > MAX_CHARS ? `${r.text.slice(0, MAX_CHARS)}…` : r.text;
      await ctx.reply(`${text}\n\n_via ${r.provider}_`);
    } catch (err) {
      await replyFailure(ctx,'ask',err);
    }
  },
};
