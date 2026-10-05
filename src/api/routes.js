import {Router} from './router.js';
import * as c from './controllers.js';
import {ROLES} from './services/keys.js';

export const PREFIX = '/api/v1';
export function buildRouter() {
  const r = new Router(); const add = (m, p, o) => r.add({method: m, path: PREFIX + p, ...o});
  add('GET', '/health', {tag: 'System', summary: 'Liveness check (no auth)', auth: null, rate: 30, handler: c.health});
  add('POST', '/auth/token', {tag: 'Auth', summary: 'Exchange an API key (X-API-Key header) for a 15 minute JWT', auth: null, rate: 10, body: {}, handler: c.issueToken});
  add('GET', '/auth/me', {tag: 'Auth', summary: 'Who am I (id and role)', auth: 'readonly', handler: c.whoami});
  add('GET', '/bot/status', {tag: 'Bot', summary: 'Online state, connection, version, uptime', auth: 'readonly', handler: c.botStatus});
  add('GET', '/bot/runtime', {tag: 'Bot', summary: 'RAM, CPU, disk and command counters', auth: 'service', handler: c.botRuntime});
  add('POST', '/bot/restart', {tag: 'Bot', summary: 'Restart the bot process (owner only, needs confirm:true)', auth: 'owner', body: {confirm: {type: 'boolean', required: true}}, handler: c.botRestart});
  add('GET', '/keys', {tag: 'Keys', summary: 'List API keys (never the secrets)', auth: 'admin', handler: c.keysList});
  add('POST', '/keys', {tag: 'Keys', summary: 'Create an API key; the key is shown once', auth: 'admin', body: {name: {type: 'string', required: true, max: 40}, role: {type: 'string', enum: ROLES}}, handler: c.keysCreate});
  add('DELETE', '/keys/:id', {tag: 'Keys', summary: 'Revoke an API key', auth: 'admin', handler: c.keysRevoke});
  return r;
}
