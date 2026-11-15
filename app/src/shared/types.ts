/**
 * Shared types for all processes: main, preload and renderer.
 * The `Api` interface is the typed contract of window.api (contextBridge).
 */
import type { IPC } from './ipc-channels';

// ---------------------------------------------------------------------------
// App configuration (app.config.json)
// ---------------------------------------------------------------------------

export interface ProductInfo {
  name: string;
  slogan: string;
  version: string;
  description?: string;
}

export interface PartnerInfo {
  label: string;
  logoAsset: string;
  url: string;
}

export interface Branding {
  accent: string;
  accent2: string;
  partner: PartnerInfo;
}

export interface BackendConfig {
  baseUrl: string;
  timeoutMs: number;
}

export interface ServerEntry {
  id: string;
  name: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
  description?: string;
  /** Optional URL / command hint for future launcher integration. */
  launchUrl?: string;
  servers: ServerEntry[];
}

export type ModelKind = 'fast' | 'smart' | 'balanced';

export interface RecommendedModel {
  id: string;
  kind: ModelKind;
  titleUk: string;
  descriptionUk: string;
}

export interface AiConfig {
  openRouterBaseUrl: string;
  maxHistoryItems: number;
  maxContextItems: number;
  recommendedModels: RecommendedModel[];
}

export type AuthMode = 'telegram' | 'discord' | 'both';

export type SubscriptionProvider = 'telegram' | 'discord' | 'either';

export interface SubscriptionGateConfig {
  /** Disabled by default so an unfinished community integration never locks people out. */
  enabled: boolean;
  provider: SubscriptionProvider;
  telegramChannel?: string;
  discordGuildId?: string;
  discordRoleId?: string;
}

export interface AuthConfig {
  mode: AuthMode;
  telegramBotUsername?: string;
  discordClientId?: string;
  discordRedirectUri?: string;
  subscription: SubscriptionGateConfig;
}

export interface GuideStep {
  title: string;
  text: string;
  asset?: string;
  link?: string;
}

export interface UpdatesConfig {
  provider: 'generic' | 'github';
  url: string;
  githubOwner?: string;
  githubRepo?: string;
}

export interface VoiceConfig {
  maxRecordSeconds: number;
  maxFileMb: number;
}

export interface AppConfig {
  product: ProductInfo;
  branding: Branding;
  backend: BackendConfig;
  auth: AuthConfig;
  projects: ProjectEntry[];
  ai: AiConfig;
  guide: GuideStep[];
  updates: UpdatesConfig;
  voice: VoiceConfig;
  forum: { rulesUrl: string; lawsUrl: string };
}

export interface AppInfo {
  config: AppConfig;
  appVersion: string;
  electronVersion: string;
  platform: NodeJS.Platform;
}

export interface CliArgs {
  hidden: boolean;
  noLauncher: boolean;
  project: string | null;
}

// ---------------------------------------------------------------------------
// Settings & profile
// ---------------------------------------------------------------------------

export interface AppSettings {
  hotkeyOverlay: string;
  hotkeyPtt: string;
  autoLaunch: boolean;
  pinWindow: boolean;
  streamerMode: boolean;
  overlayOpacity: number;
  language: 'uk';
  aiModel: string;
  aiAutoFallback: boolean;
  checkUpdatesOnStart: boolean;
  micDeviceId: string | null;
}

/** `local` remains only to read and invalidate profiles created by old builds. */
export type AuthProvider = 'telegram' | 'discord' | 'local';

export interface Profile {
  nickname: string;
  authMode: AuthProvider;
  telegramUser?: string;
  discordUser?: string;
  createdAt: number;
}

export interface TelegramStartResult {
  code: string;
  expiresAt: number;
  botUsername: string;
  deepLink: string;
  /** true when the backend is unreachable: login completes locally as a guest. */
  demo: boolean;
}

export type TelegramPollStatus = 'pending' | 'approved' | 'expired' | 'not_found';

export interface TelegramPollResult {
  status: TelegramPollStatus;
  profile?: Profile;
}

export interface DiscordStartResult {
  state: string;
  expiresAt: number;
  authUrl: string;
}

export interface DiscordPollResult {
  status: TelegramPollStatus;
  profile?: Profile;
}

export interface SubscriptionCheckResult {
  required: boolean;
  allowed: boolean;
  provider: SubscriptionProvider;
  reason?: 'not_configured' | 'not_subscribed' | 'unavailable';
}

export interface AiUsageStats {
  today: number;
  total: number;
}

export interface FullscreenState {
  supported: boolean;
  exclusiveFullscreen: boolean;
  /** QUNS value from SHQueryUserNotificationState, -1 when unsupported. */
  state: number;
}

// ---------------------------------------------------------------------------
// Rules / laws / changes
// ---------------------------------------------------------------------------

export interface RuleSection {
  id: string;
  title: string;
  order: number;
}

export interface RuleItem {
  id: string;
  sectionId: string;
  order: number;
  title?: string;
  text: string;
  punishment?: string;
  notes?: string;
  forumUrl?: string;
  hash: string;
  updatedAt: number;
}

export interface LawItem {
  id: string;
  order: number;
  title: string;
  text: string;
  punishment?: string;
  forumUrl?: string;
  hash: string;
  updatedAt: number;
}

export type RuleChangeKind = 'add' | 'remove' | 'edit_text' | 'edit_punishment' | 'edit_notes';

export interface RuleChange {
  id: string;
  entity: 'rule' | 'law';
  entityId: string;
  kind: RuleChangeKind;
  oldText?: string;
  newText?: string;
  createdAt: number;
  isRead: boolean;
  forumUrl?: string;
}

export interface RulesSyncResult {
  ok: boolean;
  source: 'server' | 'cache';
  added: number;
  updated: number;
  removed: number;
  lastSyncAt: number;
  error?: string;
}

export interface RulesLastSync {
  lastSyncAt: number;
  source: 'server' | 'seed';
  unreadChanges: number;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchHitKind = 'rule' | 'law' | 'wiki';

export interface SearchHit {
  kind: SearchHitKind;
  id: string;
  title: string;
  text: string;
  sectionTitle?: string;
  score: number;
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export type AiMode = 'rules' | 'nickname' | 'free';

export interface AiStatus {
  hasKey: boolean;
  keyValid: boolean;
  keyError?: string;
  modelId: string | null;
  recommended: RecommendedModel[];
}

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  isFree: boolean;
}

export interface AiAskPayload {
  prompt: string;
  mode: AiMode;
  /** Renderer-generated correlation ID so early IPC events cannot be lost. */
  requestId?: string;
}

export type AiErrorCode =
  | 'no_key'
  | 'invalid_key'
  | 'no_credits'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'server'
  | 'cancelled'
  | 'model_error'
  | 'empty_response';

export interface AiChunkEvent {
  jobId: string;
  delta: string;
}

export interface AiDoneEvent {
  jobId: string;
  answer: string;
  modelId: string;
  latencyMs: number;
  historyId: number;
}

export interface AiErrorEvent {
  jobId: string;
  code: AiErrorCode;
  /** Human-readable Ukrainian message, safe to show directly. */
  message: string;
  suggestFallback?: string;
}

export interface AiFallbackEvent {
  jobId: string;
  fromModel: string;
  toModel: string | null;
  auto: boolean;
  reason: string;
}

export interface AiHistoryItem {
  id: number;
  createdAt: number;
  model: string;
  mode: AiMode;
  prompt: string;
  answer: string;
  rating: -1 | 0 | 1;
  latencyMs: number;
}

export interface AiHistoryQuery {
  search?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export interface VoiceDevice {
  deviceId: string;
  label: string;
}

export interface VoiceTranscribeResult {
  text: string;
}

// ---------------------------------------------------------------------------
// Wiki / masterlist / market
// ---------------------------------------------------------------------------

export type WikiCategory = 'transport' | 'property' | 'items' | 'characters';

export interface WikiEntry {
  id: string;
  category: WikiCategory;
  title: string;
  subtitle?: string;
  fields: Record<string, string>;
}

export interface Territory {
  id: string;
  name: string;
  faction: string;
  color: string;
  description?: string;
}

export interface MasterlistServer {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  online: boolean;
}

export interface MarketPrice {
  id: string;
  item: string;
  price: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  progress?: number;
  error?: string;
}

export interface BackendStatusEvent {
  online: boolean;
  checkedAt: number;
}

// ---------------------------------------------------------------------------
// IPC channel -> payload map (compile-time safety for invoke())
// ---------------------------------------------------------------------------

export interface IpcRequestMap {
  [IPC.AppInfoGet]: void;
  [IPC.AppClipboardWrite]: string;
  [IPC.AppCliArgs]: void;
  [IPC.WindowPinGet]: void;
  [IPC.WindowFullscreenCheck]: void;
  [IPC.HotkeysGetAll]: void;
  [IPC.SettingsGetAll]: void;
  [IPC.SettingsStatsGet]: void;
  [IPC.AccountModeGet]: void;
  [IPC.AccountProfileGet]: void;
  [IPC.AccountTelegramStart]: void;
  [IPC.AccountDiscordStart]: void;
  [IPC.AccountSubscriptionCheck]: void;
  [IPC.RulesSectionsGet]: void;
  [IPC.RulesSyncStart]: void;
  [IPC.RulesChangesGet]: void;
  [IPC.RulesLastSyncGet]: void;
  [IPC.LawsAllGet]: void;
  [IPC.AiStatusGet]: void;
  [IPC.AiModelsList]: void;
  [IPC.AiHistoryList]: AiHistoryQuery;
  [IPC.VoiceDevicesGet]: void;
  [IPC.WikiEntriesGet]: WikiCategory | 'all';
  [IPC.WikiMapGet]: void;
  [IPC.MasterlistServersGet]: void;
  [IPC.MarketPricesGet]: void;
  [IPC.UpdatesCheck]: void;
}

// ---------------------------------------------------------------------------
// Typed bridge contract exposed by preload as window.api
// ---------------------------------------------------------------------------

export interface Api {
  // app
  getInfo(): Promise<AppInfo>;
  getCliArgs(): Promise<CliArgs>;
  openExternal(url: string): Promise<void>;
  copyText(text: string): Promise<void>;

  // window
  windowControl(action: 'minimize' | 'hide' | 'close'): Promise<void>;
  completeSplash(): Promise<void>;
  togglePin(): Promise<boolean>;
  getPin(): Promise<boolean>;
  setOpacity(value: number): Promise<void>;
  setStreamerMode(enabled: boolean): Promise<void>;
  toggleOverlay(): Promise<boolean>;
  openAiWindow(prompt?: string): Promise<void>;
  takeOverlayQuestion(): Promise<string | null>;
  fitOverlay(height: number): Promise<void>;
  openWikiWindow(): Promise<void>;
  checkFullscreen(): Promise<FullscreenState>;
  setOnTop(enabled: boolean): Promise<void>;

  // hotkeys
  getHotkeys(): Promise<{ overlay: string; ptt: string }>;
  setHotkey(id: 'overlay' | 'ptt', accelerator: string): Promise<boolean>;

  // settings
  getSettings(): Promise<AppSettings>;
  patchSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getStats(): Promise<AiUsageStats>;
  clearAiHistory(): Promise<void>;

  // account
  getAuthMode(): Promise<AuthMode>;
  getProfile(): Promise<Profile | null>;
  logout(): Promise<void>;
  telegramStart(): Promise<TelegramStartResult>;
  telegramPoll(code: string): Promise<TelegramPollResult>;
  discordStart(): Promise<DiscordStartResult>;
  discordPoll(state: string): Promise<DiscordPollResult>;
  checkSubscription(): Promise<SubscriptionCheckResult>;

  // rules / laws
  getRuleSections(): Promise<RuleSection[]>;
  getRuleItems(sectionId?: string): Promise<RuleItem[]>;
  syncRules(): Promise<RulesSyncResult>;
  getRuleChanges(unreadOnly?: boolean): Promise<RuleChange[]>;
  markChangesRead(ids: string[]): Promise<void>;
  getLastSync(): Promise<RulesLastSync>;
  getLaws(): Promise<LawItem[]>;
  searchLaws(query: string): Promise<LawItem[]>;

  // search
  quickSearch(query: string, kind?: 'rule' | 'law'): Promise<SearchHit[]>;

  // ai
  getAiStatus(): Promise<AiStatus>;
  setAiKey(key: string): Promise<{ ok: boolean; error?: string }>;
  removeAiKey(): Promise<void>;
  listAiModels(): Promise<OpenRouterModelInfo[]>;
  askAi(payload: AiAskPayload): Promise<{ jobId: string }>;
  cancelAi(jobId: string): Promise<void>;
  getAiHistory(query: AiHistoryQuery): Promise<AiHistoryItem[]>;
  deleteAiHistory(id: number): Promise<void>;
  rateAiHistory(id: number, rating: -1 | 1): Promise<void>;
  checkNickname(nickname: string): Promise<{ jobId: string }>;

  // voice
  getVoiceDevices(): Promise<VoiceDevice[]>;
  transcribeVoice(
    audio: ArrayBuffer,
    meta: { mimeType: string; seconds: number }
  ): Promise<VoiceTranscribeResult>;

  // wiki / masterlist / market
  getWikiEntries(category: WikiCategory | 'all'): Promise<WikiEntry[]>;
  getTerritories(): Promise<Territory[]>;
  getMasterlistServers(): Promise<MasterlistServer[]>;
  getMarketPrices(): Promise<MarketPrice[]>;
  refreshWiki(): Promise<void>;

  // updates
  checkUpdates(): Promise<UpdateState>;
  downloadUpdates(): Promise<UpdateState>;
  installUpdates(): Promise<void>;

  // event subscriptions (push channels only)
  on(channel: string, listener: (...args: unknown[]) => void): () => void;
}
