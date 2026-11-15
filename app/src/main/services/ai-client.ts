import { loadConfig } from '../config-loader';
import { keyVault } from './key-vault';
import { retrieveForAi, invalidateIndex } from './retrieval';
import { logger } from './logger';
import { insertAiHistory, incrementUsage, getSettings, patchSettings } from './storage';
import { IPC_EVENTS } from '@shared/ipc-channels';
import type {
  AiAskPayload,
  AiErrorCode,
  AiErrorEvent,
  AiFallbackEvent,
  OpenRouterModelInfo,
  RecommendedModel
} from '@shared/types';

/**
 * OpenRouter client (BYOK - Bring Your Own Key).
 * Requests go DIRECTLY from the main process to openrouter.ai.
 * Nothing passes through our backend: no keys, no prompts, no answers.
 */

interface Job {
  id: string;
  controller: AbortController;
  startedAt: number;
  modelId: string;
  mode: AiAskPayload['mode'];
  prompt: string;
}

const jobs = new Map<string, Job>();

function aiError(code: AiErrorCode, message: string, suggestFallback?: string): AiErrorEvent {
  return { jobId: '', code, message, suggestFallback };
}

/** Maps HTTP/network failures to clear Ukrainian messages. */
function mapHttpError(status: number, modelId: string): { code: AiErrorCode; message: string; fallback: boolean } {
  switch (status) {
    case 401:
      return { code: 'invalid_key', message: 'Ключ недійсний. Перевір його у налаштуваннях ШІ.', fallback: false };
    case 402:
      return {
        code: 'no_credits',
        message: `Модель ${modelId} вимагає кредитів. Обери безкоштовну модель у налаштуваннях.`,
        fallback: true
      };
    case 429:
      return {
        code: 'rate_limited',
        message: 'Перевищено ліміт запитів до моделі. Можна перейти на іншу модель.',
        fallback: true
      };
    case 408:
      return { code: 'timeout', message: 'Модель відповідає надто довго. Спробуй ще раз.', fallback: true };
    default:
      if (status >= 500) {
        return { code: 'server', message: 'Помилка на боці OpenRouter. Спробуй іншу модель.', fallback: true };
      }
      return {
        code: 'model_error',
        message: `Модель ${modelId} повернула помилку ${status}. Спробуй іншу модель.`,
        fallback: true
      };
  }
}

function buildSystemPrompt(
  mode: AiAskPayload['mode'],
  context: Array<{ id: string; kind: string; title: string; text: string; punishment?: string }>
): string {
  const contextBlock =
    context.length > 0
      ? context
          .map(
            (c) =>
              `[${c.id}] (${c.kind === 'law' ? 'закон' : 'правило'}) ${c.title}\n${c.text}${
                c.punishment ? `\nПокарання: ${c.punishment}` : ''
              }`
          )
          .join('\n---\n')
      : '(релевантних пунктів не знайдено)';

  const base = [
    'Ти - помічник з правил рольової гри Ukraine GTA 5 для гравців українського RP-сервера.',
    'Факти про правила, закони, покарання та ID бери ЛИШЕ з наданого нижче контексту.',
    'Обовʼязково посилайся на ID пунктів у форматі [R-XXX-000] або [L-000], якщо вони є в контексті.',
    'Ти можеш і повинен давати практичні поради щодо дій у ситуації, але чітко позначай їх як рекомендацію, а не як правило сервера.',
    'Не вигадуй правила, покарання, ID, рішення адміністрації або гарантії результату.',
    'Якщо фактів ситуації недостатньо, постав до трьох коротких уточнювальних питань і дай умовну пораду для найімовірнішого сценарію.',
    'Якщо відповідного пункту немає у контексті — прямо скажи це, поясни що саме неможливо підтвердити та порадь перевірити офіційний форум або уточнити в адміністрації.',
    '',
    'Формат відповіді:',
    '1) Коротко — відповідь по суті;',
    '2) Що вказано в правилах — застосовні пункти з ID та їхній зміст;',
    '3) Як краще діяти — практична рекомендація без вигаданих норм;',
    '4) Що уточнити — лише якщо для точного висновку бракує даних.',
    '',
    'Відповідай мовою користувача (якщо пише українською - українською).',
    '',
    '=== КОНТЕКСТ ПРАВИЛ ===',
    contextBlock,
    '=== КІНЕЦЬ КОНТЕКСТУ ==='
  ];

  if (mode === 'nickname') {
    base.push(
      '',
      'Завдання: перевір нікнейм користувача за правилами нікнеймів (якщо вони є в контексті).',
      'Критерії: допустима довжина, допустимі символи, заборонені слова/результати.',
      'Якщо правил нікнеймів у контексті немає - скажи про це і дай лише загальні поради.'
    );
  }
  return base.join('\n');
}

function modelChain(selected: string, recommended: RecommendedModel[]): string[] {
  const chain = [selected, ...recommended.map((m) => m.id)];
  return [...new Set(chain.filter(Boolean))];
}

async function streamOnce(
  job: Job,
  modelId: string,
  systemPrompt: string,
  onDelta: (delta: string) => void
): Promise<string> {
  const cfg = loadConfig();
  const key = keyVault.get();
  if (!key) throw aiError('no_key', 'Ключ OpenRouter не задано. Увімкни ШІ у налаштуваннях.');

  const res = await fetch(`${cfg.ai.openRouterBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Title': cfg.product.name
    },
    body: JSON.stringify({
      model: modelId,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: job.prompt }
      ]
    }),
    signal: job.controller.signal
  });

  if (!res.ok) {
    const mapped = mapHttpError(res.status, modelId);
    const err = aiError(mapped.code, mapped.message);
    err.jobId = job.id;
    err.suggestFallback = mapped.fallback ? 'next' : undefined;
    throw err;
  }

  const reader = res.body?.getReader();
  if (!reader) throw aiError('network', 'Порожня відповідь сервера.', undefined);

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          error?: { message?: string };
        };
        if (json.error?.message) {
          const err = aiError('model_error', `Модель ${modelId}: ${json.error.message}`);
          err.jobId = job.id;
          err.suggestFallback = 'next';
          throw err;
        }
        const delta = json.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch (parseErr) {
        // thrown AiErrorEvent must propagate
        if (parseErr && typeof parseErr === 'object' && 'code' in parseErr) throw parseErr;
        // otherwise ignore malformed SSE fragments
      }
    }
  }

  if (!full.trim()) {
    const err = aiError('empty_response', 'Модель повернула порожню відповідь. Спробуй іншу модель.');
    err.jobId = job.id;
    err.suggestFallback = 'next';
    throw err;
  }
  return full;
}

export const aiClient = {
  cancel(jobId: string): void {
    const job = jobs.get(jobId);
    if (job) {
      job.controller.abort();
      jobs.delete(jobId);
    }
  },

  async ask(
    payload: AiAskPayload,
    send: (channel: string, payload: unknown) => void
  ): Promise<{ jobId: string }> {
    const cfg = loadConfig();
    const settings = getSettings();
    const jobId =
      typeof payload.requestId === 'string' && /^ai-[a-f0-9-]{36}$/.test(payload.requestId)
        ? payload.requestId
        : `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!keyVault.has()) {
      const err = aiError('no_key', 'Спочатку увімкни ШІ: додай ключ OpenRouter у налаштуваннях.');
      err.jobId = jobId;
      send(IPC_EVENTS.AiError, err);
      return { jobId };
    }

    incrementUsage();

    const context = retrieveForAi(payload.prompt, cfg.ai.maxContextItems);
    const systemPrompt = buildSystemPrompt(payload.mode, context);
    const chain = modelChain(settings.aiModel, cfg.ai.recommendedModels);

    const job: Job = {
      id: jobId,
      controller: new AbortController(),
      startedAt: Date.now(),
      modelId: chain[0],
      mode: payload.mode,
      prompt: payload.prompt
    };
    jobs.set(jobId, job);

    void (async () => {
      for (let i = 0; i < chain.length; i++) {
        const modelId = chain[i];
        job.modelId = modelId;
        try {
          const answer = await streamOnce(job, modelId, systemPrompt, (delta) => {
            send(IPC_EVENTS.AiChunk, { jobId, delta } satisfies { jobId: string; delta: string });
          });

          const latencyMs = Date.now() - job.startedAt;
          let historyId = 0;
          try {
            historyId = insertAiHistory({
              model: modelId,
              mode: payload.mode,
              prompt: payload.prompt,
              answer,
              latencyMs
            });
          } catch (dbErr) {
            logger.warn('ai-client: history insert failed', dbErr);
          }

          send(IPC_EVENTS.AiDone, {
            jobId,
            answer,
            modelId,
            latencyMs,
            historyId
          });
          jobs.delete(jobId);
          return;
        } catch (err) {
          if (job.controller.signal.aborted) {
            const ev = aiError('cancelled', 'Запит скасовано.');
            ev.jobId = jobId;
            send(IPC_EVENTS.AiError, ev);
            jobs.delete(jobId);
            return;
          }

          if (err && typeof err === 'object' && 'code' in err) {
            const ev = err as AiErrorEvent;
            ev.jobId = jobId;
            const canFallback = ev.suggestFallback === 'next' && i < chain.length - 1;
            if (canFallback && settings.aiAutoFallback) {
              const next = chain[i + 1];
              const fb: AiFallbackEvent = {
                jobId,
                fromModel: modelId,
                toModel: next,
                auto: true,
                reason: ev.message
              };
              send(IPC_EVENTS.AiFallback, fb);
              // remember the working model for future requests
              patchSettings({ aiModel: next });
              continue;
            }
            send(IPC_EVENTS.AiError, ev);
            jobs.delete(jobId);
            return;
          }

          logger.error('ai-client: unexpected error', err);
          const ev = aiError('network', 'Невідома помилка мережі. Спробуй ще раз.');
          ev.jobId = jobId;
          send(IPC_EVENTS.AiError, ev);
          jobs.delete(jobId);
          return;
        }
      }
    })();

    return { jobId };
  },

  /** Live model list from OpenRouter (used by the model picker). */
  async listModels(): Promise<OpenRouterModelInfo[]> {
    const cfg = loadConfig();
    const key = keyVault.get();
    const res = await fetch(`${cfg.ai.openRouterBaseUrl}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`models: HTTP ${res.status}`);
    const json = (await res.json()) as {
      data: Array<{
        id: string;
        name?: string;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    return json.data.map((m) => {
      const promptPrice = Number(m.pricing?.prompt ?? '1');
      return {
        id: m.id,
        name: m.name ?? m.id,
        isFree: m.id.endsWith(':free') || promptPrice === 0
      };
    });
  }
};

/** Rebuild retrieval index after manual KB changes. */
export { invalidateIndex };
