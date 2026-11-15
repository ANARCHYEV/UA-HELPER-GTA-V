import { getLawItems, getRuleItems } from './storage';
import type { LawItem, SearchHit } from '@shared/types';

/**
 * Local BM25 search over the rules & laws cache.
 * Used by quick search, laws search and the AI retrieval pipeline (offline).
 * The server runs the same algorithm for its /v1/search endpoint.
 */

interface IndexedDoc {
  id: string;
  kind: 'rule' | 'law';
  title: string;
  text: string;
  sectionTitle?: string;
  punishment?: string;
  forumUrl?: string;
  terms: string[];
  termFreq: Map<string, number>;
  length: number;
}

interface IndexState {
  docs: IndexedDoc[];
  df: Map<string, number>;
  avgLen: number;
  builtAt: number;
}

const K1 = 1.5;
const B = 0.75;

let state: IndexState | null = null;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1);
}

function build(): IndexState {
  const docs: IndexedDoc[] = [];
  const rules = getRuleItems();
  const laws = getLawItems();

  const push = (
    kind: IndexedDoc['kind'],
    id: string,
    title: string,
    body: string,
    extra?: Partial<IndexedDoc>
  ) => {
    const terms = tokenize(`${id} ${title} ${body}`);
    const termFreq = new Map<string, number>();
    for (const t of terms) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    docs.push({
      id,
      kind,
      title,
      text: body,
      sectionTitle: extra?.sectionTitle,
      punishment: extra?.punishment,
      forumUrl: extra?.forumUrl,
      terms,
      termFreq,
      length: terms.length || 1
    });
  };

  const sectionTitles = new Map<string, string>();
  for (const r of rules) {
    if (!sectionTitles.has(r.sectionId)) sectionTitles.set(r.sectionId, r.sectionId);
    push('rule', r.id, r.title ?? `Правило ${r.id}`, `${r.text} ${r.notes ?? ''}`, {
      sectionTitle: r.sectionId,
      punishment: r.punishment,
      forumUrl: r.forumUrl
    });
  }
  for (const l of laws) {
    push('law', l.id, l.title, l.text, { punishment: l.punishment, forumUrl: l.forumUrl });
  }

  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc.terms)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const avgLen = docs.reduce((acc, d) => acc + d.length, 0) / (docs.length || 1);

  return { docs, df, avgLen, builtAt: Date.now() };
}

function ensureIndex(): IndexState {
  if (!state) state = build();
  return state;
}

/** Forces a rebuild after rules/laws sync. */
export function invalidateIndex(): void {
  state = null;
}

function bm25Search(query: string, topN: number, kind?: IndexedDoc['kind']): Array<{ doc: IndexedDoc; score: number }> {
  const index = ensureIndex();
  const qTerms = tokenize(query);
  if (qTerms.length === 0 || index.docs.length === 0) return [];

  const N = index.docs.length;
  const scores = new Map<number, number>();
  for (const qt of qTerms) {
    const df = index.df.get(qt) ?? 0;
    if (df === 0) continue;
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    for (let i = 0; i < index.docs.length; i++) {
      const doc = index.docs[i];
      if (kind && doc.kind !== kind) continue;
      const tf = doc.termFreq.get(qt) ?? 0;
      if (tf === 0) continue;
      const norm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (doc.length / index.avgLen)));
      scores.set(i, (scores.get(i) ?? 0) + idf * norm);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([i, score]) => ({ doc: index.docs[i], score }));
}

/** Quick search across rules + laws (renderer quick search UI). */
export function searchAll(query: string, limit = 20, kind?: IndexedDoc['kind']): SearchHit[] {
  if (!query.trim()) return [];
  return bm25Search(query, limit, kind).map(({ doc, score }) => ({
    kind: doc.kind,
    id: doc.id,
    title: doc.title,
    text: doc.text,
    sectionTitle: doc.sectionTitle,
    score
  }));
}

/** Laws-only search. */
export function searchLaws(query: string, limit = 20): LawItem[] {
  return bm25Search(query, limit, 'law')
    .map(({ doc }) => {
      const law = getLawItems().find((l) => l.id === doc.id) as LawItem | undefined;
      return (
        law ?? {
          id: doc.id,
          order: 0,
          title: doc.title,
          text: doc.text,
          punishment: doc.punishment,
          forumUrl: doc.forumUrl,
          hash: '',
          updatedAt: 0
        }
      );
    });
}

export interface RetrievedContext {
  id: string;
  kind: 'rule' | 'law';
  title: string;
  text: string;
  punishment?: string;
  score: number;
}

/**
 * Retrieval pipeline for AI: returns the top-N most relevant rule items
 * that will be injected into the system prompt. Nothing else is sent.
 */
export function retrieveForAi(prompt: string, topN: number): RetrievedContext[] {
  return bm25Search(prompt, topN).map(({ doc, score }) => ({
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    text: doc.text,
    punishment: doc.punishment,
    score
  }));
}
