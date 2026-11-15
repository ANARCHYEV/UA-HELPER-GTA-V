import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config-loader';
import { logger } from './logger';

/**
 * Stores the user's OpenRouter API key encrypted with Electron safeStorage
 * (DPAPI on Windows / libsecret on Linux). The key never leaves this machine
 * except in direct requests to openrouter.ai from the main process.
 */

const FILE_NAME = 'keyring.bin';

function vaultPath(): string {
  return join(app.getPath('userData'), FILE_NAME);
}

function isAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export const keyVault = {
  has(): boolean {
    return existsSync(vaultPath());
  },

  get(): string | null {
    try {
      if (!this.has() || !isAvailable()) return null;
      const buf = readFileSync(vaultPath());
      return safeStorage.decryptString(buf);
    } catch (err) {
      logger.warn('key-vault: decrypt failed', err instanceof Error ? err.message : err);
      return null;
    }
  },

  set(key: string): boolean {
    if (!isAvailable()) {
      logger.error('key-vault: safeStorage is not available on this platform');
      return false;
    }
    const buf = safeStorage.encryptString(key);
    writeFileSync(vaultPath(), buf);
    return true;
  },

  remove(): void {
    try {
      rmSync(vaultPath(), { force: true });
    } catch {
      // ignore
    }
  }
};

/**
 * Validates an OpenRouter key with a minimal live request.
 * Returns null when valid, otherwise a Ukrainian error message.
 */
export async function validateOpenRouterKey(key: string): Promise<string | null> {
  const cfg = loadConfig();
  const url = `${cfg.ai.openRouterBaseUrl}/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: cfg.ai.recommendedModels[0]?.id ?? 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 4,
        stream: false
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (res.ok) return null;
    if (res.status === 401) return 'Ключ недійсний — перевір його на openrouter.ai/keys.';
    if (res.status === 402)
      return 'Немає кредитів на цьому ключі. Обери безкоштовну модель або поповни баланс.';
    if (res.status === 429) return 'Занадто багато запитів. Спробуй через кілька секунд.';
    return `OpenRouter повернув помилку ${res.status}. Спробуй пізніше.`;
  } catch (err) {
    logger.warn('key validation network error', err instanceof Error ? err.message : err);
    return 'Не вдалося зʼєднатися з openrouter.ai. Перевір інтернет і спробуй ще раз.';
  }
}
