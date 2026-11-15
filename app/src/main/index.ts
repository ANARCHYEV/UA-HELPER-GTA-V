import { app } from 'electron';
import { loadConfig } from './config-loader';
import { logger } from './services/logger';
import { initStorage } from './services/storage';
import { seedKnowledgeBase } from './services/knowledge';
import { registerAllIpc } from './ipc/register-all';
import {
  bootstrapWindows,
  showLauncher,
  toggleOverlay,
  createLauncherWindow
} from './services/window-manager';
import { createTray, destroyTray } from './services/tray';
import { registerAllHotkeys } from './services/hotkeys';
import { applyAutoLaunch } from './services/auto-launch';
import { initUpdater, checkForUpdates } from './services/updater';
import { startSyncTimer } from './services/rules-sync';
import { isBackendConfigured, serverClient } from './services/server-client';
import { getAppState, broadcastToWindows } from './app-state';
import { IPC_EVENTS } from '@shared/ipc-channels';
import { getSettings } from './services/storage';
import { startDiscordPresence, stopDiscordPresence } from './services/discord-presence';

/**
 * UA Helper - main process entry.
 * CLI flags (for future launcher integration):
 *   --hidden          start minimized to tray
 *   --no-launcher     overlay-only mode (no launcher window on top)
 *   --project=<id>    preselect project
 */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function parseCliArgs(): void {
  const state = getAppState();
  state.cliArgs = {
    hidden: process.argv.includes('--hidden'),
    noLauncher: process.argv.includes('--no-launcher'),
    project: process.argv.find((a) => a.startsWith('--project='))?.split('=')[1] ?? null
  };
}

function startBackendMonitor(): void {
  if (!isBackendConfigured()) {
    logger.info('backend: monitor disabled until backend.baseUrl is configured');
    return;
  }
  const check = async (): Promise<void> => {
    try {
      await serverClient.health();
      const state = getAppState();
      const wasOnline = state.backendOnline;
      state.backendOnline = true;
      state.backendCheckedAt = Date.now();
      if (!wasOnline) broadcastToWindows(IPC_EVENTS.BackendStatus, { online: true, checkedAt: state.backendCheckedAt });
    } catch {
      const state = getAppState();
      const wasOnline = state.backendOnline;
      state.backendOnline = false;
      state.backendCheckedAt = Date.now();
      if (wasOnline) broadcastToWindows(IPC_EVENTS.BackendStatus, { online: false, checkedAt: state.backendCheckedAt });
    }
  };
  void check();
  setInterval(() => void check(), 5 * 60 * 1000);
}

app.on('second-instance', () => {
  showLauncher();
});

app.whenReady().then(() => {
  try {
    parseCliArgs();
    const cfg = loadConfig();

    app.setAppUserModelId(`dev.uahelper.app`);
    initStorage();
    seedKnowledgeBase(false);
    registerAllIpc();
    initUpdater();

    bootstrapWindows();
    createTray(showLauncher, () => void toggleOverlay());

    applyAutoLaunch();
    registerAllHotkeys();
    startSyncTimer();
    startBackendMonitor();
    startDiscordPresence({
      clientId: cfg.auth.discordClientId ?? '',
      state: 'В головному меню',
      details: 'UA Helper · Ukraine GTA 5',
      largeImageKey: 'ua_helper',
      largeImageText: 'UA Helper',
      smallImageKey: 'ua_helper',
      smallImageText: 'Ukraine GTA 5'
    });

    if (getSettings().checkUpdatesOnStart) {
      checkForUpdates();
    }

    logger.info('app: started', {
      name: cfg.product.name,
      version: cfg.product.version,
      args: getAppState().cliArgs
    });

    // Overlay-only mode for future integration with the official launcher.
    if (getAppState().cliArgs.noLauncher) {
      const launcher = createLauncherWindow();
      launcher.hide();
      void toggleOverlay();
    }
  } catch (err) {
    logger.error('app: fatal startup error', err instanceof Error ? err.stack : err);
    app.quit();
  }
});

app.on('before-quit', () => {
  getAppState().quitting = true;
  stopDiscordPresence();
  destroyTray();
});

app.on('window-all-closed', () => {
  // Desktop helper: stay alive in the tray, like the original overlay apps.
  // Quit only via tray menu -> app.quit().
});

app.on('web-contents-created', (_event, contents) => {
  // Hard security policy: no new windows, no arbitrary navigation.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });
});
