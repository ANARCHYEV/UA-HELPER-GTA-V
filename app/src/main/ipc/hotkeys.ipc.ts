import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { getHotkeys, setHotkey } from '../services/hotkeys';

export function registerHotkeysIpc(): void {
  ipcMain.handle(IPC.HotkeysGetAll, () => getHotkeys());

  ipcMain.handle(IPC.HotkeysSet, (_e, id: 'overlay' | 'ptt', accelerator: string) => {
    const normalized = accelerator.trim();
    if (!normalized) return false;
    return setHotkey(id, normalized);
  });
}
