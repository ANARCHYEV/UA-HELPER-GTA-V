import { createHash } from 'crypto';
import {
  getRuleIds,
  getSections,
  upsertLaws,
  upsertRules,
  saveSections
} from './storage';
import { logger } from './logger';
import type {
  LawItem,
  RuleItem,
  RuleSection,
  WikiEntry,
  Territory,
  MasterlistServer,
  MarketPrice
} from '@shared/types';
import rulesSeedJson from '../knowledge/seed/uk/rules.json';
import lawsSeedJson from '../knowledge/seed/uk/laws.json';
import wikiSeedJson from '../knowledge/seed/uk/wiki.json';

/**
 * Seed knowledge base shipped with the app (inlined into the main bundle,
 * so it works in both dev and packaged builds).
 * Real content arrives from the forum via the server parser. The release seed
 * is intentionally empty so fabricated rules are never presented as official.
 */

interface RulesSeed {
  version: string;
  updatedAt: number;
  sections: RuleSection[];
  items: Array<Omit<RuleItem, 'hash' | 'updatedAt'> & { hash?: string }>;
}

interface LawsSeed {
  version: string;
  updatedAt: number;
  items: Array<Omit<LawItem, 'hash' | 'updatedAt'> & { hash?: string }>;
}

interface WikiSeed {
  entries: WikiEntry[];
  territories: Territory[];
  masterlist: MasterlistServer[];
  market: MarketPrice[];
}

const RULES_SEED = rulesSeedJson as unknown as RulesSeed;
const LAWS_SEED = lawsSeedJson as unknown as LawsSeed;

let wikiCache: WikiSeed | null = null;

export function clearWikiCache(): void {
  wikiCache = null;
}

export function loadWikiSeed(): WikiSeed {
  if (wikiCache) return wikiCache;
  wikiCache = wikiSeedJson as unknown as WikiSeed;
  return wikiCache;
}

function hashItem(id: string, text: string): string {
  return createHash('sha1').update(`${id}|${text}`).digest('hex').slice(0, 12);
}

/**
 * Copies a verified offline seed into the local cache when one is bundled.
 */
export function seedKnowledgeBase(force = false): void {
  const existing = getRuleIds();
  if (!force && existing.size > 0) return;

  try {
    saveSections(RULES_SEED.sections);
    upsertRules(
      RULES_SEED.items.map((it) => ({
        ...it,
        hash: hashItem(it.id, it.text),
        updatedAt: RULES_SEED.updatedAt
      }))
    );
    upsertLaws(
      LAWS_SEED.items.map((it) => ({
        ...it,
        hash: hashItem(it.id, it.text),
        updatedAt: LAWS_SEED.updatedAt
      }))
    );
    logger.info('knowledge: seeded', { rules: RULES_SEED.items.length, laws: LAWS_SEED.items.length });
  } catch (err) {
    logger.error('knowledge: seeding failed', err instanceof Error ? err.message : err);
  }
}

export function seedVersion(): string | null {
  return RULES_SEED.version;
}

export function currentSections(): RuleSection[] {
  return getSections();
}
