import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      ord INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      text TEXT NOT NULL,
      punishment TEXT,
      notes TEXT,
      forum_url TEXT,
      forum_topic_id TEXT,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS laws (
      id TEXT PRIMARY KEY,
      ord INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      punishment TEXT,
      forum_url TEXT,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS rule_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      ver INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      changed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS changes (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      old_json TEXT,
      new_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL,
      fetched INTEGER DEFAULT 0,
      added INTEGER DEFAULT 0,
      updated INTEGER DEFAULT 0,
      removed INTEGER DEFAULT 0,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS app_releases (
      version TEXT PRIMARY KEY,
      channel TEXT NOT NULL DEFAULT 'stable',
      url TEXT NOT NULL,
      sha512 TEXT,
      notes TEXT,
      mandatory INTEGER DEFAULT 0,
      published_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_codes (
      code TEXT PRIMARY KEY,
      tg_chat_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      tg_chat_id INTEGER NOT NULL,
      nickname TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS discord_auth_states (
      state TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      discord_user TEXT,
      nickname TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voice_usage (
      ip_hash TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ip_hash, day)
    );
    CREATE TABLE IF NOT EXISTS http_cache (
      url TEXT PRIMARY KEY,
      etag TEXT,
      last_modified TEXT,
      fetched_at INTEGER NOT NULL,
      body TEXT
    );
  `);
  // Never keep development fixtures in a production cache.
  d.prepare("DELETE FROM changes WHERE entity_id GLOB 'R-DEM-*' OR id LIKE 'demo:%'").run();
  d.prepare("DELETE FROM rules WHERE id GLOB 'R-DEM-*' OR section = 'demo' OR text LIKE 'ДЕМО-ДАНІ:%'").run();
}

export function row<T>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function rows<T>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: unknown[]): void {
  getDb().prepare(sql).run(...params);
}
