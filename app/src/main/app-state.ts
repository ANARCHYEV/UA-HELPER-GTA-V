import type { BrowserWindow } from 'electron';
import type { BackendStatusEvent, CliArgs } from '@shared/types';

/**
 * Runtime state shared between windows / services in the main process.
 * Deliberately small: everything persistent lives in storage.ts.
 */

export interface AppWindowState {
  windows: {
    launcher?: BrowserWindow;
    overlay?: BrowserWindow;
    ai?: BrowserWindow;
    wiki?: BrowserWindow;
  };
  quitting: boolean;
  cliArgs: CliArgs;
  backendOnline: boolean;
  backendCheckedAt: number;
  /** Set when unread rule changes exist (drives the update banner). */
  rulesUpdateAvailable: boolean;
}

const state: AppWindowState = {
  windows: {},
  quitting: false,
  cliArgs: { hidden: false, noLauncher: false, project: null },
  backendOnline: false,
  backendCheckedAt: 0,
  rulesUpdateAvailable: false
};

export function getAppState(): AppWindowState {
  return state;
}

export function broadcastToWindows(channel: string, payload: unknown): void {
  for (const win of Object.values(state.windows)) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export type { BackendStatusEvent };
