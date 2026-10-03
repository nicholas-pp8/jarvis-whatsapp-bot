import settings from '../config/settings.js';
import { getSetting } from '../database/database.js';

// Feature switches follow command categories. A switch changed with /settings is saved in the
// bot's own data store and wins over settings.js; settings.js is the default.
export const FEATURES = Object.keys(settings.features);
export const featureKey = (cmd) => String(cmd.category || '').toLowerCase();
export function featureOn(name) {
  const o = getSetting('featureOverrides', {});
  if (typeof o[name] === 'boolean') return o[name];
  return settings.features[name] !== false;
}
export function commandOn(cmd) {
  if ((settings.disabledCommands || []).includes(cmd.name)) return false;
  const k = featureKey(cmd);
  return !k || !(k in settings.features) || featureOn(k);
}
