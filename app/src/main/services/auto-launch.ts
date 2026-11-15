import { app } from 'electron';
import { getSettings, patchSettings } from './storage';
import { logger } from './logger';

/**
 * OS-level auto launch (login item) with --hidden so the app starts
 * minimized to tray. Works reliably only for installed (packaged) builds.
 */

export function applyAutoLaunch(): void {
  try {
    const s = getSettings();
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: s.autoLaunch,
        args: ['--hidden'],
        path: process.execPath
      });
    }
  } catch (err) {
    logger.warn('auto-launch: apply failed', err);
  }
}

export function setAutoLaunch(enabled: boolean): boolean {
  patchSettings({ autoLaunch: enabled });
  applyAutoLaunch();
  try {
    return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin === enabled || !app.isPackaged;
  } catch {
    return !app.isPackaged;
  }
}

export function getAutoLaunch(): boolean {
  if (!app.isPackaged) return getSettings().autoLaunch;
  try {
    return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
  } catch {
    return false;
  }
}
