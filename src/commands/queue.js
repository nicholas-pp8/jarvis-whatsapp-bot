import { downloadQueue } from '../utils/downloader.js';
import config from '../config/config.js';

export function queueText(st, prefix = '/') {
  if (!st.mine) {
    return st.running || st.waiting
      ? `📥 You have no downloads right now.\nBot queue: ${st.running} running, ${st.waiting} waiting.`
      : `📥 You have no downloads right now, and the queue is empty. Try ${prefix}play or ${prefix}video.`;
  }
  const where = st.position ? `Waiting in line at position ${st.position} of ${st.waiting}.` : 'Running now.';
  return `📥 You have ${st.mine} download${st.mine > 1 ? 's' : ''} in progress.\n${where}\nBot queue: ${st.running} running, ${st.waiting} waiting.`;
}
export default {
  name: 'queue', aliases: ['dlqueue', 'jobs'], category: 'Downloaders',
  description: 'See your download queue position',
  usage: 'queue',
  minArgs: 0,
  async run(ctx) { return ctx.reply(queueText(downloadQueue.userStatus(ctx.sender), config.prefix)); },
};
