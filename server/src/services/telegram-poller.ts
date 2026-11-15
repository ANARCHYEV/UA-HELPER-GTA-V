import { config } from '../config';
import { handleTelegramUpdate } from './telegram-auth';

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat?: { id?: number };
    text?: string;
    from?: { username?: string; first_name?: string };
  };
};

type TelegramResponse<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
};

let running = false;
let offset = 0;

async function telegramCall<T>(method: string, body: Record<string, unknown>): Promise<TelegramResponse<T>> {
  const response = await fetch(`https://api.telegram.org/bot${config.tgBotToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((config.telegramPollTimeoutSec + 10) * 1000)
  });
  return (await response.json()) as TelegramResponse<T>;
}

async function deleteWebhookForPolling(): Promise<void> {
  const result = await telegramCall<boolean>('deleteWebhook', { drop_pending_updates: false });
  if (!result.ok) throw new Error(result.description ?? 'Telegram deleteWebhook failed');
}

async function pollOnce(): Promise<void> {
  const result = await telegramCall<TelegramUpdate[]>('getUpdates', {
    offset,
    timeout: config.telegramPollTimeoutSec,
    allowed_updates: ['message']
  });
  if (!result.ok) throw new Error(result.description ?? 'Telegram getUpdates failed');

  for (const update of result.result ?? []) {
    offset = Math.max(offset, update.update_id + 1);
    try {
      await handleTelegramUpdate(update);
    } catch (error) {
      console.error('[telegram] update handling failed:', error);
    }
  }
}

/**
 * Local-friendly Telegram transport. A webhook requires a public HTTPS URL;
 * polling lets the desktop app authenticate while the API remains on localhost.
 */
export async function startTelegramPolling(): Promise<void> {
  if (running || !config.tgBotToken || config.telegramUpdatesMode !== 'polling') return;
  running = true;
  try {
    await deleteWebhookForPolling();
    console.log('[telegram] long polling enabled');
  } catch (error) {
    console.error('[telegram] polling startup failed:', error);
    running = false;
    return;
  }

  while (running) {
    try {
      await pollOnce();
    } catch (error) {
      console.error('[telegram] polling failed:', error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export function stopTelegramPolling(): void {
  running = false;
}
