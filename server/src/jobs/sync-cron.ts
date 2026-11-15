/** Cron worker as a standalone process (alternative to in-API cron). */
import cron from 'node-cron';
import { config } from '../config';
import { getDb } from '../db/db';
import { runSync } from '../services/sync-worker';
import { cleanupExpiredCodes } from '../services/telegram-auth';
import { logger } from '../services/logger';

getDb();
logger.info('sync worker started', { cron: config.syncCron });

cron.schedule(config.syncCron, () => {
  void runSync();
});
cron.schedule('0 * * * *', () => cleanupExpiredCodes());
