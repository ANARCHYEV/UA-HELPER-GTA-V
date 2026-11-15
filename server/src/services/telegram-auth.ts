import { createHash, randomBytes } from 'crypto';
import { run, rows, row } from '../db/db';
import { config } from '../config';

/**
 * Telegram login by code:
 * 1) app asks for a code -> server generates one (10 min TTL)
 * 2) user sends /start <code> to our bot
 * 3) Telegram delivers the update to our webhook -> code becomes approved
 * 4) app polls -> receives approved status + nickname
 */

export interface TelegramStart {
  code: string;
  expiresAt: number;
  botUsername: string;
  deepLink: string;
  demo: boolean;
}

export function generateCode(): TelegramStart {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
  const now = Date.now();
  run(
    'INSERT OR REPLACE INTO auth_codes (code, tg_chat_id, status, created_at, expires_at) VALUES (?, NULL, ?, ?, ?)',
    code,
    'pending',
    now,
    now + 10 * 60 * 1000
  );
  return {
    code,
    expiresAt: now + 10 * 60 * 1000,
    botUsername: config.tgBotUsername,
    deepLink: config.tgBotUsername ? `https://t.me/${config.tgBotUsername}?start=${code}` : '',
    demo: false
  };
}

export function pollCode(code: string): {
  status: 'pending' | 'approved' | 'expired' | 'not_found';
  token?: string;
  nickname?: string;
  telegramUser?: string;
} {
  const rec = row<{ status: string; tg_chat_id: number | null; expires_at: number }>(
    'SELECT status, tg_chat_id, expires_at FROM auth_codes WHERE code = ?',
    code
  );
  if (!rec) return { status: 'not_found' };
  if (rec.expires_at < Date.now()) return { status: 'expired' };
  if (rec.status !== 'approved' || !rec.tg_chat_id) return { status: 'pending' };

  const account = row<{ nickname: string }>(
    'SELECT nickname FROM auth_tokens WHERE tg_chat_id = ? ORDER BY created_at DESC LIMIT 1',
    rec.tg_chat_id
  );
  const nickname = account?.nickname ?? `TG-${rec.tg_chat_id}`;
  const token = randomBytes(32).toString('hex');
  run(
    'INSERT INTO auth_tokens (token, tg_chat_id, nickname, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
    token,
    rec.tg_chat_id,
    nickname,
    Date.now(),
    Date.now()
  );
  run('DELETE FROM auth_codes WHERE code = ?', code);
  return { status: 'approved', token, nickname, telegramUser: String(rec.tg_chat_id) };
}

/** Handles a Telegram bot webhook update (secret header verified upstream). */
export async function handleTelegramUpdate(update: { message?: { chat?: { id?: number; type?: string }; text?: string; from?: { id?: number; username?: string; first_name?: string } } }): Promise<void> {
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? '').trim();
  if (!chatId || !text) return;
  // Login codes must never be approved from a group or a forwarded identity.
  if (msg?.chat?.type !== 'private' || msg.from?.id !== chatId) return;

  const match = text.match(/^\/start(?:\s+([A-Z0-9]{4,12}))?$/i);
  if (!match) return;

  if (!match[1]) {
    await sendMessage(chatId, 'Привіт! Надішли код із програми UA Helper у форматі:\n/start КОД');
    return;
  }

  const code = match[1].toUpperCase();
  const rec = row<{ status: string; expires_at: number }>(
    'SELECT status, expires_at FROM auth_codes WHERE code = ?',
    code
  );
  if (!rec || rec.status !== 'pending' || rec.expires_at < Date.now()) {
    await sendMessage(chatId, 'Код недійсний або прострокав. Згенеруй новий у програмі.');
    return;
  }

  run(
    'UPDATE auth_codes SET status = ?, tg_chat_id = ? WHERE code = ?',
    'approved',
    chatId,
    code
  );
  run(
    'INSERT INTO auth_tokens (token, tg_chat_id, nickname, created_at, last_seen) VALUES (?, ?, ?, ?, ?) ON CONFLICT(token) DO NOTHING',
    createHash('sha256').update(`${chatId}:${code}`).digest('hex').slice(0, 48),
    chatId,
    msg?.from?.username ?? msg?.from?.first_name ?? `TG-${chatId}`,
    Date.now(),
    Date.now()
  );
  await sendMessage(chatId, 'Успішно! Тепер повернись у програму — вхід завершиться автоматично.');
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!config.tgBotToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${config.tgBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    // best effort; poll loop will still find the approved code
    console.error('[telegram] sendMessage failed:', err);
  }
}

export function cleanupExpiredCodes(): void {
  run('DELETE FROM auth_codes WHERE expires_at < ?', Date.now());
}

export function countActiveCodes(): number {
  return rows<{ c: number }>('SELECT COUNT(*) AS c FROM auth_codes WHERE expires_at > ?', Date.now())[0]?.c ?? 0;
}
