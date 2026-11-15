import { config } from '../config';
import { logger } from './logger';

/**
 * Speech-to-text gateway.
 * - 'local'    -> faster-whisper sidecar (see /whisper, Docker profile "voice")
 * - 'external' -> OpenAI-compatible transcription endpoint
 * Both implement the same interface; swap via TRANSCRIBE_PROVIDER in .env.
 */

export async function transcribeAudio(
  audio: Buffer,
  filename: string,
  mimeType: string
): Promise<{ text: string }> {
  if (config.transcribeProvider === 'external') {
    return transcribeExternal(audio, filename, mimeType);
  }
  return transcribeLocal(audio, filename, mimeType);
}

async function transcribeLocal(audio: Buffer, filename: string, mimeType: string): Promise<{ text: string }> {
  if (!config.transcribeLocalUrl) {
    throw Object.assign(new Error('whisper sidecar is not configured'), { status: 503 });
  }
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
  form.append('language', 'uk');

  const res = await fetch(`${config.transcribeLocalUrl.replace(/\/$/, '')}/transcribe`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120000)
  });
  if (!res.ok) {
    logger.error('transcribe: local failed', res.status);
    throw Object.assign(new Error(`whisper HTTP ${res.status}`), { status: 502 });
  }
  return (await res.json()) as { text: string };
}

async function transcribeExternal(audio: Buffer, filename: string, mimeType: string): Promise<{ text: string }> {
  if (!config.transcribeExternalUrl || !config.transcribeExternalKey) {
    throw Object.assign(new Error('external transcription is not configured'), { status: 503 });
  }
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
  form.append('model', 'whisper-1');

  const res = await fetch(config.transcribeExternalUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.transcribeExternalKey}` },
    body: form,
    signal: AbortSignal.timeout(120000)
  });
  if (!res.ok) {
    throw Object.assign(new Error(`external HTTP ${res.status}`), { status: 502 });
  }
  return (await res.json()) as { text: string };
}
