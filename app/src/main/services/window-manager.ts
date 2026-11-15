import { BrowserWindow, session } from 'electron';
import { join } from 'path';
import { loadConfig } from '../config-loader';
import { logger } from './logger';
import { getSettings as readSettings } from './storage';
import { getAppState } from '../app-state';

/**
 * Window management: launcher, compact overlay, AI and wiki windows.
 * All windows are frameless (custom titlebar in renderer) and hide to
 * background on close instead of quitting (app lives in the tray).
 */

type Route = '/splash' | '/login' | '/launcher' | '/overlay' | '/ai' | '/wiki';

function preloadPath(): string {
  return join(__dirname, '../preload/index.js');
}

function loadRoute(win: BrowserWindow, route: Route): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(`${devUrl}#${route}`);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route });
  }
}

/** Allow microphone access for voice input (renderer MediaRecorder). */
function setupPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
}

function applyCloseToHide(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (!getAppState().quitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

function commonWebPreferences(): Electron.WebPreferences {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    webSecurity: true
  };
}

export function createLauncherWindow(): BrowserWindow {
  const state = getAppState();
  if (state.windows.launcher && !state.windows.launcher.isDestroyed()) {
    return state.windows.launcher;
  }
  const cfg = loadConfig();
  const win = new BrowserWindow({
    width: 460,
    height: 520,
    minWidth: 420,
    minHeight: 460,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: cfg.product.name,
    icon: undefined,
    webPreferences: commonWebPreferences()
  });
  win.setMenuBarVisibility(false);
  loadRoute(win, '/splash');
  win.once('ready-to-show', () => {
    if (!state.cliArgs.hidden) win.show();
  });
  applyCloseToHide(win);
  state.windows.launcher = win;
  logger.info('windows: launcher created');
  return win;
}

export function createOverlayWindow(): BrowserWindow {
  const state = getAppState();
  if (state.windows.overlay && !state.windows.overlay.isDestroyed()) {
    return state.windows.overlay;
  }
  const win = new BrowserWindow({
    width: 752,
    height: 288,
    minWidth: 360,
    minHeight: 56,
    maximizable: false,
    title: loadConfig().product.name + ' · Оверлей',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    titleBarStyle: 'hidden',
    webPreferences: commonWebPreferences()
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  loadRoute(win, '/overlay');
  applyCloseToHide(win);
  state.windows.overlay = win;
  logger.info('windows: overlay created');
  return win;
}

export function createAiWindow(): BrowserWindow {
  const state = getAppState();
  if (state.windows.ai && !state.windows.ai.isDestroyed()) {
    const w = state.windows.ai;
    if (!w.isVisible()) w.show();
    w.focus();
    return w;
  }
  const win = new BrowserWindow({
    width: 580,
    height: 700,
    minWidth: 460,
    minHeight: 520,
    show: false,
    frame: false,
    backgroundColor: '#050B1A',
    webPreferences: commonWebPreferences()
  });
  win.setMenuBarVisibility(false);
  loadRoute(win, '/ai');
  win.once('ready-to-show', () => win.show());
  applyCloseToHide(win);
  state.windows.ai = win;
  logger.info('windows: ai created');
  return win;
}

export function createWikiWindow(): BrowserWindow {
  const state = getAppState();
  if (state.windows.wiki && !state.windows.wiki.isDestroyed()) {
    const w = state.windows.wiki;
    if (!w.isVisible()) w.show();
    w.focus();
    return w;
  }
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: '#050B1A',
    webPreferences: commonWebPreferences()
  });
  win.setMenuBarVisibility(false);
  loadRoute(win, '/wiki');
  win.once('ready-to-show', () => win.show());
  applyCloseToHide(win);
  state.windows.wiki = win;
  logger.info('windows: wiki created');
  return win;
}

/** Shows & focuses the launcher (splash screen shows only on very first load). */
export function showLauncher(): void {
  const win = createLauncherWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Show/hide the overlay above the game. Creates it on first use. */
export function toggleOverlay(): boolean {
  const overlay = createOverlayWindow();
  if (overlay.isVisible()) {
    overlay.hide();
    return false;
  }
  overlay.show();
  overlay.focus();
  return true;
}

/** Applies pinned mode: app windows stay above everything (incl. game). */
export function applyPin(enabled: boolean): void {
  const state = getAppState();
  for (const win of Object.values(state.windows)) {
    if (win && !win.isDestroyed()) {
      if (enabled) win.setAlwaysOnTop(true, 'floating');
      else if (win !== state.windows.overlay) win.setAlwaysOnTop(false);
    }
  }
}

/** Streamer mode: hide app windows from screen capture (OBS etc). */
export function applyStreamerMode(enabled: boolean): void {
  const state = getAppState();
  for (const win of Object.values(state.windows)) {
    if (win && !win.isDestroyed()) win.setContentProtection(enabled);
  }
}

export function applyOverlayOpacity(value: number): void {
  const state = getAppState();
  const overlay = state.windows.overlay;
  if (overlay && !overlay.isDestroyed()) {
    overlay.setOpacity(Math.min(1, Math.max(0.3, value)));
  }
}

/** Re-apply visual settings to every existing window. */
export function applyVisualSettings(): void {
  const s = readSettings();
  applyPin(s.pinWindow);
  applyStreamerMode(s.streamerMode);
  applyOverlayOpacity(s.overlayOpacity);
}

export function bootstrapWindows(): void {
  setupPermissions();
  createLauncherWindow();
  const overlay = createOverlayWindow();
  overlay.hide();
  applyVisualSettings();
}
