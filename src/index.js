import {start as startOps,stop as stopOps,recordError} from './ops/index.js';
import {onError} from './utils/logger.js';
import config from './config/config.js';
import logger from './utils/logger.js';
import { ensureDirs, cleanupStaleJobs } from './utils/fileManager.js';
import { initDatabase } from './database/database.js';
import { loadCommands } from './handlers/commandHandler.js';
import { startWhatsApp, shutdown } from './connection/whatsapp.js';

async function main() {
  logger.info(`Starting ${config.botName} (prefix "${config.prefix}", auto status view ${config.autoStatusView ? 'on' : 'off'})`);
  await ensureDirs();
  await initDatabase();
  await loadCommands();
  await cleanupStaleJobs(0); // anything left in temp from a previous run is abandoned
  setInterval(() => cleanupStaleJobs(), 10 * 60 * 1000).unref();
  onError(recordError);startOps();
  await startWhatsApp();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
// Fatal runtime failures restart only Jarvis via its host supervisor.
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => {logger.error('Uncaught exception:', err);stopOps();shutdown(1);});

main().catch((err) => {
  logger.error('Fatal startup error:', err);
  process.exit(1);
});
