import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';

/** Tiny JSON store with atomic writes and debounced saving. */
class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = structuredClone(defaults);
    this.timer = null;
    this.writing = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.data = { ...structuredClone(this.defaults), ...JSON.parse(raw) };
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn('Database file unreadable, starting fresh');
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    const json = JSON.stringify(this.data);
    this.writing = this.writing
      .then(async () => {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        await fs.writeFile(tmp, json);
        await fs.rename(tmp, this.file);
      })
      .catch((err) => logger.warn('Database save failed:', err));
    return this.writing;
  }
}

const db = new JsonStore(path.join(config.paths.data, 'db.json'), {
  stats: { commands: 0, downloads: 0, failures: 0, statusViewed: 0, startedAt: null },
  commandUsage: {},
  recent: [],
  settings: {},
});

export async function initDatabase() {
  await db.load();
  db.data.stats.startedAt = new Date().toISOString();
  db.save();
}

export const getStats = () => db.data.stats;
export const getUsage = () => db.data.commandUsage;
export const getRecent = () => db.data.recent || [];

export function bump(stat) {
  db.data.stats[stat] = (db.data.stats[stat] || 0) + 1;
  db.save();
}

export function recordCommand(name) {
  db.data.stats.commands++;
  db.data.commandUsage[name] = (db.data.commandUsage[name] || 0) + 1;
  // Only the command name and time are kept (no arguments, no numbers).
  db.data.recent = [{ name, at: Date.now() }, ...(db.data.recent || [])].slice(0, 5);
  db.save();
}

export const getSetting = (key, fallback) => db.data.settings[key] ?? fallback;
export function setSetting(key, value) {
  db.data.settings[key] = value;
  db.save();
}

export const flushDatabase = () => db.flush();
