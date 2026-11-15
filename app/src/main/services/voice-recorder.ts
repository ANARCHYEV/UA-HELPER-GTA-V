import { loadConfig } from '../config-loader';
import { serverClient, ServerError } from './server-client';
import { logger } from './logger';

/**
 * Voice upload service.
 * Recording happens in the renderer (MediaRecorder); the main process only
 * validates limits and forwards audio to our VPS /v1/voice/transcribe.
 * The server runs local Whisper (faster-whisper) or a configured external
 * provider behind the same interface.
 */

export interface VoiceUploadResult {
  ok: boolean;
  text?: string;
  /** Ukrainian error message, safe to display. */
  error?: string;
}

function mapVoiceError(err: unknown): string {
  if (err instanceof ServerError) {
    switch (err.status) {
      case 413:
        return 'Запис завеликий. Скороти тривалість голосового.';
      case 429:
        return 'Ліміт розпізнавання вичерпано. Спробуй пізніше.';
      case 503:
        return 'Розпізнавання мови тимчасово недоступне.';
      case 0:
        return 'Сервер недоступний. Голосовий введення не працює без зʼєднання.';
      default:
        return `Помилка розпізнавання (${err.status}). Спробуй ще раз.`;
    }
  }
  return 'Не вдалося надіслати запис. Перевір зʼєднання.';
}

export async function transcribeRecording(
  audio: ArrayBuffer,
  meta: { mimeType: string; seconds: number }
): Promise<VoiceUploadResult> {
  const cfg = loadConfig();
  const sizeMb = audio.byteLength / (1024 * 1024);

  if (meta.seconds > cfg.voice.maxRecordSeconds + 2) {
    return { ok: false, error: `Максимальна тривалість запису - ${cfg.voice.maxRecordSeconds} с.` };
  }
  if (sizeMb > cfg.voice.maxFileMb) {
    return { ok: false, error: `Максимальний розмір запису - ${cfg.voice.maxFileMb} МБ.` };
  }
  if (meta.seconds < 0.5) {
    return { ok: false, error: 'Запис занадто короткий.' };
  }

  try {
    const { text } = await serverClient.transcribe(audio, meta);
    return { ok: true, text: text.trim() };
  } catch (err) {
    logger.warn('voice: transcribe failed', err instanceof Error ? err.message : err);
    return { ok: false, error: mapVoiceError(err) };
  }
}
