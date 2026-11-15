import { autoUpdater } from 'electron-updater';
import { loadConfig } from '../config-loader';
import { logger } from './logger';
import { broadcastToWindows } from '../app-state';
import { IPC_EVENTS } from '@shared/ipc-channels';
import type { UpdateState } from '@shared/types';

/**
 * App updates via electron-updater.
 * Provider comes from config/app.config.json (generic VPS or GitHub).
 * Progress and state are broadcast to all renderer windows.
 */

let lastState: UpdateState = { status: 'idle' };
let updaterEnabled = false;

function setState(state: UpdateState): void {
  lastState = state;
  broadcastToWindows(IPC_EVENTS.UpdatesState, state);
}

function configure(): void {
  const cfg = loadConfig();
  try {
    if (cfg.updates.provider === 'generic') {
      if (!cfg.updates.url || cfg.updates.url.includes('CHANGE-ME')) {
        updaterEnabled = false;
        setState({ status: 'not-available' });
        return;
      }
      autoUpdater.setFeedURL({ provider: 'generic', url: cfg.updates.url });
    } else {
      if (!cfg.updates.githubOwner || !cfg.updates.githubRepo) {
        updaterEnabled = false;
        setState({ status: 'not-available' });
        return;
      }
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: cfg.updates.githubOwner ?? '',
        repo: cfg.updates.githubRepo ?? ''
      });
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;
    updaterEnabled = true;
  } catch (err) {
    logger.warn('updater: configure failed', err);
  }
}

export function initUpdater(): void {
  configure();

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }));
  autoUpdater.on('update-available', (info) => setState({ status: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => setState({ status: 'not-available' }));
  autoUpdater.on('download-progress', (progress) =>
    setState({ status: 'downloading', progress: Math.round(progress.percent) })
  );
  autoUpdater.on('update-downloaded', (info) => setState({ status: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => {
    logger.warn('updater: error', err instanceof Error ? err.message : err);
    setState({ status: 'error', error: 'Не вдалося перевірити оновлення. Сервер недоступний.' });
  });
}

export function getCurrentUpdateState(): UpdateState {
  return lastState;
}

export function checkForUpdates(): UpdateState {
  if (!app_isPackaged() || !updaterEnabled) {
    setState({ status: 'not-available' });
    return lastState;
  }
  void autoUpdater.checkForUpdates().catch(() => {
    /* error handler above emits state */
  });
  setState({ status: 'checking' });
  return lastState;
}

export function downloadUpdate(): void {
  if (!app_isPackaged() || !updaterEnabled) return;
  void autoUpdater.downloadUpdate().catch(() => {
    /* handled by error event */
  });
  setState({ status: 'downloading', progress: 0 });
}

export function installUpdate(): void {
  if (!app_isPackaged() || !updaterEnabled || lastState.status !== 'downloaded') return;
  autoUpdater.quitAndInstall(false, true);
}

function app_isPackaged(): boolean {
  // small helper to keep imports minimal
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('electron').app.isPackaged as boolean;
}
