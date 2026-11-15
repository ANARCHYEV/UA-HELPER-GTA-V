import { useCallback, useEffect, useRef, useState } from 'react';
import { IPC_EVENTS } from '@shared/ipc-channels';
import { t } from '../i18n';
import { loadAppInfo } from './useAppInfo';

type Phase = 'idle' | 'opening' | 'recording' | 'transcribing';

export function useVoiceInput(onText: (value: string) => void) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const current = useRef<Phase>('idle');
  const generation = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const receive = useRef(onText);
  useEffect(() => { receive.current = onText; }, [onText]);

  const update = useCallback((value: Phase) => {
    current.current = value;
    setPhase(value);
  }, []);

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const toggle = useCallback(async () => {
    if (current.current === 'recording') { stop(); return; }
    if (current.current !== 'idle' || document.hidden) return;
    update('opening');
    setError('');
    const id = ++generation.current;
    let stream: MediaStream | undefined;
    try {
      const [settings, info] = await Promise.all([window.api.getSettings(), loadAppInfo()]);
      if (id !== generation.current) return;
      if (!info.config.backend.baseUrl || /change-me\.example\.com/i.test(info.config.backend.baseUrl)) {
        throw new Error('Голосове введення буде доступне після підключення сервера розпізнавання.');
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: settings.micDeviceId ? { deviceId: { exact: settings.micDeviceId } } : true
      });
      const captured = stream;
      if (id !== generation.current) { captured.getTracks().forEach(track => track.stop()); return; }
      const rec = new MediaRecorder(captured);
      const chunks: Blob[] = [];
      const started = performance.now();
      recorder.current = rec;
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = async () => {
        captured.getTracks().forEach(track => track.stop());
        if (id !== generation.current) return;
        window.clearTimeout(timer.current);
        recorder.current = null;
        update('transcribing');
        try {
          const seconds = (performance.now() - started) / 1000;
          if (seconds < 0.5) throw new Error(t('voice.tooShort'));
          const blob = new Blob(chunks, { type: rec.mimeType });
          const result = await window.api.transcribeVoice(await blob.arrayBuffer(), { mimeType: blob.type, seconds });
          if (id === generation.current) receive.current(result.text);
        } catch (err) {
          if (id === generation.current) setError(err instanceof Error ? err.message : t('voice.error'));
        } finally {
          if (id === generation.current) update('idle');
        }
      };
      rec.start();
      update('recording');
      timer.current = window.setTimeout(stop, info.config.voice.maxRecordSeconds * 1000);
    } catch (err) {
      stream?.getTracks().forEach(track => track.stop());
      if (id !== generation.current) return;
      setError(err instanceof Error && !(err instanceof DOMException) ? err.message : t('voice.micDenied'));
      update('idle');
    }
  }, [stop, update]);

  useEffect(() => {
    const reset = (): void => {
      ++generation.current;
      stop();
      recorder.current?.stream.getTracks().forEach(track => track.stop());
      recorder.current = null;
      update('idle');
    };
    const onVisibility = (): void => { if (document.hidden) reset(); };
    const off = window.api.on(IPC_EVENTS.VoicePtt, () => { void toggle(); });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      off();
      reset();
    };
  }, [stop, toggle, update]);

  return { phase, error, toggle };
}
