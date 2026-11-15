/** Manual sync trigger: npm run sync:run */
import { runSync } from '../services/sync-worker';
import { getDb } from '../db/db';
import { logger } from '../services/logger';

getDb();
runSync()
  .then((res) => {
    logger.info('sync result:', res);
    process.exit(0);
  })
  .catch((err) => {
    logger.error('sync failed:', err);
    process.exit(1);
  });
