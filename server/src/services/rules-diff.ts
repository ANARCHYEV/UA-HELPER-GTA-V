import { getDb, run, rows } from '../db/db';
import { logger } from './logger';
import { invalidateSearchCache } from './retrieval';
import type { ParsedItem } from './forum-parser';

/**
 * Rules diff & versioning.
 * Compares freshly parsed items with the DB state and produces
 * add / remove / edit_text / edit_punishment / edit_notes changes.
 */

export interface DiffSummary {
  added: number;
  updated: number;
  removed: number;
}

interface ExistingRule {
  id: string;
  text: string;
  punishment: string | null;
  notes: string | null;
  title: string | null;
  forum_url: string | null;
  hash: string;
  ord: number;
}

const CHANGES_TTL = 90 * 24 * 60 * 60 * 1000; // keep changes for 90 days

function recordChange(entity: string, entityId: string, kind: string, oldObj: unknown, newObj: unknown): void {
  const changeId = `${entity}:${entityId}:${kind}:${Date.now()}`;
  run(
    `INSERT OR IGNORE INTO changes (id, entity, entity_id, kind, old_json, new_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    changeId,
    entity,
    entityId,
    kind,
    JSON.stringify(oldObj),
    JSON.stringify(newObj),
    Date.now()
  );
  // prune old changes
  run('DELETE FROM changes WHERE created_at < ?', Date.now() - CHANGES_TTL);
}

function snapshotVersion(entity: string, entityId: string, snapshot: unknown): void {
  const row = rows<{ v: number }>(
    'SELECT COALESCE(MAX(ver), 0) AS v FROM rule_versions WHERE entity = ? AND entity_id = ?',
    entity,
    entityId
  )[0];
  run(
    'INSERT INTO rule_versions (entity, entity_id, ver, snapshot_json, changed_at) VALUES (?, ?, ?, ?, ?)',
    entity,
    entityId,
    (row?.v ?? 0) + 1,
    JSON.stringify(snapshot),
    Date.now()
  );
}

export function diffAndApplyRules(
  section: string,
  items: ParsedItem[],
  allowRemovals = true
): DiffSummary {
  const existing = rows<ExistingRule>(
    'SELECT id, text, punishment, notes, title, forum_url, hash, ord FROM rules WHERE section = ? AND deleted_at IS NULL',
    section
  );
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const now = Date.now();

  let added = 0;
  let updated = 0;
  let removed = 0;

  const apply = getDb().transaction(() => {
    const incomingIds = new Set<string>();

    for (const item of items) {
      incomingIds.add(item.id);
      const prev = existingById.get(item.id);

      if (!prev) {
        run(
          `INSERT INTO rules (id, section, ord, title, text, punishment, notes, forum_url, forum_topic_id, hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
          item.id,
          section,
          item.order,
          item.title,
          item.text,
          item.punishment,
          item.notes,
          item.forumUrl,
          item.hash,
          now,
          now
        );
        recordChange('rules', item.id, 'add', null, {
          section,
          text: item.text,
          punishment: item.punishment,
          notes: item.notes
        });
        snapshotVersion('rules', item.id, { section, text: item.text, punishment: item.punishment, notes: item.notes });
        added++;
        continue;
      }

      const textChanged = prev.text !== item.text;
      const punishChanged = (prev.punishment ?? '') !== item.punishment;
      const notesChanged = (prev.notes ?? '') !== item.notes;

      if (textChanged || punishChanged || notesChanged) {
        run(
          `UPDATE rules SET text = ?, punishment = ?, notes = ?, title = ?, forum_url = ?, hash = ?, updated_at = ?
           WHERE id = ?`,
          item.text,
          item.punishment,
          item.notes,
          item.title,
          item.forumUrl,
          item.hash,
          now,
          item.id
        );
        if (textChanged) {
          recordChange('rules', item.id, 'edit_text', { text: prev.text }, { text: item.text });
        }
        if (punishChanged) {
          recordChange('rules', item.id, 'edit_punishment', { punishment: prev.punishment ?? '' }, { punishment: item.punishment });
        }
        if (notesChanged) {
          recordChange('rules', item.id, 'edit_notes', { notes: prev.notes ?? '' }, { notes: item.notes });
        }
        snapshotVersion('rules', item.id, { section, text: item.text, punishment: item.punishment, notes: item.notes });
        updated++;
      }
    }

    if (allowRemovals) {
      for (const prev of existing) {
        if (!incomingIds.has(prev.id)) {
          run('UPDATE rules SET deleted_at = ? WHERE id = ?', now, prev.id);
          recordChange('rules', prev.id, 'remove', { text: prev.text }, null);
          removed++;
        }
      }
    }
  });

  apply();
  invalidateSearchCache();
  logger.info('diff: rules applied', { section, added, updated, removed, allowRemovals });
  return { added, updated, removed };
}

export function diffAndApplyLaws(items: ParsedItem[], allowRemovals = true): DiffSummary {
  const existing = rows<ExistingRule & { ord: number }>(
    'SELECT id, text, punishment, notes, title, forum_url, hash, ord FROM laws WHERE deleted_at IS NULL'
  );
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const now = Date.now();
  let added = 0;
  let updated = 0;
  let removed = 0;

  const apply = getDb().transaction(() => {
    const incoming = new Set<string>();
    for (const item of items) {
      incoming.add(item.id);
      const prev = existingById.get(item.id);
      if (!prev) {
        run(
          `INSERT INTO laws (id, ord, title, text, punishment, forum_url, hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          item.id,
          item.order,
          item.title || item.id,
          item.text,
          item.punishment,
          item.forumUrl,
          item.hash,
          now,
          now
        );
        recordChange('laws', item.id, 'add', null, { text: item.text, punishment: item.punishment });
        snapshotVersion('laws', item.id, { text: item.text, punishment: item.punishment });
        added++;
      } else if (prev.text !== item.text || (prev.punishment ?? '') !== item.punishment) {
        run(
          'UPDATE laws SET text = ?, punishment = ?, forum_url = ?, hash = ?, updated_at = ? WHERE id = ?',
          item.text,
          item.punishment,
          item.forumUrl,
          item.hash,
          now,
          item.id
        );
        if (prev.text !== item.text) {
          recordChange('laws', item.id, 'edit_text', { text: prev.text }, { text: item.text });
        }
        if ((prev.punishment ?? '') !== item.punishment) {
          recordChange(
            'laws',
            item.id,
            'edit_punishment',
            { punishment: prev.punishment ?? '' },
            { punishment: item.punishment }
          );
        }
        snapshotVersion('laws', item.id, { text: item.text, punishment: item.punishment });
        updated++;
      }
    }
    if (allowRemovals) {
      for (const prev of existing) {
        if (!incoming.has(prev.id)) {
          run('UPDATE laws SET deleted_at = ? WHERE id = ?', now, prev.id);
          recordChange('laws', prev.id, 'remove', { text: prev.text }, null);
          removed++;
        }
      }
    }
  });

  apply();
  invalidateSearchCache();
  logger.info('diff: laws applied', { added, updated, removed, allowRemovals });
  return { added, updated, removed };
}
