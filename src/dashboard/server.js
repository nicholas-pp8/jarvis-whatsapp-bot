// Owner web dashboard: read-only live stats. OFF unless DASHBOARD_PORT is set. Needs the secret token to open.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { snapshot } from '../utils/botstats.js';

const tokenFile = () => path.join(config.paths.data, 'dashboard-token');
export function getToken(rotate = false) {
  try { if (!rotate) { const t = fs.readFileSync(tokenFile(), 'utf8').trim(); if (t.length >= 32) return t; } } catch { /* create */ }
  const t = crypto.randomBytes(24).toString('hex');
  try { fs.mkdirSync(path.dirname(tokenFile()), { recursive: true }); fs.writeFileSync(tokenFile(), t, { mode: 0o600 }); } catch { /* best effort */ }
  return t;
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const fails = new Map();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mb = (n) => (n ? (n / 1048576).toFixed(0) + ' MB' : '-');
const dur = (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

export function render(s) {
  const rows = (s.usage || []).slice(0, 12).map(([n, c]) => `<tr><td>/${esc(n)}</td><td>${c}</td></tr>`).join('');
  const recent = (s.recent || []).slice(-8).reverse().map((r) => `<li>${esc(typeof r === 'string' ? r : JSON.stringify(r)).slice(0, 160)}</li>`).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="15"><title>${esc(s.botName)} dashboard</title>
<style>body{font:15px system-ui;background:#07101c;color:#d8f6ff;margin:0;padding:18px}h1{color:#35e0ff;margin:0 0 12px}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.c{background:#0d1d33;border:1px solid #17406a;border-radius:10px;padding:12px}.c b{display:block;font-size:22px;color:#35e0ff}table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:4px 8px;border-bottom:1px solid #17406a}small{color:#7fa8bd}</style>
<h1>${esc(s.botName)} dashboard</h1><div class="g">
<div class="c"><small>WhatsApp</small><b>${esc(s.wa)}</b></div><div class="c"><small>Uptime</small><b>${dur(s.uptimeSec)}</b></div>
<div class="c"><small>RAM</small><b>${mb(s.ramUsed)} / ${mb(s.ramLimit)}</b></div><div class="c"><small>CPU</small><b>${s.cpuPct}%</b></div>
<div class="c"><small>Commands run</small><b>${s.totalCommands}</b></div><div class="c"><small>Downloads</small><b>${s.downloads}</b></div>
<div class="c"><small>Failures</small><b>${s.failures}</b></div><div class="c"><small>Commands loaded</small><b>${s.plugins}</b></div>
<div class="c"><small>Disk free</small><b>${mb(s.diskFree)}</b></div></div>
<h3>Top commands</h3><table>${rows}</table><h3>Recent</h3><ul>${recent}</ul><small>Auto-refreshes every 15 s. Read-only.</small>`;
}

export function startDashboard(registry) {
  const port = Number(process.env.DASHBOARD_PORT || 0);
  if (!port) return null;
  const host = process.env.DASHBOARD_HOST || '127.0.0.1';
  const srv = http.createServer(async (req, res) => {
    try {
      const ip = req.socket.remoteAddress || '?';
      const f = fails.get(ip) || { n: 0, t: 0 };
      if (f.n >= 8 && Date.now() - f.t < 600_000) { res.writeHead(429); return res.end('Too many attempts'); }
      const u = new URL(req.url, 'http://x');
      const given = u.searchParams.get('t') || (req.headers.cookie || '').match(/jvdash=([a-f0-9]+)/)?.[1] || '';
      if (!safeEq(given, getToken())) { fails.set(ip, { n: f.n + 1, t: Date.now() }); res.writeHead(401, { 'content-type': 'text/plain' }); return res.end('Unauthorized'); }
      fails.delete(ip);
      const s = await snapshot(registry);
      const h = { 'cache-control': 'no-store', 'set-cookie': `jvdash=${given}; HttpOnly; SameSite=Strict; Path=/`, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" };
      if (u.pathname === '/api/stats') { res.writeHead(200, { ...h, 'content-type': 'application/json' }); return res.end(JSON.stringify(s)); }
      res.writeHead(200, { ...h, 'content-type': 'text/html; charset=utf-8' }); res.end(render(s));
    } catch (e) { res.writeHead(500); res.end('Error'); }
  });
  srv.on('error', (e) => logger.warn('[dashboard] ' + e.message));
  srv.listen(port, host, () => logger.info(`[dashboard] listening on ${host}:${port}`));
  srv.unref?.();
  return srv;
}
