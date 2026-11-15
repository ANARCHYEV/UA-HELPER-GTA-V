import { createHash } from 'crypto';
import { run, rows } from '../db/db';
import { config } from '../config';
import type { ParsedForumSection } from './forum-parser';
import { diffAndApplyRules, diffAndApplyLaws } from './rules-diff';

import { logger } from './logger';

/**
 * Sync worker: fetches rules & laws from the forum, diffs them against the
 * DB and records changes. Runs on a cron schedule and can be triggered
 * manually (npm run sync:run).
 */

let running = false;

interface ParsedSyncInput {
  ruleSections: ParsedForumSection[];
  /** Null means that the snapshot intentionally contains no laws section. */
  lawSections: ParsedForumSection[] | null;
}

interface SyncResult {
  status: string;
  added: number;
  updated: number;
  removed: number;
  error?: string;
}

function applyParsedSections(input: ParsedSyncInput): Omit<SyncResult, 'status' | 'error'> & { sourceCount: number } {
  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const section of input.ruleSections) {
    const r = diffAndApplyRules(section.title || section.id, section.items, section.complete);
    added += r.added;
    updated += r.updated;
    removed += r.removed;
  }

  let lawsCount = 0;
  if (input.lawSections) {
    const lawItems = input.lawSections
      .flatMap((section) => section.items)
      .map((item, order) => ({ ...item, order }));
    if (!lawItems.length) throw new Error('У розділі законів не знайдено жодного нумерованого пункту.');
    lawsCount = lawItems.length;
    const l = diffAndApplyLaws(lawItems, input.lawSections.every((section) => section.complete));
    added += l.added;
    updated += l.updated;
    removed += l.removed;
  }
  return { added, updated, removed, sourceCount: input.ruleSections.length + lawsCount };
}

async function runParsedSync(load: () => Promise<ParsedSyncInput>): Promise<SyncResult> {
  if (running) return { status: 'skipped', added: 0, updated: 0, removed: 0 };
  running = true;
  const started = Date.now();
  run(
    'INSERT INTO sync_log (started_at, status) VALUES (?, ?)',
    started,
    'running'
  );

  let added = 0;
  let updated = 0;
  let removed = 0;
  let sourceCount = 0;
  let status = 'ok';
  let error: string | undefined;

  try {
    const outcome = applyParsedSections(await load());
    ({ added, updated, removed, sourceCount } = outcome);
    if (added === 0 && updated === 0 && removed === 0 && sourceCount > 0) status = 'not-modified';
  } catch (err) {
    status = 'error';
    error = err instanceof Error ? err.message : String(err);
    logger.error('sync: failed', error);
  }

  run(
    `UPDATE sync_log SET finished_at = ?, status = ?, fetched = ?, added = ?, updated = ?, removed = ?, error = ?
     WHERE id = (SELECT MAX(id) FROM sync_log)`,
    Date.now(),
    status,
    added + updated + removed,
    added,
    updated,
    removed,
    error ?? null
  );
  running = false;
  return { status, added, updated, removed, error };
}

export async function runSync(): Promise<SyncResult> {
  return runParsedSync(async () => {
    const { crawlXenForoRules } = await import('../services/forum-parser.js');
    const ruleSections = await crawlXenForoRules(config.forumRulesUrl, 'R');
    let lawSections: ParsedForumSection[] | null = null;
    if (config.forumLawsUrl) {
      lawSections = await crawlXenForoRules(config.forumLawsUrl, 'L');
    }
    return { ruleSections, lawSections };
  });
}

/** Applies an already validated offline export without fetching the forum. */
export async function runSnapshotSync(input: ParsedSyncInput): Promise<SyncResult> {
  return runParsedSync(async () => input);
}

export function lastSyncInfo(): { lastSyncAt: number | null; status: string | null } {
  const rec = rows<{ finished_at: number | null; status: string }>(
    'SELECT finished_at, status FROM sync_log WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1'
  )[0];
  return { lastSyncAt: rec?.finished_at ?? null, status: rec?.status ?? null };
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`ua-helper:${ip}`).digest('hex').slice(0, 24);
}
