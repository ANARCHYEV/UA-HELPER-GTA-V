import { contextBridge, ipcRenderer } from 'electron';
import { IPC, LISTENABLE_CHANNELS } from '@shared/ipc-channels';
import type { Api, AiAskPayload, AiHistoryQuery, VoiceTranscribeResult } from '@shared/types';

/**
 * Typed contextBridge exposing window.api to the renderer.
 * Only whitelisted request channels and push events are reachable;
 * the renderer has no direct access to Node or Electron APIs.
 */

const api: Api = {
  // app
  getInfo: () => ipcRenderer.invoke(IPC.AppInfoGet),
  getCliArgs: () => ipcRenderer.invoke(IPC.AppCliArgs),
  openExternal: (url) => ipcRenderer.invoke(IPC.AppExternalOpen, url),
  copyText: (text) => ipcRenderer.invoke(IPC.AppClipboardWrite, text),

  // window
  windowControl: (action) => ipcRenderer.invoke(IPC.WindowControl, action),
  completeSplash: () => ipcRenderer.invoke(IPC.WindowSplashComplete),
  togglePin: () => ipcRenderer.invoke(IPC.WindowPinToggle),
  getPin: () => ipcRenderer.invoke(IPC.WindowPinGet),
  setOpacity: (value) => ipcRenderer.invoke(IPC.WindowOpacitySet, value),
  setStreamerMode: (enabled) => ipcRenderer.invoke(IPC.WindowStreamerSet, enabled),
  toggleOverlay: () => ipcRenderer.invoke(IPC.WindowOverlayToggle),
  openAiWindow: (prompt) => ipcRenderer.invoke(IPC.WindowAiOpen, prompt),
  takeOverlayQuestion: () => ipcRenderer.invoke(IPC.WindowAiTakeQuestion),
  fitOverlay: (height) => ipcRenderer.invoke(IPC.WindowOverlayFit, height),
  openWikiWindow: () => ipcRenderer.invoke(IPC.WindowWikiOpen),
  checkFullscreen: () => ipcRenderer.invoke(IPC.WindowFullscreenCheck),
  setOnTop: (enabled) => ipcRenderer.invoke(IPC.WindowOnTopSet, enabled),

  // hotkeys
  getHotkeys: () => ipcRenderer.invoke(IPC.HotkeysGetAll),
  setHotkey: (id, accelerator) => ipcRenderer.invoke(IPC.HotkeysSet, id, accelerator),

  // settings
  getSettings: () => ipcRenderer.invoke(IPC.SettingsGetAll),
  patchSettings: (patch) => ipcRenderer.invoke(IPC.SettingsPatch, patch),
  getStats: () => ipcRenderer.invoke(IPC.SettingsStatsGet),
  clearAiHistory: () => ipcRenderer.invoke(IPC.SettingsHistoryClear),

  // account
  getAuthMode: () => ipcRenderer.invoke(IPC.AccountModeGet),
  getProfile: () => ipcRenderer.invoke(IPC.AccountProfileGet),
  logout: () => ipcRenderer.invoke(IPC.AccountLogout),
  telegramStart: () => ipcRenderer.invoke(IPC.AccountTelegramStart),
  telegramPoll: (code) => ipcRenderer.invoke(IPC.AccountTelegramPoll, code),
  discordStart: () => ipcRenderer.invoke(IPC.AccountDiscordStart),
  discordPoll: (state) => ipcRenderer.invoke(IPC.AccountDiscordPoll, state),
  checkSubscription: () => ipcRenderer.invoke(IPC.AccountSubscriptionCheck),

  // rules / laws
  getRuleSections: () => ipcRenderer.invoke(IPC.RulesSectionsGet),
  getRuleItems: (sectionId) => ipcRenderer.invoke(IPC.RulesItemsGet, sectionId),
  syncRules: () => ipcRenderer.invoke(IPC.RulesSyncStart, true),
  getRuleChanges: (unreadOnly) => ipcRenderer.invoke(IPC.RulesChangesGet, unreadOnly),
  markChangesRead: (ids) => ipcRenderer.invoke(IPC.RulesChangesMarkRead, ids),
  getLastSync: () => ipcRenderer.invoke(IPC.RulesLastSyncGet),
  getLaws: () => ipcRenderer.invoke(IPC.LawsAllGet),
  searchLaws: (query) => ipcRenderer.invoke(IPC.LawsSearch, query),

  // search
  quickSearch: (query, kind) => ipcRenderer.invoke(IPC.SearchQuick, query, kind),

  // ai
  getAiStatus: () => ipcRenderer.invoke(IPC.AiStatusGet),
  setAiKey: (key) => ipcRenderer.invoke(IPC.AiKeySet, key),
  removeAiKey: () => ipcRenderer.invoke(IPC.AiKeyRemove),
  listAiModels: () => ipcRenderer.invoke(IPC.AiModelsList),
  askAi: (payload: AiAskPayload) => ipcRenderer.invoke(IPC.AiAsk, payload),
  cancelAi: (jobId) => ipcRenderer.invoke(IPC.AiCancel, jobId),
  getAiHistory: (query: AiHistoryQuery) => ipcRenderer.invoke(IPC.AiHistoryList, query),
  deleteAiHistory: (id) => ipcRenderer.invoke(IPC.AiHistoryDelete, id),
  rateAiHistory: (id, rating) => ipcRenderer.invoke(IPC.AiHistoryRate, id, rating),
  checkNickname: (nickname) => ipcRenderer.invoke(IPC.AiNicknameCheck, nickname),

  // voice
  getVoiceDevices: async () => {
    // Mic enumeration runs in the renderer context where permissions apply.
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'audioinput'
    );
    return devices.map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Мікрофон ${d.deviceId.slice(0, 6)}`
    }));
  },
  transcribeVoice: async (audio, meta): Promise<VoiceTranscribeResult> => {
    // structured-clone-safe: wrap into a plain Uint8Array
    const payload = new Uint8Array(audio);
    return ipcRenderer.invoke(IPC.VoiceTranscribe, payload, meta);
  },

  // wiki / masterlist / market
  getWikiEntries: (category) => ipcRenderer.invoke(IPC.WikiEntriesGet, category),
  getTerritories: () => ipcRenderer.invoke(IPC.WikiMapGet),
  getMasterlistServers: () => ipcRenderer.invoke(IPC.MasterlistServersGet),
  getMarketPrices: () => ipcRenderer.invoke(IPC.MarketPricesGet),
  refreshWiki: () => ipcRenderer.invoke(IPC.WikiRefresh),

  // updates
  checkUpdates: () => ipcRenderer.invoke(IPC.UpdatesCheck),
  downloadUpdates: () => ipcRenderer.invoke(IPC.UpdatesDownload),
  installUpdates: () => ipcRenderer.invoke(IPC.UpdatesInstall),

  // events (push channels only)
  on: (channel, listener) => {
    if (!LISTENABLE_CHANNELS.includes(channel)) {
      throw new Error(`Channel not allowed for events: ${channel}`);
    }
    const wrapped = (_event: unknown, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
};

contextBridge.exposeInMainWorld('api', api);
