import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { aiClient } from '../services/ai-client';
import { keyVault, validateOpenRouterKey } from '../services/key-vault';
import { getMeta, setMeta, getSettings, patchSettings, getAiHistory, deleteAiHistory, rateAiHistory } from '../services/storage';
import { loadConfig } from '../config-loader';
import type {
  AiAskPayload,
  AiHistoryItem,
  AiHistoryQuery,
  AiStatus,
  OpenRouterModelInfo
} from '@shared/types';

export function registerAiIpc(): void {
  ipcMain.handle(IPC.AiStatusGet, async (): Promise<AiStatus> => {
    const cfg = loadConfig();
    const settings = getSettings();
    const hasKey = keyVault.has();
    const keyValid = hasKey && getMeta('aiKeyValid') === '1';
    return {
      hasKey,
      keyValid,
      modelId: settings.aiModel || cfg.ai.recommendedModels[0]?.id || null,
      recommended: cfg.ai.recommendedModels
    };
  });

  ipcMain.handle(IPC.AiKeySet, async (_e, key: string) => {
    const clean = key.trim();
    if (!clean.startsWith('sk-or-')) {
      return { ok: false, error: 'Ключ OpenRouter починається з «sk-or-». Перевір скопійований текст.' };
    }
    const error = await validateOpenRouterKey(clean);
    if (error) return { ok: false, error };
    const saved = keyVault.set(clean);
    if (!saved) {
      return { ok: false, error: 'Сховище ключів недоступне на цій системі.' };
    }
    setMeta('aiKeyValid', '1');
    // default model = first recommended, if nothing selected yet
    const settings = getSettings();
    const cfg = loadConfig();
    if (!settings.aiModel) {
      patchSettings({ aiModel: cfg.ai.recommendedModels[0]?.id ?? '' });
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.AiKeyRemove, () => {
    keyVault.remove();
    setMeta('aiKeyValid', '0');
  });

  ipcMain.handle(IPC.AiModelsList, async (_e): Promise<OpenRouterModelInfo[]> => {
    return aiClient.listModels();
  });

  ipcMain.handle(IPC.AiAsk, async (event, payload: AiAskPayload) => {
    const sender = event.sender;
    const send = (channel: string, data: unknown) => {
      if (!sender.isDestroyed()) sender.send(channel, data);
    };
    return aiClient.ask(payload, send);
  });

  ipcMain.handle(IPC.AiCancel, (_e, jobId: string) => {
    aiClient.cancel(jobId);
  });

  ipcMain.handle(IPC.AiHistoryList, (_e, query: AiHistoryQuery): AiHistoryItem[] =>
    getAiHistory(query)
  );

  ipcMain.handle(IPC.AiHistoryDelete, (_e, id: number) => {
    deleteAiHistory(id);
  });

  ipcMain.handle(IPC.AiHistoryRate, (_e, id: number, rating: -1 | 1) => {
    rateAiHistory(id, rating);
  });

  // Nickname check is the same pipeline with mode='nickname'
  ipcMain.handle(IPC.AiNicknameCheck, async (event, nickname: string) => {
    const sender = event.sender;
    const send = (channel: string, data: unknown) => {
      if (!sender.isDestroyed()) sender.send(channel, data);
    };
    return aiClient.ask({ prompt: nickname, mode: 'nickname' }, send);
  });
}
