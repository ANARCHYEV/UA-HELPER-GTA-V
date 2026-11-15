import { loadConfig } from '../config-loader';
import { isBackendConfigured, serverClient } from './server-client';
import { invalidateIndex } from './retrieval';
import { logger } from './logger';
import { getAppState, broadcastToWindows } from '../app-state';
import {
  countUnreadChanges,
  deleteLawsByIds,
  deleteRulesByIds,
  getLawIds,
  getMeta,
  getRuleIds,
  insertChanges,
  setMeta,
  upsertLaws,
  upsertRules,
  saveSections
} from './storage';
import { seedKnowledgeBase } from './knowledge';
import { IPC_EVENTS } from '@shared/ipc-channels';
import type { RulesSyncResult, RuleChange, RuleItem, LawItem, RuleSection } from '@shared/types';

/**
 * Syncs rules & laws from our backend into the local cache.
 * - Server available: fetch items + diff (changes), store, notify renderer.
 * - Server unavailable: keep working on the local cache (offline mode).
 */

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // hourly background refresh

function serverTimeMeta(): number {
  const raw = getMeta('lastSyncAt');
  return raw ? Number(raw) : 0;
}

function applyServerRules(payload: {
  serverTime: number;
  sections: RuleSection[];
  items: RuleItem[];
  changes: RuleChange[];
  /** true when the response is a full snapshot (no `since` filter). */
  full: boolean;
}): { added: number; updated: number; removed: number } {
  const existing = getRuleIds();
  const incoming = new Set(payload.items.map((i) => i.id));

  let added = 0;
  let updated = 0;
  for (const item of payload.items) {
    if (!existing.has(item.id)) added++;
    else updated++;
  }
  // Only a full snapshot tells us which items are gone. An incremental
  // (`since`) response lists just the CHANGED items - absence there does
  // not mean deletion, so removals are skipped in that case.
  const removedIds = payload.full ? [...existing].filter((id) => !incoming.has(id)) : [];
  if (!payload.full) {
    for (const change of payload.changes) {
      if (change.entity === 'rule' && change.kind === 'remove' && existing.has(change.entityId) && !incoming.has(change.entityId)) {
        removedIds.push(change.entityId);
      }
    }
  }
  const removed = new Set(removedIds).size;

  saveSections(payload.sections);
  upsertRules(payload.items);
  if (removedIds.length) deleteRulesByIds([...new Set(removedIds)]);
  if (payload.changes.length) insertChanges(payload.changes);

  setMeta('lastSyncAt', String(payload.serverTime));
  return { added, updated, removed };
}

function applyServerLaws(payload: { serverTime: number; items: LawItem[]; changes: RuleChange[]; full: boolean }): number {
  const existing = getLawIds();
  const incoming = new Set(payload.items.map((i) => i.id));
  upsertLaws(payload.items);
  const removedIds = payload.full ? [...existing].filter((id) => !incoming.has(id)) : [];
  if (!payload.full) {
    for (const change of payload.changes) {
      if (change.entity === 'law' && change.kind === 'remove' && existing.has(change.entityId) && !incoming.has(change.entityId)) {
        removedIds.push(change.entityId);
      }
    }
  }
  if (removedIds.length) deleteLawsByIds([...new Set(removedIds)]);
  return new Set(removedIds).size;
}

/**
 * Serializes syncs: the splash boot and the background timer both fire at
 * startup, and a second sync must not race the first one (it would read the
 * freshly written `lastSyncAt` and send an incremental request).
 */
let inFlight: Promise<RulesSyncResult> | null = null;

export function syncNow(manual = false): Promise<RulesSyncResult> {
  if (inFlight) return inFlight;
  inFlight = doSync(manual).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(manual: boolean): Promise<RulesSyncResult> {
  seedKnowledgeBase(false); // no-op unless cache is empty

  const before = serverTimeMeta();
  if (!isBackendConfigured()) {
    return {
      ok: false,
      source: 'cache',
      added: 0,
      updated: 0,
      removed: 0,
      lastSyncAt: before,
      error: manual ? 'Сервер спільноти ще не налаштований' : undefined
    };
  }
  const full = before === 0; // no cached timestamp -> full snapshot
  try {
    const [rules, laws, changes] = await Promise.all([
      serverClient.getRules(before || undefined),
      serverClient.getLaws(before || undefined),
      serverClient.getChanges(before || undefined)
    ]);
    logger.info('rules-sync: fetched', {
      since: before || null,
      sections: rules.sections.length,
      items: rules.items.length,
      laws: laws.items.length,
      changes: changes.changes.length
    });

    const counts = applyServerRules({
      serverTime: rules.serverTime,
      sections: rules.sections,
      items: rules.items,
      changes: changes.changes,
      full
    });
    const removedLaws = applyServerLaws({ serverTime: laws.serverTime, items: laws.items, changes: changes.changes, full });
    setMeta('syncSource', 'server');

    invalidateIndex();

    const unread = countUnreadChanges();
    getAppState().rulesUpdateAvailable = unread > 0;
    if (unread > 0) {
      broadcastToWindows(IPC_EVENTS.RulesUpdateAvailable, { unread });
    }

    logger.info('rules-sync: ok', { ...counts, removedLaws, unread });
    return {
      ok: true,
      source: 'server',
      added: counts.added,
      updated: counts.updated,
      removed: counts.removed + removedLaws,
      lastSyncAt: rules.serverTime
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('rules-sync: server unreachable, using cache', message);
    return {
      ok: false,
      source: 'cache',
      added: 0,
      updated: 0,
      removed: 0,
      lastSyncAt: before,
      error: manual ? message : undefined
    };
  }
}
/** Periodic background sync; errors are swallowed (offline-first). */
export function startSyncTimer(): void {
  if (!isBackendConfigured()) {
    logger.info('rules-sync: disabled until backend.baseUrl is configured');
    return;
  }
  void syncNow(false);
  setInterval(() => {
    void syncNow(false);
  }, SYNC_INTERVAL_MS);
}

export function getLastSync(): { lastSyncAt: number; source: 'server' | 'seed'; unreadChanges: number } {
  const source = (getMeta('syncSource') as 'server' | 'seed' | null) ?? 'seed';
  return {
    lastSyncAt: serverTimeMeta(),
    source,
    unreadChanges: countUnreadChanges()
  };
}

export function forumUrls(): { rulesUrl: string; lawsUrl: string } {
  const cfg = loadConfig();
  return { rulesUrl: cfg.forum.rulesUrl, lawsUrl: cfg.forum.lawsUrl };
}
