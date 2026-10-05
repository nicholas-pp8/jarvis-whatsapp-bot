import {validateLocales} from './i18n/validate.js';
import {start as startOps,stop as stopOps,recordError} from './ops/index.js';
import {onError} from './utils/logger.js';
import config from './config/config.js';
import logger from './utils/logger.js';
import { ensureDirs, cleanupStaleJobs } from './utils/fileManager.js';
import { initDatabase } from './database/database.js';
import {bootSelfTest} from './ops/selftest.js';
import { loadCommands,registry,commandLoadFailures } from './handlers/commandHandler.js';
import { startWhatsApp, shutdown } from './connection/whatsapp.js';

async function main() {
  logger.info(`Starting ${config.botName} (prefix "${config.prefix}", auto status view ${config.autoStatusView ? 'on' : 'off'})`);
  await ensureDirs();
  await initDatabase();
  await loadCommands();
  const languages=validateLocales();logger.info(`[i18n] registry ${languages.registered}; complete schema ${languages.complete}; partial ${languages.partial}; missing keys fall back to English`);
  const checks=bootSelfTest(registry,commandLoadFailures);if(checks.failed.length)throw new Error('Startup self-test failed: '+checks.failed.join(', '));
  await cleanupStaleJobs(0); // anything left in temp from a previous run is abandoned
  setInterval(() => cleanupStaleJobs(), 10 * 60 * 1000).unref();
  onError(recordError);startOps();
  try { (await import('./dashboard/server.js')).startDashboard(registry); } catch (e) { logger.warn('[dashboard] not started: ' + e.message); }
  try { (await import('./telemetry/index.js')).startTelemetry(); } catch (e) { logger.warn('[telemetry] not started: ' + e.message); }
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
