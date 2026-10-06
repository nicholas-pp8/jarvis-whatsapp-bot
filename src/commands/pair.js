import config from '../config/config.js';
import {bridge, loadSaved} from '../ecosystem/pairing.js';

export default {
  name: 'pair', aliases: ['portalpair'], category: 'System',
  description: 'Pair this bot with the Jarvis pairing website using the code it shows', usage: 'pair K7QM-4X2P', minArgs: 0,
  async run(ctx) {
    if (!ctx.isOwner) return ctx.reply('Only the owner of this bot can pair it.');
    if (loadSaved(config.paths.data)) return ctx.reply('This bot is already paired. Type /sid to see your S-ID.');
    const code = String(ctx.args?.[0] || '');
    if (!code) return ctx.reply('Open the pairing website, enter your number, then send the code it shows here.\nExample: /pair K7QM-4X2P');
    if (!bridge.start) return ctx.reply('Pairing is not available on this install.');
    const r = await bridge.start(code, config.ownerNumber);
    await ctx.reply(r.ok ? 'Code accepted. Verifying, your S-ID will arrive in your own chat in a few seconds.' : 'Not paired: ' + r.why);
  },
};
