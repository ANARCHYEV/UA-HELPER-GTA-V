import { readFile, stat } from 'fs/promises';
import { resolve } from 'path';
import { config } from '../config';
import { crawlForumSnapshot, type ForumSnapshotPage } from './forum-parser';
import { runSnapshotSync } from './sync-worker';

const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;

interface SnapshotSection {
  rootUrl: string;
  pages: ForumSnapshotPage[];
}

interface ForumSnapshot {
  version: 1;
  rules: SnapshotSection;
  laws?: SnapshotSection;
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

function asSnapshotSection(value: unknown, name: string, expectedRoot: string): SnapshotSection {
  if (!value || typeof value !== 'object') throw new Error(`Snapshot не містить секцію ${name}.`);
  const section = value as Partial<SnapshotSection>;
  if (typeof section.rootUrl !== 'string' || !Array.isArray(section.pages)) {
    throw new Error(`Секція ${name} має містити rootUrl і масив pages.`);
  }
  if (canonicalUrl(section.rootUrl) !== canonicalUrl(expectedRoot)) {
    throw new Error(`Snapshot ${name} не відповідає налаштованому офіційному розділу.`);
  }
  return { rootUrl: section.rootUrl, pages: section.pages };
}

/**
 * Imports a manually saved public forum snapshot. This code never opens a
 * browser and never requests the forum: every HTML page must be present in the
 * JSON file, so a partial export fails before it can change the database.
 */
export async function importForumSnapshot(snapshotPath: string) {
  const path = resolve(snapshotPath);
  const info = await stat(path);
  if (info.size > MAX_SNAPSHOT_BYTES) throw new Error('Snapshot перевищує ліміт 100 МБ.');

  let parsed: ForumSnapshot;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as ForumSnapshot;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Не вдалося прочитати JSON snapshot: ${detail}`);
  }
  if (parsed.version !== 1) throw new Error('Підтримується лише формат snapshot версії 1.');

  const rules = asSnapshotSection(parsed.rules, 'rules', config.forumRulesUrl);
  const laws = parsed.laws
    ? asSnapshotSection(parsed.laws, 'laws', config.forumLawsUrl)
    : undefined;
  const ruleSections = await crawlForumSnapshot(rules.rootUrl, 'R', rules.pages);
  const lawSections = laws ? await crawlForumSnapshot(laws.rootUrl, 'L', laws.pages) : null;
  return runSnapshotSync({ ruleSections, lawSections });
}
