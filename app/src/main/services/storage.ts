import Database from 'better-sqlite3';
import { app } from 'electron';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type {
  AppSettings,
  AiHistoryItem,
  LawItem,
  Profile,
  RuleChange,
  RuleItem,
  RuleSection
} from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';

let db: Database.Database | null = null;

/** Markers used only by pre-release fixtures. Never expose them to players. */
function isReleasePlaceholderSection(section: RuleSection): boolean {
  return section.id.trim().toLowerCase() === 'demo' || /^demo\b/i.test(section.title.trim());
}

function isReleasePlaceholderRule(item: RuleItem): boolean {
  return item.id.startsWith('R-DEM-')
    || item.sectionId.trim().toLowerCase() === 'demo'
    || /^демо\b/i.test(item.title?.trim() ?? '')
    || item.text.startsWith('ДЕМО-ДАНІ:');
}

export function initStorage(): Database.Database {
  if (db) return db;
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  db = new Database(join(dir, 'app.db'));
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Storage is not initialized');
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nickname TEXT NOT NULL,
      auth_mode TEXT NOT NULL,
      telegram_user TEXT,
      discord_user TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rules_cache (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL,
      ord INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      text TEXT NOT NULL,
      punishment TEXT,
      notes TEXT,
      forum_url TEXT,
      hash TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rule_sections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      ord INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS laws_cache (
      id TEXT PRIMARY KEY,
      ord INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      punishment TEXT,
      forum_url TEXT,
      hash TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rule_changes (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      old_text TEXT,
      new_text TEXT,
      created_at INTEGER NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      forum_url TEXT
    );
    CREATE TABLE IF NOT EXISTS ai_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      model TEXT NOT NULL,
      mode TEXT NOT NULL,
      prompt TEXT NOT NULL,
      answer TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS usage_stats (
      day TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS kb_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const profileColumns = d.prepare('PRAGMA table_info(profile)').all() as { name: string }[];
  if (!profileColumns.some((column) => column.name === 'discord_user')) {
    d.exec('ALTER TABLE profile ADD COLUMN discord_user TEXT');
  }
  // Remove pre-release placeholder records without touching real cached forum data.
  // The release must never present test content as an official project rule.
  d.prepare("DELETE FROM rules_cache WHERE text LIKE 'ЗАГЛУШКА.%' OR id GLOB 'R-DEM-*' OR section_id = 'demo' OR text LIKE 'ДЕМО-ДАНІ:%'").run();
  d.prepare("DELETE FROM laws_cache WHERE text LIKE 'ЗАГЛУШКА.%'").run();
  d.prepare('DELETE FROM rule_sections WHERE id NOT IN (SELECT DISTINCT section_id FROM rules_cache)').run();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSettings(): AppSettings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const stmt = getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = getDb().transaction((entries: [string, unknown][]) => {
    for (const [key, value] of entries) stmt.run(key, JSON.stringify(value));
  });
  tx(Object.entries(patch));
  return getSettings();
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function getProfile(): Profile | null {
  const row = getDb().prepare('SELECT * FROM profile WHERE id = 1').get() as
    | { nickname: string; auth_mode: string; telegram_user: string | null; discord_user: string | null; created_at: number }
    | undefined;
  if (!row) return null;
  return {
    nickname: row.nickname,
    authMode: row.auth_mode as Profile['authMode'],
    telegramUser: row.telegram_user ?? undefined,
    discordUser: row.discord_user ?? undefined,
    createdAt: row.created_at
  };
}

export function setProfile(p: Omit<Profile, 'createdAt'>): Profile {
  const full: Profile = { ...p, createdAt: Date.now() };
  getDb()
    .prepare(
      `INSERT INTO profile (id, nickname, auth_mode, telegram_user, discord_user, created_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname,
         auth_mode = excluded.auth_mode, telegram_user = excluded.telegram_user,
         discord_user = excluded.discord_user`
    )
    .run(full.nickname, full.authMode, full.telegramUser ?? null, full.discordUser ?? null, full.createdAt);
  return full;
}

export function clearProfile(): void {
  getDb().prepare('DELETE FROM profile WHERE id = 1').run();
}

// ---------------------------------------------------------------------------
// Rules / laws / changes caches
// ---------------------------------------------------------------------------

export function saveSections(sections: RuleSection[]): void {
  const stmt = getDb().prepare(
    `INSERT INTO rule_sections (id, title, ord) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, ord = excluded.ord`
  );
  const tx = getDb().transaction((list: RuleSection[]) => {
    // The server always sends the FULL section list (even for incremental
    // rule updates), so replacing the set keeps stale sections out.
    getDb().prepare('DELETE FROM rule_sections').run();
    for (const s of list) stmt.run(s.id, s.title, s.order);
  });
  tx(sections.filter((section) => !isReleasePlaceholderSection(section)));
}

export function getSections(): RuleSection[] {
  const rows = getDb()
    .prepare('SELECT id, title, ord FROM rule_sections ORDER BY ord')
    .all() as { id: string; title: string; ord: number }[];
  return rows.map((r) => ({ id: r.id, title: r.title, order: r.ord }));
}

export function upsertRules(items: RuleItem[]): void {
  const stmt = getDb().prepare(
    `INSERT INTO rules_cache (id, section_id, ord, title, text, punishment, notes, forum_url, hash, updated_at)
     VALUES (@id, @sectionId, @order, @title, @text, @punishment, @notes, @forumUrl, @hash, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       section_id = excluded.section_id, ord = excluded.ord, title = excluded.title,
       text = excluded.text, punishment = excluded.punishment, notes = excluded.notes,
       forum_url = excluded.forum_url, hash = excluded.hash, updated_at = excluded.updated_at`
  );
  const tx = getDb().transaction((list: RuleItem[]) => {
    for (const it of list) {
      stmt.run({ ...it, title: it.title ?? null, punishment: it.punishment ?? null,
        notes: it.notes ?? null, forumUrl: it.forumUrl ?? null });
    }
  });
  tx(items.filter((item) => !isReleasePlaceholderRule(item)));
}

export function getRuleItems(sectionId?: string): RuleItem[] {
  const sql = sectionId
    ? 'SELECT * FROM rules_cache WHERE section_id = ? ORDER BY section_id, ord'
    : 'SELECT * FROM rules_cache ORDER BY section_id, ord';
  const rows = getDb()
    .prepare(sql)
    .all(...(sectionId ? [sectionId] : [])) as Array<{
    id: string;
    section_id: string;
    ord: number;
    title: string | null;
    text: string;
    punishment: string | null;
    notes: string | null;
    forum_url: string | null;
    hash: string;
    updated_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    sectionId: r.section_id,
    order: r.ord,
    title: r.title ?? undefined,
    text: r.text,
    punishment: r.punishment ?? undefined,
    notes: r.notes ?? undefined,
    forumUrl: r.forum_url ?? undefined,
    hash: r.hash,
    updatedAt: r.updated_at
  }));
}

export function getRuleIds(): Set<string> {
  const rows = getDb().prepare('SELECT id FROM rules_cache').all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

export function deleteRulesByIds(ids: string[]): void {
  const stmt = getDb().prepare('DELETE FROM rules_cache WHERE id = ?');
  const tx = getDb().transaction((list: string[]) => {
    for (const id of list) stmt.run(id);
  });
  tx(ids);
}

export function upsertLaws(items: LawItem[]): void {
  const stmt = getDb().prepare(
    `INSERT INTO laws_cache (id, ord, title, text, punishment, forum_url, hash, updated_at)
     VALUES (@id, @order, @title, @text, @punishment, @forumUrl, @hash, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       ord = excluded.ord, title = excluded.title, text = excluded.text,
       punishment = excluded.punishment, forum_url = excluded.forum_url,
       hash = excluded.hash, updated_at = excluded.updated_at`
  );
  const tx = getDb().transaction((list: LawItem[]) => {
    for (const it of list) stmt.run({ ...it, punishment: it.punishment ?? null, forumUrl: it.forumUrl ?? null });
  });
  tx(items);
}

export function getLawItems(): LawItem[] {
  const rows = getDb().prepare('SELECT * FROM laws_cache ORDER BY ord').all() as Array<{
    id: string;
    ord: number;
    title: string;
    text: string;
    punishment: string | null;
    forum_url: string | null;
    hash: string;
    updated_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    order: r.ord,
    title: r.title,
    text: r.text,
    punishment: r.punishment ?? undefined,
    forumUrl: r.forum_url ?? undefined,
    hash: r.hash,
    updatedAt: r.updated_at
  }));
}

export function getLawIds(): Set<string> {
  const rows = getDb().prepare('SELECT id FROM laws_cache').all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

export function deleteLawsByIds(ids: string[]): void {
  const stmt = getDb().prepare('DELETE FROM laws_cache WHERE id = ?');
  const tx = getDb().transaction((list: string[]) => {
    for (const id of list) stmt.run(id);
  });
  tx(ids);
}

export function insertChanges(changes: RuleChange[]): void {
  const stmt = getDb().prepare(
    `INSERT OR IGNORE INTO rule_changes (id, entity, entity_id, kind, old_text, new_text, created_at, is_read, forum_url)
     VALUES (@id, @entity, @entityId, @kind, @oldText, @newText, @createdAt, @isRead, @forumUrl)`
  );
  const tx = getDb().transaction((list: RuleChange[]) => {
    for (const c of list) {
      stmt.run({
        id: c.id,
        entity: c.entity,
        entityId: c.entityId,
        kind: c.kind,
        oldText: c.oldText ?? null,
        newText: c.newText ?? null,
        createdAt: c.createdAt,
        isRead: c.isRead ? 1 : 0,
        forumUrl: c.forumUrl ?? null
      });
    }
  });
  tx(changes);
}

export function getChanges(unreadOnly?: boolean): RuleChange[] {
  const sql = unreadOnly
    ? 'SELECT * FROM rule_changes WHERE is_read = 0 ORDER BY created_at DESC'
    : 'SELECT * FROM rule_changes ORDER BY created_at DESC LIMIT 200';
  const rows = getDb().prepare(sql).all() as Array<{
    id: string;
    entity: string;
    entity_id: string;
    kind: string;
    old_text: string | null;
    new_text: string | null;
    created_at: number;
    is_read: number;
    forum_url: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    entity: r.entity as RuleChange['entity'],
    entityId: r.entity_id,
    kind: r.kind as RuleChange['kind'],
    oldText: r.old_text ?? undefined,
    newText: r.new_text ?? undefined,
    createdAt: r.created_at,
    isRead: !!r.is_read,
    forumUrl: r.forum_url ?? undefined
  }));
}

export function markChangesRead(ids: string[]): void {
  const stmt = getDb().prepare('UPDATE rule_changes SET is_read = 1 WHERE id = ?');
  const tx = getDb().transaction((list: string[]) => {
    for (const id of list) stmt.run(id);
  });
  tx(ids);
}

export function countUnreadChanges(): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS c FROM rule_changes WHERE is_read = 0')
    .get() as { c: number };
  return row.c;
}

// ---------------------------------------------------------------------------
// AI history & usage
// ---------------------------------------------------------------------------

export function insertAiHistory(item: {
  model: string;
  mode: string;
  prompt: string;
  answer: string;
  latencyMs: number;
}): number {
  const info = getDb()
    .prepare(
      'INSERT INTO ai_history (created_at, model, mode, prompt, answer, rating, latency_ms) VALUES (?, ?, ?, ?, ?, 0, ?)'
    )
    .run(Date.now(), item.model, item.mode, item.prompt, item.answer, item.latencyMs);
  trimAiHistory();
  return Number(info.lastInsertRowid);
}

function trimAiHistory(): void {
  getDb().prepare(
    `DELETE FROM ai_history WHERE id NOT IN (
       SELECT id FROM ai_history ORDER BY created_at DESC LIMIT ?
     )`
  ).run(500);
}

export function getAiHistory(query: { search?: string; limit?: number; offset?: number }): AiHistoryItem[] {
  const limit = Math.min(query.limit ?? 50, 200);
  const offset = query.offset ?? 0;
  if (query.search) {
    const like = `%${query.search}%`;
    return getDb()
      .prepare(
        'SELECT * FROM ai_history WHERE prompt LIKE ? OR answer LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      .all(like, like, limit, offset) as AiHistoryItem[];
  }
  return getDb()
    .prepare('SELECT * FROM ai_history ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as AiHistoryItem[];
}

export function deleteAiHistory(id: number): void {
  getDb().prepare('DELETE FROM ai_history WHERE id = ?').run(id);
}

export function rateAiHistory(id: number, rating: -1 | 1): void {
  getDb().prepare('UPDATE ai_history SET rating = ? WHERE id = ?').run(rating, id);
}

export function clearAiHistory(): void {
  getDb().prepare('DELETE FROM ai_history').run();
}

export function incrementUsage(): void {
  const day = new Date().toISOString().slice(0, 10);
  getDb()
    .prepare(
      `INSERT INTO usage_stats (day, count) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET count = count + 1`
    )
    .run(day);
}

export function getUsageStats(): { today: number; total: number } {
  const day = new Date().toISOString().slice(0, 10);
  const today = getDb().prepare('SELECT count FROM usage_stats WHERE day = ?').get(day) as
    | { count: number }
    | undefined;
  const total = getDb().prepare('SELECT COALESCE(SUM(count), 0) AS t FROM usage_stats').get() as {
    t: number;
  };
  return { today: today?.count ?? 0, total: total.t };
}

// ---------------------------------------------------------------------------
// Knowledge base metadata
// ---------------------------------------------------------------------------

export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM kb_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO kb_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value);
}
