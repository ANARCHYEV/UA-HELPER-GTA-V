/** Sets the Telegram webhook (npm run tg:set-webhook) */
import { config } from '../src/config';

async function main(): Promise<void> {
  if (!config.tgBotToken) {
    console.error('TG_BOT_TOKEN is empty - fill .env first');
    process.exit(1);
  }
  const base = process.argv[2];
  if (!base) {
    console.error('usage: tsx scripts/set-webhook.ts https://your-domain.example.com');
    process.exit(1);
  }
  const url = `${base.replace(/\/$/, '')}/v1/auth/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${config.tgBotToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: config.tgWebhookSecret,
      allowed_updates: ['message']
    })
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  console.log(json.ok ? `webhook set: ${url}` : `failed: ${json.description}`);
}

void main();
