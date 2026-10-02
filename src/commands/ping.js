export default {
  name: 'ping',
  category: 'General',
  description: 'Check that the bot is alive and how fast it replies',
  usage: 'ping',
  async run(ctx) {
    const started = Date.now();
    const sent = await ctx.reply('🏓 Pong!');
    const ms = Date.now() - started;
    await ctx.sock.sendMessage(ctx.jid, { text: `🏓 Pong! ${ms} ms`, edit: sent.key }).catch(() => {});
  },
};
