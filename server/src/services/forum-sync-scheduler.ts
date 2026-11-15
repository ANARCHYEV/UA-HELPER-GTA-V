export interface ForumSyncResult {
  status: string;
  added: number;
  updated: number;
  removed: number;
  error?: string;
}

export interface ForumSyncSchedulerOptions {
  syncOnStart: boolean;
  cronExpression: string;
  retryDelaysMs: number[];
  runSync: () => Promise<ForumSyncResult>;
  schedule: (expression: string, callback: () => void) => unknown;
  setDelay: (callback: () => void, milliseconds: number) => unknown;
  info: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

/** Starts the one-off boot sync and the recurring, low-frequency sync. */
export function startForumSyncScheduler(options: ForumSyncSchedulerOptions): void {
  let retryIndex = 0;
  const scheduleRetry = (): void => {
    const delay = options.retryDelaysMs[retryIndex++];
    if (!Number.isFinite(delay) || delay < 5 * 60_000) {
      if (delay !== undefined) options.error('sync: invalid retry delay suppressed', { delay });
      return;
    }
    options.info('sync: retry scheduled', { inMinutes: Math.round(delay / 60_000) });
    options.setDelay(() => trigger('retry'), delay);
  };

  const trigger = (source: 'startup' | 'cron' | 'retry'): void => {
    options.info(`${source}: forum sync starting`);
    void options.runSync()
      .then((result) => {
        options.info(`${source}: forum sync finished`, result);
        if (result.status === 'error') scheduleRetry();
        else retryIndex = 0;
      })
      .catch((error: unknown) => {
        options.error(`${source}: forum sync crashed`, error);
        scheduleRetry();
      });
  };

  if (options.syncOnStart) trigger('startup');
  if (!options.cronExpression) return;

  options.schedule(options.cronExpression, () => trigger('cron'));
  options.info('cron: sync scheduled', { expr: options.cronExpression });
}
