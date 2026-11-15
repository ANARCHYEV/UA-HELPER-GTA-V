import 'dotenv/config';
import { join } from 'path';

/**
 * Server configuration via environment variables (see .env.example).
 * No secrets are ever committed to the repository.
 */

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function intEnv(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function boolEnv(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function minuteListEnv(key: string, fallbackMinutes: number[]): number[] {
  const value = process.env[key];
  const fallback = fallbackMinutes.map((minutes) => minutes * 60_000);
  if (!value) return fallback;
  const delays = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 5 && minutes <= 24 * 60)
    .map((minutes) => minutes * 60_000);
  return delays.length > 0 ? delays : fallback;
}

export const config = {
  port: intEnv('PORT', 3000),
  host: env('HOST', '127.0.0.1'),
  dbPath: env('DB_PATH', join(process.cwd(), 'data', 'app.db')),
  allowedOrigins: env('ALLOWED_ORIGINS', '*').split(',').map((s) => s.trim()),

  // Telegram auth bot (leave empty to disable)
  tgBotToken: env('TG_BOT_TOKEN', ''),
  tgBotUsername: env('TG_BOT_USERNAME', ''),
  tgWebhookSecret: env('TG_WEBHOOK_SECRET', ''),
  // Local builds cannot receive Telegram webhooks on 127.0.0.1. Polling is
  // therefore the safe default; production deployments can switch to webhook.
  telegramUpdatesMode: env('TG_UPDATES_MODE', 'polling') as 'polling' | 'webhook',
  telegramPollTimeoutSec: intEnv('TG_POLL_TIMEOUT_SEC', 20),

  // Discord OAuth + subscription check (leave empty to disable Discord)
  discordClientId: env('DISCORD_CLIENT_ID', ''),
  discordClientSecret: env('DISCORD_CLIENT_SECRET', ''),
  discordRedirectUri: env('DISCORD_REDIRECT_URI', ''),
  discordBotToken: env('DISCORD_BOT_TOKEN', ''),
  discordGuildId: env('DISCORD_GUILD_ID', ''),
  discordRoleId: env('DISCORD_ROLE_ID', ''),
  telegramSubscriptionChat: env('TELEGRAM_SUBSCRIPTION_CHAT', ''),

  // Forum sync. Cloudflare-protected deployments require an IP allowlist or official export/API.
  forumRulesUrl: env('FORUM_RULES_URL', 'https://forum.ukraine-gta5.com.ua/forums/%D0%97%D0%B0%D0%B3%D0%B0%D0%BB%D1%8C%D0%BD%D1%96-%D0%BF%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0-%D0%BF%D1%80%D0%BE%D0%B5%D0%BA%D1%82%D1%83.4/'),
  forumLawsUrl: env('FORUM_LAWS_URL', 'https://forum.ukraine-gta5.com.ua/forums/%D0%97%D0%B0%D0%BA%D0%BE%D0%BD%D0%B8.61/'),
  syncOnStart: boolEnv('SYNC_ON_START', true),
  syncCron: env('SYNC_CRON', '0 */6 * * *'),
  syncRetryDelaysMs: minuteListEnv('SYNC_RETRY_MINUTES', [15, 60, 180]),
  crawlerDelayMs: intEnv('CRAWLER_DELAY_MS', 800),

  // Voice transcription: local faster-whisper sidecar OR external provider
  transcribeProvider: env('TRANSCRIBE_PROVIDER', 'local') as 'local' | 'external',
  transcribeLocalUrl: env('TRANSCRIBE_LOCAL_URL', 'http://whisper:8000'),
  transcribeExternalUrl: env('TRANSCRIBE_EXTERNAL_URL', ''),
  transcribeExternalKey: env('TRANSCRIBE_EXTERNAL_KEY', ''),
  maxUploadMb: intEnv('MAX_UPLOAD_MB', 10),
  voiceDailyLimit: intEnv('VOICE_DAILY_LIMIT', 200),

  // Admin token for managing releases (gen-latest-yml)
  adminToken: env('ADMIN_TOKEN', ''),

  // Updates
  downloadsPublicUrl: env('DOWNLOADS_PUBLIC_URL', '')
};
