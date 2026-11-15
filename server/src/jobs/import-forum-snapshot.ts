/** Offline forum import: npm run sync:import -- path/to/forum-snapshot.json */
import { getDb } from '../db/db';
import { logger } from '../services/logger';
import { importForumSnapshot } from '../services/forum-snapshot-import';

const snapshotPath = process.argv[2];
if (!snapshotPath) {
  console.error('Вкажіть шлях: npm run sync:import -- path/to/forum-snapshot.json');
  process.exit(1);
}

getDb();
importForumSnapshot(snapshotPath)
  .then((result) => {
    logger.info('offline forum import result:', result);
    process.exit(result.status === 'error' ? 1 : 0);
  })
  .catch((error) => {
    logger.error('offline forum import failed:', error);
    process.exit(1);
  });
