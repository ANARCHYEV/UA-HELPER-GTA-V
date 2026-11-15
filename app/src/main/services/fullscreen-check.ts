/**
 * Fullscreen detection (original behaviour preserved).
 * Uses koffi to call shell32!SHQueryUserNotificationState:
 * QUNS_RUNNING_D3D_FULL_SCREEN (4) means the game runs in EXCLUSIVE fullscreen.
 * In that case the overlay may not stay on top - we show a hint
 * recommending "Вікно без рамок" (borderless windowed) mode.
 *
 * koffi is a heavy native dep and Windows-only here, so it is loaded lazily
 * and any failure degrades gracefully to "unknown".
 */

const QUNS_RUNNING_D3D_FULL_SCREEN = 4;

/** Minimal shape of the koffi module surface used here (type-only). */
interface KoffiLib {
  func(
    signature: string,
    name: string,
    retType: string,
    paramTypes: string[]
  ): (out: number[]) => number;
}
interface KoffiApi {
  load(name: string): KoffiLib;
}

export interface FullscreenCheckResult {
  supported: boolean;
  exclusiveFullscreen: boolean;
  state: number;
}

let cachedFn: ((out: number[]) => number) | null | undefined;

function loadFn(): ((out: number[]) => number) | null {
  if (cachedFn !== undefined) return cachedFn;
  cachedFn = null;
  try {
    if (process.platform !== 'win32') return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as KoffiApi;
    const shell32 = koffi.load('shell32.dll');
    cachedFn = shell32.func('__stdcall', 'SHQueryUserNotificationState', 'int', ['int *']);
  } catch (err) {
    // koffi missing or load failed - degrade gracefully
    console.warn('[fullscreen-check] unavailable:', err instanceof Error ? err.message : err);
  }
  return cachedFn;
}

export function checkExclusiveFullscreen(): FullscreenCheckResult {
  const fn = loadFn();
  if (!fn) return { supported: false, exclusiveFullscreen: false, state: -1 };
  try {
    const out: number[] = [0];
    fn(out);
    const state = out[0];
    return {
      supported: true,
      exclusiveFullscreen: state === QUNS_RUNNING_D3D_FULL_SCREEN,
      state
    };
  } catch (err) {
    console.warn('[fullscreen-check] call failed:', err instanceof Error ? err.message : err);
    return { supported: false, exclusiveFullscreen: false, state: -1 };
  }
}
