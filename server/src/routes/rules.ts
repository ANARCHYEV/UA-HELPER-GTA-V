import type { FastifyInstance } from 'fastify';
import { rows } from '../db/db';
import { runSync, lastSyncInfo } from '../services/sync-worker';
import { config } from '../config';
import { requireAdmin } from '../services/admin-auth';

/**
 * Rules & changes endpoints consumed by the desktop client.
 * Responses use the camelCase shapes from app/src/shared/types.ts so the
 * client can store them without re-mapping.
 * `since` (unix ms) returns only items changed after the timestamp.
 */

interface RuleRow {
  id: string;
  section: string;
  ord: number;
  title: string | null;
  text: string;
  punishment: string | null;
  notes: string | null;
  forum_url: string | null;
  hash: string;
  updated_at: number;
}

interface ChangeRow {
  id: string;
  entity: string;
  entity_id: string;
  kind: string;
  old_json: string | null;
  new_json: string | null;
  created_at: number;
}

function mapChange(c: ChangeRow): Record<string, unknown> {
  const parse = (raw: string | null): string | undefined => {
    if (!raw) return undefined;
    try {
      const obj = JSON.parse(raw) as { text?: string; punishment?: string; notes?: string };
      return obj.text ?? obj.punishment ?? obj.notes;
    } catch {
      return raw;
    }
  };
  return {
    id: c.id,
    entity: c.entity === 'laws' ? 'law' : 'rule',
    entityId: c.entity_id,
    kind: c.kind,
    oldText: parse(c.old_json),
    newText: parse(c.new_json),
    createdAt: c.created_at,
    isRead: false,
    forumUrl: null
  };
}

export function registerRules(app: FastifyInstance): void {
  app.get<{ Querystring: { since?: string } }>('/v1/rules', async (req) => {
    const since = req.query.since ? Number(req.query.since) : 0;
    const serverTime = Date.now();

    const sectionRows = rows<{ section: string }>(
      'SELECT DISTINCT section FROM rules WHERE deleted_at IS NULL ORDER BY section'
    );
    const sections = sectionRows.map((s, i) => ({ id: s.section, title: s.section, order: i }));

    const ruleRows = since
      ? rows<RuleRow>('SELECT * FROM rules WHERE deleted_at IS NULL AND updated_at > ? ORDER BY section, ord', since)
      : rows<RuleRow>('SELECT * FROM rules WHERE deleted_at IS NULL ORDER BY section, ord');

    const items = ruleRows.map((r) => ({
      id: r.id,
      sectionId: r.section,
      order: r.ord,
      title: r.title ?? undefined,
      text: r.text,
      punishment: r.punishment ?? undefined,
      notes: r.notes ?? undefined,
      forumUrl: r.forum_url ?? undefined,
      hash: r.hash,
      updatedAt: r.updated_at
    }));

    return { serverTime, sections, items };
  });

  app.get<{ Querystring: { since?: string } }>('/v1/rules/changes', async (req) => {
    const since = req.query.since ? Number(req.query.since) : 0;
    const changeRows = since
      ? rows<ChangeRow>('SELECT * FROM changes WHERE created_at > ? ORDER BY created_at DESC LIMIT 500', since)
      : rows<ChangeRow>('SELECT * FROM changes ORDER BY created_at DESC LIMIT 500');
    return { changes: changeRows.map(mapChange) };
  });

  app.post('/v1/rules/sync', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const result = await runSync();
    return { ...result, ...lastSyncInfo() };
  });

  app.get('/v1/rules/last-sync', async () => lastSyncInfo());

  app.get<{ Querystring: { since?: string } }>('/v1/laws', async (req) => {
    const since = req.query.since ? Number(req.query.since) : 0;
    const serverTime = Date.now();
    const lawRows = since
      ? rows<RuleRow>('SELECT * FROM laws WHERE deleted_at IS NULL AND updated_at > ? ORDER BY ord', since)
      : rows<RuleRow>('SELECT * FROM laws WHERE deleted_at IS NULL ORDER BY ord');
    const items = lawRows.map((r) => ({
      id: r.id,
      order: r.ord,
      title: r.title ?? r.id,
      text: r.text,
      punishment: r.punishment ?? undefined,
      forumUrl: r.forum_url ?? undefined,
      hash: r.hash,
      updatedAt: r.updated_at
    }));
    return { serverTime, items };
  });

  // status endpoint used by ops checks
  app.get('/v1/rules/status', async () => {
    const counts = rows<{ c: number }>(
      'SELECT (SELECT COUNT(*) FROM rules WHERE deleted_at IS NULL) + (SELECT COUNT(*) FROM laws WHERE deleted_at IS NULL) AS c'
    )[0];
    return {
      activeItems: counts?.c ?? 0,
      forumRulesUrl: config.forumRulesUrl,
      forumLawsUrl: config.forumLawsUrl,
      ...lastSyncInfo()
    };
  });
}
