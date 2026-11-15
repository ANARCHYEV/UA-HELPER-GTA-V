import type { AppSettings } from './types';

/** Default user settings applied on first run and after DB resets. */
export const DEFAULT_SETTINGS: AppSettings = {
  hotkeyOverlay: 'CommandOrControl+Shift+H',
  hotkeyPtt: 'CommandOrControl+Shift+V',
  autoLaunch: false,
  pinWindow: true,
  streamerMode: false,
  overlayOpacity: 0.96,
  language: 'uk',
  aiModel: '',
  aiAutoFallback: true,
  checkUpdatesOnStart: true,
  micDeviceId: null
};

/** Nickname validation bounds used by account:nickname:set. */
export const NICKNAME = {
  minLength: 3,
  maxLength: 24,
  pattern: /^[A-Za-z0-9_.-]+$/
};

/** Random salt for guest/demo nicknames. */
export const DEMO_GUEST_PREFIX = 'Гравець';
