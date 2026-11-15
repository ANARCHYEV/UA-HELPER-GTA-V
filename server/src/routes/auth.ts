import type { FastifyInstance } from 'fastify';
import { generateCode, pollCode, handleTelegramUpdate, countActiveCodes } from '../services/telegram-auth';
import { config } from '../config';
import { generateDiscordState, handleDiscordCallback, pollDiscordState, discordConfigured } from '../services/discord-auth';
import { checkSubscription, type SubscriptionProvider } from '../services/subscription';
import { requireAdmin } from '../services/admin-auth';

/**
 * Telegram login endpoints.
 * POST /v1/auth/telegram/start  -> { code, expiresAt, botUsername, deepLink }
 * POST /v1/auth/telegram/poll   -> { status, token?, nickname? }
 * POST /v1/auth/telegram/webhook -> Telegram bot updates (secret header)
 */
export function registerAuth(app: FastifyInstance): void {
  app.post('/v1/auth/telegram/start', async (_req, reply) => {
    if (!config.tgBotToken || !config.tgBotUsername) {
      return reply.code(503).send({ error: 'telegram bot is not configured' });
    }
    return generateCode();
  });

  app.post<{ Body: { code?: string } }>('/v1/auth/telegram/poll', async (req, reply) => {
    const code = (req.body?.code ?? '').trim().toUpperCase();
    if (!code) return reply.code(400).send({ error: 'missing code' });
    const result = pollCode(code);
    return result;
  });

  app.post('/v1/auth/telegram/webhook', async (req, reply) => {
    if (!config.tgBotToken || !config.tgWebhookSecret) {
      return reply.code(503).send({ error: 'telegram bot is not configured' });
    }
    if (config.tgWebhookSecret) {
      const header = req.headers['x-telegram-bot-api-secret-token'];
      if (header !== config.tgWebhookSecret) {
        return reply.code(401).send({ error: 'bad webhook secret' });
      }
    }
    const update = req.body as { message?: { chat?: { id?: number }; text?: string } };
    await handleTelegramUpdate(update);
    return { ok: true };
  });

  app.get('/v1/auth/telegram/status', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return {
      configured: !!config.tgBotToken,
      botUsername: config.tgBotUsername,
      pendingCodes: countActiveCodes()
    };
  });

  app.post('/v1/auth/discord/start', async (_req, reply) => {
    if (!discordConfigured()) return reply.code(503).send({ error: 'discord oauth is not configured' });
    try {
      return generateDiscordState();
    } catch {
      return reply.code(503).send({ error: 'discord oauth is not configured' });
    }
  });

  app.post<{ Body: { state?: string } }>('/v1/auth/discord/poll', async (req, reply) => {
    const state = (req.body?.state ?? '').trim();
    if (!state) return reply.code(400).send({ error: 'missing state' });
    return pollDiscordState(state);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/v1/auth/discord/callback', async (req, reply) => {
    const code = (req.query.code ?? '').trim();
    const state = (req.query.state ?? '').trim();
    if (req.query.error || !code || !state) return reply.type('text/html').send('<h2>Вхід скасовано</h2><p>Поверніться до UA Helper.</p>');
    try {
      await handleDiscordCallback(code, state);
      return reply.type('text/html').send('<h2>Discord підключено</h2><p>Поверніться до UA Helper — вхід завершиться автоматично.</p>');
    } catch {
      return reply.code(400).type('text/html').send('<h2>Не вдалося підключити Discord</h2><p>Поверніться до UA Helper і спробуйте ще раз.</p>');
    }
  });

  app.get('/v1/auth/discord/status', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { configured: discordConfigured() };
  });

  app.post<{ Body: { provider?: SubscriptionProvider; telegramUser?: string; discordUser?: string } }>(
    '/v1/auth/subscription/check',
    async (req, reply) => {
      const provider = req.body?.provider;
      if (provider !== 'telegram' && provider !== 'discord' && provider !== 'either') {
        return reply.code(400).send({ error: 'provider must be telegram, discord, or either' });
      }
      return checkSubscription({ provider, telegramUser: req.body?.telegramUser, discordUser: req.body?.discordUser });
    }
  );
}
