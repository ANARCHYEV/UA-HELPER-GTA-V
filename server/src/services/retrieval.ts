import { rows } from '../db/db';

/**
 * BM25 retrieval over rules & laws for the AI pipeline.
 * The same algorithm runs client-side for offline use.
 */

interface KbDoc {
  id: string;
  kind: 'rule' | 'law';
  entity_id: string;
  title: string;
  text: string;
  punishment: string | null;
}

interface IndexedDoc {
  doc: KbDoc;
  terms: string[];
  tf: Map<string, number>;
  length: number;
}

const K1 = 1.5;
const B = 0.75;

let cache: { docs: IndexedDoc[]; df: Map<string, number>; avgLen: number; builtAt: number } | null =
  null;
const CACHE_TTL = 5 * 60 * 1000;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1);
}

function buildIndex(): void {
  const ruleRows = rows<{ id: string; title: string; text: string; punishment: string | null; section: string }>(
    'SELECT id, title, text, punishment, section FROM rules WHERE deleted_at IS NULL'
  );
  const lawRows = rows<{ id: string; title: string; text: string; punishment: string | null }>(
    'SELECT id, title, text, punishment FROM laws WHERE deleted_at IS NULL'
  );

  const docs: IndexedDoc[] = [];
  const push = (doc: KbDoc, raw: string): void => {
    const terms = tokenize(`${doc.title} ${raw}`);
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    docs.push({ doc, terms, tf, length: terms.length || 1 });
  };

  for (const r of ruleRows) {
    push(
      { id: r.id, kind: 'rule', entity_id: r.id, title: r.title ?? r.id, text: r.text, punishment: r.punishment },
      r.text
    );
  }
  for (const l of lawRows) {
    push({ id: l.id, kind: 'law', entity_id: l.id, title: l.title, text: l.text, punishment: l.punishment }, l.text);
  }

  const df = new Map<string, number>();
  for (const d of docs) {
    for (const term of new Set(d.terms)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / (docs.length || 1);
  cache = { docs, df, avgLen, builtAt: Date.now() };
}

export interface SearchResultItem {
  id: string;
  kind: 'rule' | 'law';
  title: string;
  text: string;
  punishment?: string;
  score: number;
}

export function searchRules(query: string, limit = 10): SearchResultItem[] {
  if (!cache || Date.now() - cache.builtAt > CACHE_TTL) buildIndex();
  const index = cache as NonNullable<typeof cache>;
  const qTerms = tokenize(query);
  if (qTerms.length === 0 || index.docs.length === 0) return [];

  const N = index.docs.length;
  const scores = new Map<number, number>();
  for (const qt of qTerms) {
    const df = index.df.get(qt) ?? 0;
    if (df === 0) continue;
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    for (let i = 0; i < index.docs.length; i++) {
      const d = index.docs[i];
      const tf = d.tf.get(qt) ?? 0;
      if (tf === 0) continue;
      const norm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (d.length / index.avgLen)));
      scores.set(i, (scores.get(i) ?? 0) + idf * norm);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([i, score]) => {
      const d = index.docs[i];
      return {
        id: d.doc.id,
        kind: d.doc.kind,
        title: d.doc.title,
        text: d.doc.text,
        punishment: d.doc.punishment ?? undefined,
        score
      };
    });
}

/** Called by the sync worker after new content lands in the DB. */
export function invalidateSearchCache(): void {
  cache = null;
}
