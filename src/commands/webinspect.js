// WEBINSPECT: fetch a URL and report title, status, size, server, redirects.
// Blocks private/internal addresses (SSRF guard) before fetching.
import dns from 'node:dns/promises';
import net from 'node:net';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { featOn } from '../config/features.js';

const privateIp = (ip) => net.isIP(ip) && (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^127\./.test(ip) || /^169\.254\./.test(ip) || ip === '::1' || /^f[cd]/i.test(ip));

export default {
  name: 'webinspect', aliases: ['inspect', 'siteinfo'], category: 'Tools',
  description: 'Inspect a website: status, title, server, size',
  usage: 'webinspect <url>',
  async run(ctx) {
    if (!featOn('webinspect')) return ctx.reply('Web inspect is turned off right now.');
    let url = (ctx.args[0] || '').trim();
    if (!url) return ctx.reply('Give me a URL. Example: ' + config.prefix + 'webinspect https://example.com');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let host;
    try { host = new URL(url).hostname; } catch { return ctx.reply('That is not a valid URL.'); }
    try {
      // SSRF guard: resolve and refuse private/internal targets.
      const addrs = (await dns.lookup(host, { all: true })).map((a) => a.address);
      if (!addrs.length || addrs.some(privateIp)) return ctx.reply('⛔ That address is not inspectable (private or unreachable).');
      const t0 = Date.now();
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JarvisBot/1.0)' } });
      const body = await r.text();
      const ms = Date.now() - t0;
      const title = (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim().slice(0, 100) || '(no title)';
      const desc = (body.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) || [])[1]?.trim().slice(0, 150) || '';
      const kb = (Buffer.byteLength(body) / 1024).toFixed(1);
      return ctx.reply(`*Web inspect:* ${url}\n\n• Status: ${r.status}\n• Title: ${title}\n${desc ? '• About: ' + desc + '\n' : ''}• Server: ${r.headers.get('server') || 'hidden'}\n• Type: ${(r.headers.get('content-type') || '?').split(';')[0]}\n• Page size: ${kb} KB\n• Final URL: ${r.url}\n• Time: ${ms} ms\n• IPs: ${addrs.slice(0, 3).join(', ')}`);
    } catch (e) {
      logger.warn('[webinspect] failed: ' + (e?.message || 'error'));
      return ctx.reply('⚠️ Could not inspect that site (' + (e?.message || 'error') + ').');
    }
  },
};
