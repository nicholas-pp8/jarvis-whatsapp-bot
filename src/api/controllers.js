import {ok} from './response.js';
import {badRequest, forbidden} from './errors.js';
import {sign} from './services/jwt.js';
import {createKey, listKeys, revokeKey, findKey, ROLES, hasRole} from './services/keys.js';
import * as bot from './services/botService.js';
import {emit} from './events/bus.js';
import {log} from './logger.js';

export const health = () => ok({status: 'ok', time: new Date().toISOString()});
export const botStatus = () => ok(bot.status());
export const botRuntime = async () => ok(await bot.runtime());
export function botRestart({body, caller}) {
  if (body.confirm !== true) throw badRequest('Send {"confirm": true} to restart');
  log('warn', 'bot restart requested', {by: caller.id}); emit('bot.restart', {by: caller.id}); bot.scheduleRestart();
  return ok({restarting: true}, 202);
}
export function issueToken({body, headers}) {
  const k = findKey(String(headers['x-api-key'] || body.apiKey || ''));
  if (!k) throw forbidden('Invalid API key');
  return ok({token: sign({sub: k.id, role: k.role}, 900), tokenType: 'Bearer', expiresIn: 900, role: k.role});
}
export const whoami = ({caller}) => ok({id: caller.id, role: caller.role, via: caller.via});
export const keysList = () => ok({keys: listKeys(), roles: ROLES});
export function keysCreate({body, caller}) {
  if (body.role && !hasRole(caller.role, body.role)) throw forbidden('Cannot create a key above your own role');
  const k = createKey(body.name, body.role || 'readonly'); log('warn', 'api key created', {by: caller.id, id: k.id, role: k.role});
  return ok({id: k.id, role: k.role, apiKey: k.key, note: 'Store this key now. It is never shown again.'}, 201);
}
export function keysRevoke({params, caller}) {
  if (!revokeKey(params.id)) throw badRequest('No such key'); log('warn', 'api key revoked', {by: caller.id, id: params.id}); return ok({revoked: true});
}
