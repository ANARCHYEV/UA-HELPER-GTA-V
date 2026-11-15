import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/ui/Icon';
import { loadAppInfo } from '../hooks/useAppInfo';
import type { AppConfig, SearchHit } from '@shared/types';
import { IPC_EVENTS } from '@shared/ipc-channels';
import { t } from '../i18n';

type SearchMode = 'all' | 'rule' | 'law';

export default function Overlay(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [mode, setMode] = useState<SearchMode>('all');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const toastTimer = useRef<number | null>(null);

  const search = useCallback(async (q: string, nextMode: SearchMode = mode): Promise<void> => {
    setQuery(q);
    if (!q.trim()) { setHits(null); setBusy(false); return; }
    setBusy(true);
    try {
      const results = await window.api.quickSearch(q, nextMode === 'all' ? undefined : nextMode);
      setHits(results.slice(0, 6));
    } finally { setBusy(false); }
  }, [mode]);

  const showToast = useCallback((message: string): void => {
    setVoiceError(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setVoiceError(null), 3500);
  }, []);

  const stopRecording = useCallback(async (): Promise<void> => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    setRecording(false);
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    try {
      const settings = await window.api.getSettings();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: settings.micDeviceId ? { deviceId: { exact: settings.micDeviceId } } : true
      });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      rec.ondataavailable = (event) => chunksRef.current.push(event.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if ((Date.now() - startedAtRef.current) / 1000 < 0.6) return;
        try {
          showToast(t('voice.transcribing'));
          const blob = new Blob(chunksRef.current, { type: rec.mimeType });
          const result = await window.api.transcribeVoice(await blob.arrayBuffer(), { mimeType: rec.mimeType, seconds: (Date.now() - startedAtRef.current) / 1000 });
          await search(result.text);
          setVoiceError(null);
        } catch (error) { showToast(error instanceof Error ? error.message : t('voice.error')); }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      if (config) window.setTimeout(() => void stopRecording(), config.voice.maxRecordSeconds * 1000);
    } catch { showToast(t('voice.micDenied')); }
  }, [config, search, showToast, stopRecording]);

  useEffect(() => {
    void loadAppInfo().then((info) => setConfig(info.config));
    void window.api.getPin().then(setPinned);
    const off = window.api.on(IPC_EVENTS.VoicePtt, () => {
      if (recorderRef.current?.state && recorderRef.current.state !== 'inactive') void stopRecording();
      else void startRecording();
    });
    return () => { off(); if (toastTimer.current) window.clearTimeout(toastTimer.current); };
  }, [startRecording, stopRecording]);

  const changeMode = (next: SearchMode): void => {
    setMode(next);
    if (query.trim()) void search(query, next);
  };

  const openAi = (): void => {
    void window.api.openAiWindow(query.trim() || undefined);
    void window.api.windowControl('hide');
  };

  return (
    <main className="quick-overlay">
      <header className="quick-overlay-top drag-region">
        <div className="quick-search no-drag">
          <span className="quick-brand" aria-hidden="true">UA</span>
          <input
            value={query}
            onChange={(event) => void search(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && query.trim()) {
                event.preventDefault();
                openAi();
              }
            }}
            placeholder="Питання, ситуація, пункт або нік"
            autoFocus
          />
          <button type="button" className={recording ? 'is-recording' : ''} onClick={() => recording ? void stopRecording() : void startRecording()} title={t('voice.record')}><Icon name="mic" size={15} /></button>
        </div>
        <div className="quick-modes no-drag" role="group" aria-label="Тип пошуку">
          <button type="button" className={mode === 'all' ? 'is-active' : ''} onClick={() => changeMode('all')}>Усе</button>
          <button type="button" className={mode === 'rule' ? 'is-active' : ''} onClick={() => changeMode('rule')}>Правила</button>
          <button type="button" className={mode === 'law' ? 'is-active' : ''} onClick={() => changeMode('law')}>Закони</button>
        </div>
        <button type="button" className="quick-icon no-drag" onClick={() => { const next = !pinned; setPinned(next); void window.api.setOnTop(next); }} title={t('overlay.pin')}><Icon name={pinned ? 'pin' : 'pin-off'} size={15} /></button>
        <button type="button" className="quick-icon no-drag" onClick={() => void window.api.windowControl('hide')} title={t('overlay.hide')}><Icon name="close" size={15} /></button>
      </header>

      <section className="quick-overlay-body">
        {voiceError ? <div className="quick-toast">{voiceError}</div> : null}
        {busy ? <div className="quick-loading"><span className="spin-ring" />Шукаю у локальній базі…</div> : null}
        {!busy && hits ? (
          <div className="quick-results">
            {hits.map((hit) => (
              <button key={`${hit.kind}-${hit.id}`} type="button" onClick={() => void window.api.openAiWindow(`Поясни ${hit.id}: ${hit.title}`)}>
                <span>{hit.kind === 'law' ? 'Закон' : hit.kind === 'rule' ? 'Правило' : 'Вікі'} · {hit.id}</span>
                <strong>{hit.title || hit.text}</strong>
                <small>{hit.text}</small>
              </button>
            ))}
            {hits.length === 0 ? <div className="quick-empty">Нічого не знайдено. Спробуй описати ситуацію інакше.</div> : null}
          </div>
        ) : !busy ? (
          <div className="quick-start">
            <h2>Три клавіші — і все під рукою</h2>
            <div className="quick-cards">
              <div><kbd>Alt</kbd><kbd>Q</kbd><strong>Відкрити вікно</strong><span>Поверх гри одним натисканням</span></div>
              <div><kbd>Enter</kbd><strong>Запитати ШІ</strong><span>Опиши питання або ситуацію</span></div>
              <div><kbd>Tab</kbd><strong>Правила й закони</strong><span>Перемикай джерело пошуку</span></div>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="quick-overlay-footer">
        <span><Icon name="warn" size={12} /> Для оверлея у грі обери «Віконний без рамки»</span>
        <button type="button" onClick={openAi}>Запитати ШІ <Icon name="chevron" size={13} /></button>
      </footer>
    </main>
  );
}
