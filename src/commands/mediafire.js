// MEDIAFIRE: resolve a MediaFire page to its direct file and send it. 20 MB cap.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';

const MAX_BYTES = 20 * 1024 * 1024;

export default {
  name: 'mediafire', aliases: ['mfdl'], category: 'Download',
  description: 'Download a MediaFire file (max 20 MB)',
  usage: 'mediafire <mediafire link>',
  ownerOnly: true,
  async run(ctx) {
    if (!featOn('mediafire')) return ctx.reply('MediaFire downloads are turned off right now.');
    const url = ctx.args[0] || '';
    if (!/mediafire\.com\//.test(url)) return ctx.reply('Send a MediaFire file link.');
    const dir = path.join(config.paths.temp, 'mf-' + Date.now());
    try {
      await ctx.reply('⏳ Resolving the MediaFire link...');
      const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' }, signal: AbortSignal.timeout(20000) })).text();
      const dm = html.match(/id="downloadButton"[^>]*href="([^"]+)"/) || html.match(/href="(https?:\/\/download\d+\.mediafire\.com\/[^"]+)"/);
      if (!dm) return ctx.reply('⚠️ Could not find the file on that page (folder links and expired files are not supported).');
      const direct = dm[1];
      const name = decodeURIComponent(direct.split('/').pop().split('?')[0] || 'mediafire-file').slice(0, 80);
      const r = await fetch(direct, { signal: AbortSignal.timeout(120000) });
      if (!r.ok || !r.body) return ctx.reply('⚠️ The file would not download.');
      if (Number(r.headers.get('content-length') || 0) > MAX_BYTES) return ctx.reply('⚠️ That file is over 20 MB - too big to send here.');
      await fs.promises.mkdir(dir, { recursive: true });
      const out = path.join(dir, name);
      let bytes = 0;
      const ws = fs.createWriteStream(out);
      await new Promise((res, rej) => {
        Readable.fromWeb(r.body).on('data', (c) => { bytes += c.length; if (bytes > MAX_BYTES) { ws.destroy(); rej(new Error('over 20 MB')); } })
          .pipe(ws).on('finish', res).on('error', rej);
      });
      await ctx.sock.sendMessage(ctx.jid, { document: { url: out }, mimetype: r.headers.get('content-type') || 'application/octet-stream', fileName: name, caption: `📦 ${name} (${(bytes / 1048576).toFixed(1)} MB)` }, { quoted: ctx.msg });
    } catch (e) {
      logger.warn('[mediafire] failed: ' + (e?.message || 'error'));
      await ctx.reply('⚠️ Could not download that file (' + (e?.message || 'error') + ').');
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
