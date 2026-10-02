import { askAi, PROVIDERS } from '../ai/providers.js';
import logger from '../utils/logger.js';

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
    if (!question) return ctx.reply('⚠️ Missing input.\n\nUsage: /ask <question>');
    try {
      const r = await askAi(question.slice(0, 2000), { prefer });
      let text = r.text.length > MAX_CHARS ? `${r.text.slice(0, MAX_CHARS)}…` : r.text;
      await ctx.reply(`${text}\n\n_via ${r.provider}_`);
    } catch (err) {
      logger.warn(`[ai] ${err.code || 'ERROR'}`);
      if (err.code === 'NO_KEYS') return ctx.reply('🔑 AI is not set up yet. The owner needs to add an API key.');
      return ctx.reply('😕 The AI is busy or unavailable right now. Please try again in a minute.');
    }
  },
};
