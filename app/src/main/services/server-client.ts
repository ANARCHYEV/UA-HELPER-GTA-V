import { loadConfig } from '../config-loader';
import { logger } from './logger';
import type {
  LawItem,
  RuleChange,
  RuleItem,
  RuleSection,
  DiscordStartResult,
  SubscriptionCheckResult,
  TelegramStartResult
} from '@shared/types';

export class ServerError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

/** A release without a deployed community API remains fully offline-first. */
export function isBackendConfigured(): boolean {
  const base = loadConfig().backend.baseUrl.trim();
  return /^https?:\/\//i.test(base) && !base.includes('CHANGE-ME');
}

/**
 * Thin typed HTTP client for our own VPS backend.
 * All calls have a hard timeout; callers must treat any failure as "offline"
 * and fall back to the local cache.
 */
class ServerClient {
  private base(): string {
    return loadConfig().backend.baseUrl;
  }

  private timeout(): number {
    return loadConfig().backend.timeoutMs;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const base = this.base().trim();
    if (!isBackendConfigured()) throw new ServerError(0, 'Сервер спільноти ще не налаштований');
    const url = joinUrl(base, path);
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeout()),
        headers: { Accept: 'application/json', ...(init?.headers ?? {}) }
      });
      if (!res.ok) throw new ServerError(res.status, `HTTP ${res.status} for ${path}`);
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ServerError) throw err;
      logger.warn('server-client: request failed', path, err instanceof Error ? err.message : err);
      throw new ServerError(0, err instanceof Error ? err.message : 'network error');
    }
  }

  health(): Promise<{ status: string; version?: string }> {
    return this.request('/v1/health');
  }

  getRules(since?: number): Promise<{ serverTime: number; sections: RuleSection[]; items: RuleItem[] }> {
    const q = since ? `?since=${since}` : '';
    return this.request(`/v1/rules${q}`);
  }

  getLaws(since?: number): Promise<{ serverTime: number; items: LawItem[] }> {
    const q = since ? `?since=${since}` : '';
    return this.request(`/v1/laws${q}`);
  }

  getChanges(since?: number): Promise<{ changes: RuleChange[] }> {
    const q = since ? `?since=${since}` : '';
    return this.request(`/v1/rules/changes${q}`);
  }

  authTelegramStart(): Promise<TelegramStartResult> {
    return this.request('/v1/auth/telegram/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
  }

  authTelegramPoll(code: string): Promise<{
    status: 'pending' | 'approved' | 'expired' | 'not_found';
    token?: string;
    nickname?: string;
    telegramUser?: string;
  }> {
    return this.request('/v1/auth/telegram/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
  }

  authDiscordStart(): Promise<DiscordStartResult> {
    return this.request('/v1/auth/discord/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
  }

  authDiscordPoll(state: string): Promise<{
    status: 'pending' | 'approved' | 'expired' | 'not_found';
    nickname?: string;
    discordUser?: string;
  }> {
    return this.request('/v1/auth/discord/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
  }

  checkSubscription(profile: { provider: 'telegram' | 'discord' | 'either'; telegramUser?: string; discordUser?: string }): Promise<SubscriptionCheckResult> {
    return this.request('/v1/auth/subscription/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
  }

  /** Uploads recorded audio to /v1/voice/transcribe as multipart form data. */
  async transcribe(
    audio: ArrayBuffer,
    meta: { mimeType: string; seconds: number }
  ): Promise<{ text: string }> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([audio], { type: meta.mimeType || 'audio/webm' }),
      'record.webm'
    );
    form.append('seconds', String(Math.round(meta.seconds)));
    const base = this.base().trim();
    if (!isBackendConfigured()) throw new ServerError(0, 'Голосовий сервер ще не налаштований');
    const url = joinUrl(base, '/v1/voice/transcribe');
    const res = await fetch(url, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(Math.max(this.timeout(), 30000))
    });
    if (!res.ok) throw new ServerError(res.status, `HTTP ${res.status} for voice/transcribe`);
    return (await res.json()) as { text: string };
  }
}

export const serverClient = new ServerClient();
