import { globalShortcut } from 'electron';
import { getSettings, patchSettings } from './storage';
import { logger } from './logger';
import { getAppState } from '../app-state';
import { IPC_EVENTS } from '@shared/ipc-channels';

/**
 * Global hotkeys:
 * - overlay toggle (show/hide the compact overlay above the game)
 * - push-to-talk toggle (starts/stops voice recording in overlay & AI window)
 */

function registerOverlay(accelerator: string): boolean {
  try {
    return globalShortcut.register(accelerator, () => {
      void toggleOverlayWindow();
    });
  } catch (err) {
    logger.warn('hotkeys: overlay register failed', err);
    return false;
  }
}

function registerPtt(accelerator: string): boolean {
  try {
    return globalShortcut.register(accelerator, () => {
      const { ai, overlay } = getAppState().windows;
      const target = ai?.isFocused() ? ai : overlay;
      if (!target || target.isDestroyed()) return;
      if (!target.isVisible()) target.show();
      target.focus();
      target.webContents.send(IPC_EVENTS.VoicePtt);
    });
  } catch (err) {
    logger.warn('hotkeys: ptt register failed', err);
    return false;
  }
}

export function registerAllHotkeys(): void {
  const s = getSettings();
  globalShortcut.unregisterAll();
  const okOverlay = registerOverlay(s.hotkeyOverlay);
  const okPtt = registerPtt(s.hotkeyPtt);
  logger.info('hotkeys: registered', { okOverlay, okPtt, overlay: s.hotkeyOverlay, ptt: s.hotkeyPtt });
}

export function setHotkey(id: 'overlay' | 'ptt', accelerator: string): boolean {
  const current = getSettings();
  const key = id === 'overlay' ? 'hotkeyOverlay' : 'hotkeyPtt';
  const oldValue = current[key];
  const other = id === 'overlay' ? current.hotkeyPtt : current.hotkeyOverlay;
  if (accelerator.toLowerCase() === other.toLowerCase()) return false;
  patchSettings({ [key]: accelerator } as Partial<typeof current>);
  registerAllHotkeys();
  const ok = getSettings()[key] === accelerator && globalShortcut.isRegistered(accelerator);
  if (!ok) {
    // rollback on failure
    patchSettings({ [key]: oldValue } as Partial<typeof current>);
    registerAllHotkeys();
    return false;
  }
  return true;
}

export function getHotkeys(): { overlay: string; ptt: string } {
  const s = getSettings();
  return { overlay: s.hotkeyOverlay, ptt: s.hotkeyPtt };
}

export async function toggleOverlayWindow(): Promise<boolean> {
  const { windows } = getAppState();
  const overlay = windows.overlay;
  if (overlay && !overlay.isDestroyed()) {
    if (overlay.isVisible()) {
      overlay.hide();
      return false;
    }
    overlay.show();
    overlay.focus();
    return true;
  }
  return false;
}
