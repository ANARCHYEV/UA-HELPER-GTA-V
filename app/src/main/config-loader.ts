import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { app } from 'electron';
import type { AppConfig } from '@shared/types';

let cached: AppConfig | null = null;

/**
 * Builds the list of candidate config locations, ordered by priority.
 * - dev (`electron .` via electron-vite): <app>/config/app.config.json
 * - packaged: config ships inside app.asar next to package.json
 *   (electron-builder.yml -> files: config/**), with an extraResources
 *   fallback for setups that place it under resources/.
 * - raw `electron out/main/index.js`: appPath points to out/main, so the
 *   repo-root config is two levels up.
 */
function candidatePaths(): string[] {
  const appPath = app.getAppPath();
  const list = [join(appPath, 'config', 'app.config.json')];
  if (app.isPackaged) {
    list.push(join(process.resourcesPath, 'config', 'app.config.json'));
  } else {
    list.push(join(resolve(appPath, '..', '..'), 'config', 'app.config.json'));
  }
  return list;
}

/**
 * An optional per-user override keeps provider IDs and deployment URLs outside
 * the packaged application. It is read on the next application start.
 */
function userOverridePath(): string {
  return join(app.getPath('userData'), 'app.config.json');
}

/**
 * Reads config/app.config.json - the single place for branding, backend URL,
 * projects, AI model recommendations and other product-level settings.
 * Rebranding = edit this file and rebuild, no code changes required.
 */
export function loadConfig(): AppConfig {
  if (cached) return cached;

  const paths = candidatePaths();
  const bundledPath = paths.find((p) => existsSync(p));
  if (!bundledPath) {
    throw new Error(`app.config.json not found, tried: ${paths.join(', ')}`);
  }
  const bundled = JSON.parse(readFileSync(bundledPath, 'utf-8')) as AppConfig;
  const overridePath = userOverridePath();
  const override = existsSync(overridePath)
    ? (JSON.parse(readFileSync(overridePath, 'utf-8')) as Partial<AppConfig>)
    : null;
  const cfg: AppConfig = override
    ? {
        ...bundled,
        ...override,
        backend: { ...bundled.backend, ...override.backend },
        auth: {
          ...bundled.auth,
          ...override.auth,
          subscription: { ...bundled.auth.subscription, ...override.auth?.subscription }
        }
      }
    : bundled;

  // Minimal validation to fail fast on broken configs.
  if (!cfg.product?.name) throw new Error('app.config.json: product.name is required');
  if (!cfg.branding?.accent) throw new Error('app.config.json: branding.accent is required');
  if (!cfg.backend || typeof cfg.backend.baseUrl !== 'string') throw new Error('app.config.json: backend config is required');
  if (!cfg.projects?.length) throw new Error('app.config.json: at least one project is required');

  cached = cfg;
  return cfg;
}
