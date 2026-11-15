import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/db';
import { discordConfigured } from '../services/discord-auth';
import { config } from '../config';

export function registerHealth(app: FastifyInstance): void {
  app.get('/v1/health', async () => {
    // simple liveness + DB check
    let dbOk = false;
    try {
      getDb().prepare('SELECT 1').get();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'ua-helper-api',
      time: Date.now(),
      integrations: {
        telegramAuth: Boolean(config.tgBotToken && config.tgBotUsername),
        discordAuth: discordConfigured(),
        telegramSubscription: Boolean(config.tgBotToken && config.telegramSubscriptionChat),
        discordSubscription: Boolean(config.discordBotToken && config.discordGuildId),
        rulesSource: Boolean(config.forumRulesUrl)
      }
    };
  });
}
