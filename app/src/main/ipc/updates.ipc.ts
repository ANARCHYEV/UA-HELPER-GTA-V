import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  getCurrentUpdateState
} from '../services/updater';
import type { UpdateState } from '@shared/types';

export function registerUpdatesIpc(): void {
  ipcMain.handle(IPC.UpdatesCheck, (): UpdateState => checkForUpdates());
  ipcMain.handle(IPC.UpdatesDownload, (): UpdateState => {
    downloadUpdate();
    return getCurrentUpdateState();
  });
  ipcMain.handle(IPC.UpdatesInstall, () => {
    installUpdate();
  });
}
