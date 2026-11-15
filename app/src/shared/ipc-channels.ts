/**
 * The single source of truth for IPC channel names.
 * Both main and preload must import channels ONLY from this file -
 * no string literals in window managers or renderer code.
 */

/** Request/response channels (invoked via ipcRenderer.invoke). */
export const IPC = {
  // app / config
  AppInfoGet: 'app:info:get',
  AppExternalOpen: 'app:external:open',
  AppClipboardWrite: 'app:clipboard:write',
  AppCliArgs: 'app:cli:get-args',

  // window
  WindowControl: 'window:control',
  WindowSplashComplete: 'window:splash:complete',
  WindowPinToggle: 'window:pin:toggle',
  WindowPinGet: 'window:pin:get',
  WindowOpacitySet: 'window:opacity:set',
  WindowStreamerSet: 'window:streamer:set',
  WindowOverlayToggle: 'window:overlay:toggle',
  WindowOverlayFit: 'window:overlay:fit',
  WindowAiTakeQuestion: 'window:ai:take-question',
  WindowAiOpen: 'window:ai:open',
  WindowWikiOpen: 'window:wiki:open',
  WindowFullscreenCheck: 'window:fullscreen:check',
  WindowOnTopSet: 'window:on-top:set',

  // hotkeys
  HotkeysGetAll: 'hotkeys:get-all',
  HotkeysSet: 'hotkeys:set',

  // settings
  SettingsGetAll: 'settings:get-all',
  SettingsPatch: 'settings:patch',
  SettingsStatsGet: 'settings:stats:get',
  SettingsHistoryClear: 'settings:history:clear',

  // account
  AccountModeGet: 'account:mode:get',
  AccountProfileGet: 'account:profile:get',
  AccountNicknameSet: 'account:nickname:set',
  AccountLogout: 'account:logout',
  AccountTelegramStart: 'account:telegram:start',
  AccountTelegramPoll: 'account:telegram:poll',
  AccountDiscordStart: 'account:discord:start',
  AccountDiscordPoll: 'account:discord:poll',
  AccountSubscriptionCheck: 'account:subscription:check',

  // rules / laws
  RulesSectionsGet: 'rules:sections:get',
  RulesItemsGet: 'rules:items:get',
  RulesSyncStart: 'rules:sync:start',
  RulesChangesGet: 'rules:changes:get',
  RulesChangesMarkRead: 'rules:changes:mark-read',
  RulesLastSyncGet: 'rules:last-sync:get',
  LawsAllGet: 'laws:all:get',
  LawsSearch: 'laws:search',

  // search
  SearchQuick: 'search:quick',

  // ai
  AiStatusGet: 'ai:status:get',
  AiKeySet: 'ai:key:set',
  AiKeyRemove: 'ai:key:remove',
  AiModelsList: 'ai:models:list',
  AiAsk: 'ai:ask',
  AiCancel: 'ai:cancel',
  AiHistoryList: 'ai:history:list',
  AiHistoryDelete: 'ai:history:delete',
  AiHistoryRate: 'ai:history:rate',
  AiNicknameCheck: 'ai:nickname:check',

  // voice
  VoiceDevicesGet: 'voice:devices:get',
  VoiceTranscribe: 'voice:transcribe',

  // wiki / masterlist / market
  WikiEntriesGet: 'wiki:entries:get',
  WikiMapGet: 'wiki:map:territories:get',
  MasterlistServersGet: 'masterlist:servers:get',
  MarketPricesGet: 'market:prices:get',
  WikiRefresh: 'wiki:refresh',

  // updates
  UpdatesCheck: 'updates:check',
  UpdatesDownload: 'updates:download',
  UpdatesInstall: 'updates:install'
} as const;

/** Push channels: main process broadcasts to renderer windows. */
export const IPC_EVENTS = {
  OverlayQuestion: 'event:ai:overlay-question',
  AiChunk: 'event:ai:chunk',
  AiDone: 'event:ai:done',
  AiError: 'event:ai:error',
  AiFallback: 'event:ai:fallback',
  VoicePtt: 'event:voice:ptt',
  VoiceError: 'event:voice:error',
  UpdatesState: 'event:updates:state',
  BackendStatus: 'event:backend:status',
  RulesUpdateAvailable: 'event:rules:update-available',
  ToastPush: 'event:toast'
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

/** All channels that preload exposes `on()` listeners for. */
export const LISTENABLE_CHANNELS: readonly string[] = Object.values(IPC_EVENTS);
