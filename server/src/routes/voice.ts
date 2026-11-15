import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/db';
import { config } from '../config';
import { transcribeAudio } from '../services/transcription';
import { hashIp } from '../services/sync-worker';
import { logger } from '../services/logger';

/**
 * POST /v1/voice/transcribe (multipart, field "file")
 * - validates size and duration
 * - rate-limits per IP per day (voice_usage table) on top of fastify rate-limit
 * - forwards to the configured transcription backend
 */
export function registerVoice(app: FastifyInstance): void {
  app.post('/v1/voice/transcribe', async (req, reply) => {
    const ip = req.ip ?? 'unknown';
    const ipHash = hashIp(ip);
    const day = new Date().toISOString().slice(0, 10);

    // per-IP daily limit
    const usage = getDb()
      .prepare('SELECT count FROM voice_usage WHERE ip_hash = ? AND day = ?')
      .get(ipHash, day) as { count: number } | undefined;
    if ((usage?.count ?? 0) >= config.voiceDailyLimit) {
      return reply.code(429).send({ error: 'daily voice limit exceeded' });
    }

    const parts = req.parts();
    let fileBuf: Buffer | null = null;
    let mimeType = 'audio/webm';
    let seconds = 0;
    try {
      for await (const part of parts) {
        if (part.type === 'file') {
          const buf = await part.toBuffer();
          fileBuf = buf;
          mimeType = part.mimetype || mimeType;
        } else if (part.type === 'field' && part.fieldname === 'seconds') {
          seconds = Number(part.value) || 0;
        }
      }
    } catch (err) {
      logger.warn('voice: bad multipart', err instanceof Error ? err.message : err);
      return reply.code(400).send({ error: 'invalid multipart payload' });
    }

    if (!fileBuf) {
      return reply.code(400).send({ error: 'missing audio file' });
    }
    if (fileBuf.byteLength > config.maxUploadMb * 1024 * 1024) {
      return reply.code(413).send({ error: 'file too large' });
    }
    if (seconds > 120) {
      return reply.code(413).send({ error: 'recording too long' });
    }

    try {
      const { text } = await transcribeAudio(fileBuf, 'record.webm', mimeType);
      getDb()
        .prepare(
          `INSERT INTO voice_usage (ip_hash, day, count) VALUES (?, ?, 1)
           ON CONFLICT(ip_hash, day) DO UPDATE SET count = count + 1`
        )
        .run(ipHash, day);
      return { text: (text ?? '').trim().slice(0, 500) };
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502;
      logger.error('voice: transcription failed', err instanceof Error ? err.message : err);
      return reply.code(status).send({ error: 'transcription unavailable' });
    }
  });
}
