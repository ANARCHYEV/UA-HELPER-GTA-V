import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/types';

let cachedInfo: AppInfo | null = null;

/** Loads app info (config + versions) once and caches it in the module. */
export async function loadAppInfo(): Promise<AppInfo> {
  if (cachedInfo) return cachedInfo;
  cachedInfo = await window.api.getInfo();
  return cachedInfo;
}

/** Applies brand accent colors from config to CSS variables. */
export async function applyBrandColors(): Promise<void> {
  try {
    const info = await loadAppInfo();
    const root = document.documentElement;
    root.style.setProperty('--accent', info.config.branding.accent);
    root.style.setProperty('--accent-2', info.config.branding.accent2);
    // derived soft/hover tones
    root.style.setProperty('--accent-soft', hexToRgba(info.config.branding.accent, 0.14));
    root.style.setProperty('--accent-2-soft', hexToRgba(info.config.branding.accent2, 0.14));
    root.style.setProperty('--accent-hover', lighten(info.config.branding.accent, 0.2));
    document.title = info.config.product.name;
  } catch {
    // fall back to token defaults
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lighten(hex: string, amount: number): string {
  const m = hex.replace('#', '');
  const r = Math.min(255, parseInt(m.slice(0, 2), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(m.slice(2, 4), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(m.slice(4, 6), 16) + Math.round(255 * amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Simple async-state hook used by pages. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loader()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // loader identity is not stable; deps array drives re-runs
  }, [tick, ...deps]);

  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
