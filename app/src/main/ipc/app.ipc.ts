import { clipboard, ipcMain, shell, BrowserWindow } from 'electron';
import { IPC, IPC_EVENTS } from '@shared/ipc-channels';
import type { AppInfo, CliArgs } from '@shared/types';
import pkg from '../../../package.json';
import { loadConfig } from '../config-loader';
import { getAppState } from '../app-state';
import { logger } from '../services/logger';

export function registerAppIpc(): void {
  ipcMain.handle(IPC.AppInfoGet, (): AppInfo => {
    const cfg = loadConfig();
    return {
      config: cfg,
      // Version comes from the workspace package.json, inlined at build time,
      // so it is correct in dev, raw-run and packaged modes alike.
      appVersion: pkg.version,
      electronVersion: process.versions.electron,
      platform: process.platform
    };
  });

  ipcMain.handle(IPC.AppCliArgs, (): CliArgs => getAppState().cliArgs);

  ipcMain.handle(IPC.AppClipboardWrite, (_e, text: string) => {
    clipboard.writeText(String(text ?? ''));
  });

  ipcMain.handle(IPC.AppExternalOpen, async (_e, url: string) => {
    // Only http(s) links are allowed to be opened in the system browser.
    if (/^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return;
    }
    logger.warn('app: blocked non-http external url', url);
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send(IPC_EVENTS.ToastPush, { type: 'error', message: 'Посилання заблоковане.' });
  });
}
