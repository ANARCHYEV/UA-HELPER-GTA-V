import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import cron from 'node-cron';
import { config } from './config';
import { getDb } from './db/db';
import { logger } from './services/logger';
import { registerHealth } from './routes/health';
import { registerRules } from './routes/rules';
import { registerSearch } from './routes/search';
import { registerVoice } from './routes/voice';
import { registerAppVersion } from './routes/appversion';
import { registerAuth } from './routes/auth';
import { runSync } from './services/sync-worker';
import { startForumSyncScheduler } from './services/forum-sync-scheduler';
import { cleanupExpiredCodes } from './services/telegram-auth';
import { cleanupExpiredDiscordStates } from './services/discord-auth';
import { startTelegramPolling } from './services/telegram-poller';

/**
 * UA Helper API entry point.
 * - no telemetry, no third-party analytics
 * - helmet + cors + rate-limit out of the box
 * - forum sync cron (configurable via SYNC_CRON)
 */

async function main(): Promise<void> {
  // ensure schema exists before serving
  getDb();

  const app = Fastify({
    logger: false,
    bodyLimit: 16 * 1024 * 1024,
    trustProxy: true
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    // keep default in-memory store; swap to Redis if you scale horizontally
  });
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 }
  });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    logger.error('api error:', err.message);
    reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({
      error: err.statusCode && err.statusCode < 500 ? err.message : 'internal error'
    });
  });

  registerHealth(app);
  registerRules(app);
  registerSearch(app);
  registerVoice(app);
  registerAppVersion(app);
  registerAuth(app);

  // auth codes cleanup every hour
  cron.schedule('0 * * * *', () => {
    cleanupExpiredCodes();
    cleanupExpiredDiscordStates();
  });

  await app.listen({ port: config.port, host: config.host });
  logger.info(`UA Helper API listening on ${config.host}:${config.port}`);
  startForumSyncScheduler({
    syncOnStart: config.syncOnStart,
    cronExpression: config.syncCron,
    retryDelaysMs: config.syncRetryDelaysMs,
    runSync,
    schedule: (expression, callback) => cron.schedule(expression, callback),
    setDelay: (callback, milliseconds) => setTimeout(callback, milliseconds),
    info: logger.info,
    error: logger.error
  });
  void startTelegramPolling();
}

main().catch((err) => {
  logger.error('fatal:', err);
  process.exit(1);
});
