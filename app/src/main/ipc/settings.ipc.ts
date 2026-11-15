import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import {
  getSettings,
  patchSettings,
  getUsageStats,
  clearAiHistory
} from '../services/storage';
import { setAutoLaunch } from '../services/auto-launch';
import type { AppSettings } from '@shared/types';

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SettingsGetAll, (): AppSettings => getSettings());

  ipcMain.handle(IPC.SettingsPatch, (_e, patch: Partial<AppSettings>) => {
    // autoLaunch is applied at the OS level, not stored raw
    if (typeof patch.autoLaunch === 'boolean') {
      setAutoLaunch(patch.autoLaunch);
    }
    return patchSettings(patch);
  });

  ipcMain.handle(IPC.SettingsStatsGet, () => getUsageStats());

  ipcMain.handle(IPC.SettingsHistoryClear, () => {
    clearAiHistory();
  });
}
