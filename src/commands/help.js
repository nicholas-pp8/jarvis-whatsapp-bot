import config from '../config/config.js';

export default {
  name: 'help',
  aliases: ['h'],
  category: 'General',
  description: 'Explain how to use the bot or one command',
  usage: 'help [command]',
  async run(ctx) {
    const p = config.prefix;
    const wanted = ctx.args[0]?.replace(p, '').toLowerCase();
    if (wanted) {
      const cmd = ctx.commands.get(wanted);
      if (!cmd || cmd.hidden) return ctx.reply(`❌ Unknown command: ${wanted}\nType ${p}menu to see what is available.`);
      const aliases = cmd.aliases?.length ? `\nAliases: ${cmd.aliases.map((a) => p + a).join(', ')}` : '';
      return ctx.reply(`*${p}${cmd.name}*\n${cmd.description}\n\nUsage: ${p}${cmd.usage}${aliases}`);
    }
    await ctx.reply(
      [
        `*${config.botName} help*`,
        '',
        `• Commands start with "${p}" (example: ${p}ping).`,
        `• ${p}menu lists every command.`,
        `• Send a song name or YouTube link with ${p}play (audio) or ${p}video.`,
        `• Send a Pinterest link with ${p}pinterest.`,
        `• ${p}help <command> shows details for one command.`,
        '',
        'Downloads are limited in size and time, and may be queued when the bot is busy.',
      ].join('\n'),
    );
  },
};
