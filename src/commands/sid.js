import {telemetry} from '../telemetry/index.js';
import {enabled} from '../telemetry/client.js';

export default {
  name: 'sid', aliases: ['installid'], category: 'System',
  description: 'Show this install\'s S-ID and what the anonymous ping sends', usage: 'sid', minArgs: 0,
  async run(ctx) {
    const sid = telemetry.sid;
    const lines = [`🆔 *Install S-ID:* ${sid || 'not registered yet (appears after the first ping)'}`];
    if (!enabled()) { lines.push('Telemetry is OFF (TELEMETRY=off). Nothing is sent.'); return ctx.reply(lines.join('\n')); }
    lines.push('', 'The anonymous ping sends only: a random install id, bot version, uptime, connected yes/no, a one-way hash of the paired number, and how many times each built-in command ran.', 'Never sent: messages, chats, contacts, group names, files, or raw phone numbers. Turn it off with TELEMETRY=off.');
    await ctx.reply(lines.join('\n'));
  },
};
