import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { transcribeRecording } from '../services/voice-recorder';
import type { VoiceTranscribeResult } from '@shared/types';

export function registerVoiceIpc(): void {
  ipcMain.handle(
    IPC.VoiceTranscribe,
    async (_e, audio: ArrayBuffer, meta: { mimeType: string; seconds: number }): Promise<VoiceTranscribeResult> => {
      const result = await transcribeRecording(audio, meta);
      if (!result.ok || !result.text) {
        throw new Error(result.error ?? 'Розпізнавання не вдалося.');
      }
      return { text: result.text };
    }
  );
}
