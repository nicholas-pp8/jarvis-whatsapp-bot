import { runDownloadCommand } from './_download.js';

export default {
  name: 'pinterest',
  aliases: ['pin'],
  category: 'Downloaders',
  description: 'Find a Pinterest pin by name, or download one from a link',
  usage: 'pinterest <name or link>',
  minArgs: 1,
  async run(ctx) {
    await runDownloadCommand(ctx, { expect: 'pinterest', kind: 'video', label: 'pin' });
  },
};
