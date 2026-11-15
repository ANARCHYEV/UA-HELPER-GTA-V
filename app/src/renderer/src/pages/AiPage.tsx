import React, { useCallback, useEffect, useRef, useState } from 'react';
import TitleBar from '../components/ui/TitleBar';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import Skeleton from '../components/ui/Skeleton';
import GuideWizard from '../components/common/GuideWizard';
import { useToast } from '../components/ui/Toast';
import { loadAppInfo } from '../hooks/useAppInfo';
import type {
  AiChunkEvent,
  AiDoneEvent,
  AiErrorEvent,
  AiFallbackEvent,
  AiHistoryItem,
  AiStatus,
  AppConfig
} from '@shared/types';
import { IPC_EVENTS } from '@shared/ipc-channels';
import { t, tFormat } from '../i18n';

/**
 * AI chat window: streaming answers, cancel, fallback banner, thumbs rating,
 * copy, history with search & delete, nickname check mode.
 * BYOK: answers stream directly from OpenRouter; nothing touches our server.
 */

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  modelId?: string;
  rating?: -1 | 0 | 1;
  historyId?: number;
}

let nextMsgId = 1;

export default function AiPage(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [history, setHistory] = useState<AiHistoryItem[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micErr, setMicErr] = useState<string | null>(null);
  const toast = useToast();
  const listRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const streamTextRef = useRef('');
  const [overlayQuestion, setOverlayQuestion] = useState<string | null>(null);

  useEffect(() => {
    const receiveQuestion = (): void => {
      void window.api.takeOverlayQuestion().then((question) => {
        if (question) setOverlayQuestion(question);
      });
    };
    const off = window.api.on(IPC_EVENTS.OverlayQuestion, receiveQuestion);
    receiveQuestion();
    return off;
  }, []);

  useEffect(() => {
    void loadAppInfo().then((info) => setConfig(info.config));
    void window.api.getAiStatus().then((s) => {
      setAiStatus(s);
      if (!s.hasKey) setWizardOpen(true);
    });
  }, []);

  // scroll to bottom on new content
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const aiEnabled = aiStatus?.hasKey === true;

  const send = useCallback(
    async (prompt: string, mode: 'rules' | 'free' | 'nickname' = 'rules'): Promise<void> => {
      if (!prompt.trim() || streaming) return;
      if (!aiEnabled) {
        setWizardOpen(true);
        return;
      }
      setFallbackMsg(null);
      setMessages((prev) => [...prev, { id: nextMsgId++, role: 'user', text: prompt }]);
      setInput('');
      setStreaming(true);
      streamTextRef.current = '';
      const assistantId = nextMsgId++;
      const currentJobId = `ai-${crypto.randomUUID()}`;
      setJobId(currentJobId);
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', text: '' }]);

      const offChunk = window.api.on(IPC_EVENTS.AiChunk, (payload: unknown) => {
        const ev = payload as AiChunkEvent;
        if (ev.jobId !== currentJobId) return;
        streamTextRef.current += ev.delta;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: streamTextRef.current } : m))
        );
      });
      const offDone = window.api.on(IPC_EVENTS.AiDone, (payload: unknown) => {
        const ev = payload as AiDoneEvent;
        if (ev.jobId !== currentJobId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: ev.answer, modelId: ev.modelId, historyId: ev.historyId, rating: 0 }
              : m
          )
        );
        cleanup();
      });
      const offError = window.api.on(IPC_EVENTS.AiError, (payload: unknown) => {
        const ev = payload as AiErrorEvent;
        if (ev.jobId !== currentJobId) return;
        if (ev.code === 'cancelled') {
          cleanup();
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        toast.show('error', ev.message);
        if (ev.suggestFallback) setFallbackMsg(t('ai.fallbackHint'));
        cleanup();
      });
      const offFallback = window.api.on(IPC_EVENTS.AiFallback, (payload: unknown) => {
        const ev = payload as AiFallbackEvent;
        if (ev.jobId !== currentJobId) return;
        setFallbackMsg(tFormat('ai.switchedModel', { model: ev.toModel ?? '' }));
      });

      try {
        await window.api.askAi({ prompt, mode, requestId: currentJobId });
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        toast.show('error', err instanceof Error ? err.message : t('voice.error'));
        cleanup();
      }

      function cleanup(): void {
        offChunk();
        offDone();
        offError();
        offFallback();
        setStreaming(false);
        setJobId(null);
      }
    },
    [aiEnabled, streaming, toast]
  );

  useEffect(() => {
    if (!overlayQuestion || !aiStatus) return;
    setOverlayQuestion(null);
    if (aiStatus.hasKey && !streaming) void send(overlayQuestion);
    else {
      setInput(overlayQuestion);
      if (!aiStatus.hasKey) setWizardOpen(true);
    }
  }, [overlayQuestion, aiStatus, streaming, send]);

  const cancel = async (): Promise<void> => {
    if (jobId) await window.api.cancelAi(jobId);
  };

  const rate = async (historyId: number, rating: -1 | 1): Promise<void> => {
    await window.api.rateAiHistory(historyId, rating);
    setMessages((prev) => prev.map((m) => (m.historyId === historyId ? { ...m, rating } : m)));
  };

  const copy = async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text);
    toast.show('success', t('common.copied'));
  };

  const openHistory = async (): Promise<void> => {
    setHistory(null);
    setHistoryOpen(true);
    const items = await window.api.getAiHistory({ search: historySearch || undefined, limit: 50 });
    setHistory(items);
  };

  // voice recording (MediaRecorder in renderer, transcription via VPS)
  const stopRecording = useCallback(async (): Promise<void> => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    setRecording(false);
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    try {
      const settings = await window.api.getSettings();
      const constraints: MediaStreamConstraints = {
        audio: settings.micDeviceId ? { deviceId: { exact: settings.micDeviceId } } : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const seconds = (Date.now() - startedAtRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        if (seconds < 0.6) {
          setMicErr(t('voice.tooShort'));
          return;
        }
        toast.show('info', t('voice.transcribing'));
        try {
          const buf = await blob.arrayBuffer();
          const res = await window.api.transcribeVoice(buf, {
            mimeType: rec.mimeType,
            seconds
          });
          setInput((prev) => (prev ? `${prev} ${res.text}` : res.text));
        } catch (err) {
          setMicErr(err instanceof Error ? err.message : t('voice.error'));
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setMicErr(null);
      // auto-stop at the configured limit
      const cfg = config;
      if (cfg) {
        window.setTimeout(() => void stopRecording(), cfg.voice.maxRecordSeconds * 1000);
      }
    } catch {
      setMicErr(t('voice.micDenied'));
    }
  }, [config, stopRecording, toast]);

  // push-to-talk hotkey toggles recording
  useEffect(() => {
    const off = window.api.on(IPC_EVENTS.VoicePtt, () => {
      if (recording) void stopRecording();
      else void startRecording();
    });
    return off;
  }, [recording, startRecording, stopRecording]);

  const historyItems = history ?? [];

  return (
    <div style={{ position: 'relative', height: '100%', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
      <TitleBar title={`${config?.product.name ?? ''} — ШІ`} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 16px' }}>
        {/* header row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <span className="badge">{aiStatus?.modelId ?? t('ai.noModel')}</span>
          {aiStatus?.hasKey && !aiStatus.keyValid && <span className="badge badge-warning">{t('settings.keyNotValidated')}</span>}
          <span style={{ flex: 1 }} />
          <Button size="s" icon="history" variant="ghost" onClick={() => void openHistory()}>
            {t('ai.history')}
          </Button>
          {aiEnabled && (
            <Button size="s" variant="ghost" onClick={() => setWizardOpen(true)}>
              {t('settings.changeModel')}
            </Button>
          )}
        </div>

        {fallbackMsg && (
          <div className="glass fade-in" style={{ padding: '8px 14px', marginBottom: 10, borderColor: 'rgba(255,180,84,.4)', color: 'var(--warning)', fontSize: 'var(--fs-s)' }}>
            {fallbackMsg}
          </div>
        )}

        {/* messages */}
        <div ref={listRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
          {messages.length === 0 && (
            <div className="glass" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 'var(--fs-s)', lineHeight: 1.7 }}>
              <Icon name="sparkles" size={28} />
              <div style={{ marginTop: 10 }}>{t('ai.emptyHint')}</div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button size="s" variant="ghost" onClick={() => void send('Як діє правило про Deathmatch?')}>
                  {t('ai.example1')}
                </Button>
                <Button size="s" variant="ghost" onClick={() => void send('Що буде за вихід з міста без RP?')}>
                  {t('ai.example2')}
                </Button>
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div className="glass fade-in selectable" style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: 'var(--radius-m) var(--radius-m) 4px var(--radius-m)', background: 'var(--accent-soft)' }}>
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div className="glass fade-in selectable" style={{ maxWidth: '86%', padding: '12px 14px', borderRadius: 'var(--radius-m) var(--radius-m) var(--radius-m) 4px' }}>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-s)', lineHeight: 1.65 }}>
                    {m.text || <Skeleton height={14} width={220} />}
                  </div>
                  {m.text && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
                      {m.modelId && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>{m.modelId}</span>}
                      <span style={{ flex: 1 }} />
                      <button className="btn btn-ghost btn-icon" onClick={() => void copy(m.text)} title={t('common.copy')}>
                        <Icon name="copy" size={14} />
                      </button>
                      {m.historyId !== undefined && m.historyId > 0 && (
                        <>
                          <button className="btn btn-ghost btn-icon" style={{ color: m.rating === 1 ? 'var(--success)' : 'var(--text-3)' }} onClick={() => void rate(m.historyId as number, 1)}>
                            <Icon name="like" size={14} />
                          </button>
                          <button className="btn btn-ghost btn-icon" style={{ color: m.rating === -1 ? 'var(--danger)' : 'var(--text-3)' }} onClick={() => void rate(m.historyId as number, -1)}>
                            <Icon name="dislike" size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* input */}
        <div style={{ marginTop: 12 }}>
          {micErr && (
            <div style={{ color: 'var(--danger)', fontSize: 'var(--fs-xs)', marginBottom: 6 }}>{micErr}</div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button
              className={`btn btn-icon no-drag ${recording ? 'btn-danger pulse-dot' : ''}`}
              title={t('voice.record')}
              onClick={() => (recording ? void stopRecording() : void startRecording())}
            >
              <Icon name="mic" size={16} />
            </button>
            <textarea
              className="input no-drag"
              rows={2}
              placeholder={t('ai.inputPlaceholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              style={{ resize: 'none' }}
            />
            {streaming ? (
              <Button variant="danger" icon="stop" onClick={() => void cancel()}>
                {t('ai.stop')}
              </Button>
            ) : (
              <Button variant="primary" icon="send" disabled={!input.trim()} onClick={() => void send(input)}>
                {t('ai.send')}
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button size="s" variant="ghost" disabled={!input.trim() || streaming} onClick={() => void send(input.trim(), 'nickname')}>
              {t('ai.checkNickname')}
            </Button>
          </div>
        </div>
      </div>

      {/* history modal */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={t('ai.history')} width={600}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="input no-drag"
            placeholder={t('ai.historySearch')}
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void openHistory();
            }}
          />
          <Button size="s" icon="search" onClick={() => void openHistory()}>
            {t('common.search')}
          </Button>
        </div>
        {!history && <Skeleton height={200} />}
        {history && historyItems.length === 0 && (
          <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>{t('ai.historyEmpty')}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {historyItems.map((h) => (
            <div key={h.id} className="glass selectable" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
                  {new Date(h.createdAt).toLocaleString('uk-UA')} · {h.model}
                </span>
                <span style={{ flex: 1 }} />
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => {
                    void window.api.deleteAiHistory(h.id);
                    void openHistory();
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
              <div style={{ fontSize: 'var(--fs-s)', fontWeight: 700, marginBottom: 4 }}>{h.prompt}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-2)', whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'hidden' }}>
                {h.answer}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {config && <GuideWizard open={wizardOpen} onClose={() => {
        setWizardOpen(false);
        void window.api.getAiStatus().then(setAiStatus);
      }} config={config} />}
    </div>
  );
}
