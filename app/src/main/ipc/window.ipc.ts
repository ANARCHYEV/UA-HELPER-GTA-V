import { ipcMain, BrowserWindow, screen } from 'electron';
import { IPC, IPC_EVENTS } from '@shared/ipc-channels';
import { getAppState } from '../app-state';
import type { FullscreenState } from '@shared/types';
import { checkExclusiveFullscreen } from '../services/fullscreen-check';
import {
  applyPin,
  applyStreamerMode,
  applyOverlayOpacity,
  toggleOverlay,
  createAiWindow,
  createWikiWindow
} from '../services/window-manager';
import { getSettings, patchSettings } from '../services/storage';

export function registerWindowIpc(): void {
  ipcMain.handle(IPC.WindowControl, (event, action: 'minimize' | 'hide' | 'close') => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else win.hide(); // close & hide behave the same: app lives in tray
  });

  ipcMain.handle(IPC.WindowSplashComplete, (event) => {
    const win = getAppState().windows.launcher;
    if (!win || win.webContents !== event.sender) return;
    win.setResizable(true);
    win.setMinimumSize(940, 620);
    win.setSize(1100, 700, true);
    win.center();
  });

  ipcMain.handle(IPC.WindowPinToggle, () => {
    const current = getSettings().pinWindow;
    const next = !current;
    patchSettings({ pinWindow: next });
    applyPin(next);
    return next;
  });

  ipcMain.handle(IPC.WindowPinGet, () => getSettings().pinWindow);

  ipcMain.handle(IPC.WindowOpacitySet, (_e, value: number) => {
    const clamped = Math.min(1, Math.max(0.3, value));
    patchSettings({ overlayOpacity: clamped });
    applyOverlayOpacity(clamped);
  });

  ipcMain.handle(IPC.WindowStreamerSet, (_e, enabled: boolean) => {
    patchSettings({ streamerMode: enabled });
    applyStreamerMode(enabled);
  });

  ipcMain.handle(IPC.WindowOverlayToggle, () => toggleOverlay());

  let overlayQuestion: string | null = null;
  ipcMain.handle(IPC.WindowAiOpen, (_event, prompt?: string) => {
    const win = createAiWindow();
    if (typeof prompt === 'string' && prompt.trim()) {
      overlayQuestion = prompt.trim().slice(0, 8000);
      win.webContents.send(IPC_EVENTS.OverlayQuestion);
    }
  });
  ipcMain.handle(IPC.WindowAiTakeQuestion, (event) => {
    if (event.sender !== getAppState().windows.ai?.webContents) return null;
    const question = overlayQuestion;
    overlayQuestion = null;
    return question;
  });
  ipcMain.handle(IPC.WindowWikiOpen, () => { createWikiWindow(); });
  ipcMain.handle(IPC.WindowOverlayFit, (event, height: number) => {
    const win = getAppState().windows.overlay;
    if (!win || win.webContents !== event.sender || !Number.isFinite(height)) return;
    const bounds = win.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const next = Math.max(56, Math.min(Math.ceil(height), area.height, 520));
    if (bounds.height !== next) {
      win.setBounds({ ...bounds, y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - next)), height: next });
    }
  });

  ipcMain.handle(IPC.WindowFullscreenCheck, (): FullscreenState => {
    const res = checkExclusiveFullscreen();
    return {
      supported: res.supported,
      exclusiveFullscreen: res.exclusiveFullscreen,
      state: res.state
    };
  });

  ipcMain.handle(IPC.WindowOnTopSet, (_e, enabled: boolean) => {
    patchSettings({ pinWindow: enabled });
    applyPin(enabled);
  });
}
