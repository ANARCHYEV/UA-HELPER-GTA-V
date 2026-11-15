import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { getDb } from '../db/db';
import { config } from '../config';
import { logger } from './logger';

export interface ParsedItem {
  id: string;
  order: number;
  title: string;
  text: string;
  punishment: string;
  notes: string;
  forumUrl: string;
  hash: string;
}

export interface ParsedSection { items: ParsedItem[]; fetchedAt: number; }
export interface ParsedForumSection extends ParsedSection {
  id: string;
  title: string;
  /** A partial crawl may add new rules but must never delete existing ones. */
  complete: boolean;
  skippedThreads: string[];
}

const UA = 'UAHelperBot/1.0 (rules synchronizer; contact the UA Helper operator)';
const ROBOTS_TTL = 24 * 60 * 60 * 1000;
const robotsCache = new Map<string, { fetchedAt: number; disallow: string[] }>();
const MAX_FORUM_PAGES = 30;
const MAX_THREAD_PAGES = 150;
const MAX_SNAPSHOT_PAGES = 300;
const MAX_SNAPSHOT_PAGE_BYTES = 2 * 1024 * 1024;
const OFFICIAL_FORUM_ORIGIN = 'https://forum.ukraine-gta5.com.ua';

class CrawlerError extends Error {
  constructor(public code: 'robots' | 'antiddos' | 'http' | 'invalid', message: string) {
    super(message);
    this.name = 'CrawlerError';
  }
}

interface HttpCacheRow { url: string; etag: string | null; last_modified: string | null; body: string; }
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return ''; }
}

function networkErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return cause?.code ? `${cause.code}: ${cause.message ?? error.message}` : error.message;
}

function absoluteUrl(href: string | undefined, base: string): string | null {
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return null;
  try {
    const url = new URL(href, base);
    url.hash = '';
    return url.origin === originOf(base) ? url.toString() : null;
  } catch { return null; }
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

/**
 * Offline imports deliberately accept only public topic/forum pages from the
 * official rules forum. They never perform a network request or browser
 * automation; the operator supplies pages that were saved manually.
 */
function assertOfficialForumUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CrawlerError('invalid', `Некоректна адреса у snapshot: ${value}`);
  }
  if (url.origin !== OFFICIAL_FORUM_ORIGIN || !/^\/(?:forums|threads)\//.test(url.pathname)) {
    throw new CrawlerError('invalid', 'Snapshot дозволяє лише публічні сторінки правил Ukraine GTA 5.');
  }
  return canonicalUrl(value);
}

async function robotsDisallow(url: string): Promise<string[]> {
  const origin = originOf(url);
  if (!origin) return [''];
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL) return cached.disallow;
  try {
    const response = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    const text = response.ok ? await response.text() : '';
    const disallow: string[] = [];
    let applies = false;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (/^user-agent:/i.test(line)) applies = /^user-agent:\s*(\*|uahelperbot)/i.test(line);
      else if (applies && /^disallow:/i.test(line)) disallow.push(line.replace(/^disallow:/i, '').trim());
    }
    robotsCache.set(origin, { fetchedAt: Date.now(), disallow });
    return disallow;
  } catch {
    robotsCache.set(origin, { fetchedAt: Date.now(), disallow: [] });
    return [];
  }
}

function readCache(url: string): HttpCacheRow | undefined {
  return getDb().prepare('SELECT * FROM http_cache WHERE url = ?').get(url) as HttpCacheRow | undefined;
}

function writeCache(url: string, etag: string | null, lastModified: string | null, body: string): void {
  getDb().prepare(
    `INSERT INTO http_cache (url, etag, last_modified, fetched_at, body) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET etag = excluded.etag, last_modified = excluded.last_modified,
     fetched_at = excluded.fetched_at, body = excluded.body`
  ).run(url, etag, lastModified, Date.now(), body);
}

/** Fetches politely and always returns a body; a 304 reuses the stored body. */
export async function politeFetch(url: string): Promise<string> {
  const parsed = new URL(url);
  const disallow = await robotsDisallow(url);
  if (disallow.some((path) => path && parsed.pathname.startsWith(path))) {
    throw new CrawlerError('robots', `robots.txt забороняє завантаження ${parsed.pathname}`);
  }
  const cached = readCache(url);
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.5'
  };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  if (cached?.last_modified) headers['If-Modified-Since'] = cached.last_modified;

  await sleep(config.crawlerDelayMs);
  let response: Response;
  try {
    response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  } catch (error) {
    throw new CrawlerError('http', `Не вдалося завантажити форум: ${networkErrorMessage(error)}`);
  }
  if (response.status === 304 && cached?.body) return cached.body;
  const body = await response.text();
  const challenged = response.headers.get('cf-mitigated') === 'challenge'
    || /<title>\s*(just a moment|attention required)/i.test(body)
    || /challenge-platform|cf-chl-/i.test(body);
  if (challenged) {
    throw new CrawlerError('antiddos', 'Форум повернув Cloudflare challenge. Налаштуйте allowlist для IP сервера або офіційний API/експорт; старі дані збережено.');
  }
  if (!response.ok) throw new CrawlerError('http', `HTTP ${response.status} for ${url}`);
  writeCache(url, response.headers.get('etag'), response.headers.get('last-modified'), body);
  return body;
}

function normalize(text: string): string { return text.replace(/[\u00a0\u200b]/g, ' ').replace(/[ \t]+/g, ' ').trim(); }
function hashItem(id: string, text: string, punishment: string, notes: string, title: string): string {
  return createHash('sha1')
    .update([id, normalize(title), normalize(text), normalize(punishment), normalize(notes)].join('|'))
    .digest('hex')
    .slice(0, 12);
}
function stablePart(url: string): string {
  const match = new URL(url).pathname.match(/\.(\d+)\/?$/);
  return match?.[1] ?? createHash('sha1').update(url).digest('hex').slice(0, 8);
}

interface DraftItem {
  id: string;
  order: number;
  title: string;
  text: string[];
  notes: string[];
}

function isChapterHeading(number: string, text: string): boolean {
  if (number.includes('.') || text.length > 115 || text.includes('|')) return false;
  return !/^(заборон|дозвол|гравець|адміністрац|кожен|потрібно|має|повинен|не можна)/i.test(text);
}

function isChromeLine(text: string): boolean {
  return /^(?:image:|натисніть, щоби розкрити|спойлер|переглянути вкладення)/i.test(text);
}

function isNoteLine(text: string): boolean {
  return /^(?:примітка|виняток|приклад|пояснення|додаток|важливо)\s*:/i.test(text);
}

function extractPunishment(raw: string): { text: string; punishment: string } {
  const pipe = raw.lastIndexOf('|');
  if (pipe > 0) {
    const punishment = normalize(raw.slice(pipe + 1));
    if (punishment.length >= 3) return { text: normalize(raw.slice(0, pipe)), punishment };
  }
  const match = raw.match(/(?:покарання|наказание|наказання|санкція)\s*:?\s*(.+)$/i);
  if (!match) return { text: normalize(raw), punishment: '' };
  return {
    text: normalize(raw.slice(0, match.index)),
    punishment: normalize(match[1])
  };
}

/** Parses the first (official) post of a XenForo rules topic. */
export function parseThread(html: string, url: string, prefix: string): ParsedItem[] {
  const $ = cheerio.load(html);
  const threadTitle = normalize($('h1.p-title-value').first().clone().children().remove().end().text()) || 'Правила';
  const body = $('.message--post .message-body .bbWrapper').first();
  if (!body.length) return [];
  body.find('br').replaceWith('\n');
  body.find('p, li, div').each((_index, element) => { $(element).prepend('\n').append('\n'); });
  const lines = body.text().split(/\n+/).map(normalize).filter(Boolean);
  const items: ParsedItem[] = [];
  const seen = new Set<string>();
  const threadPart = stablePart(url);
  const numbered = /^(\d{1,3}(?:\.\d{1,3}){0,3})[.)]?\s+(.{8,})$/;
  let currentTitle = threadTitle;
  let draft: DraftItem | null = null;

  const flush = (): void => {
    if (!draft) return;
    const { text, punishment } = extractPunishment(draft.text.join(' '));
    const notes = normalize(draft.notes.join(' '));
    if (text.length >= 3) {
      items.push({
        id: draft.id,
        order: draft.order,
        title: draft.title,
        text,
        punishment,
        notes,
        forumUrl: url,
        hash: hashItem(draft.id, text, punishment, notes, draft.title)
      });
    }
    draft = null;
  };

  for (const line of lines) {
    const match = line.match(numbered);
    if (match) {
      const number = match[1];
      const raw = normalize(match[2]);
      if (isChapterHeading(number, raw)) {
        flush();
        currentTitle = raw;
        continue;
      }
      flush();
      const id = `${prefix}-${threadPart}-${number.replace(/\./g, '-')}`;
      if (seen.has(id)) continue;
      seen.add(id);
      draft = { id, order: items.length, title: currentTitle, text: [raw], notes: [] };
      continue;
    }

    if (!draft || isChromeLine(line)) continue;
    if (isNoteLine(line)) draft.notes.push(line);
    else draft.text.push(line);
  }
  flush();
  return items;
}

type PageLoader = (url: string) => Promise<string>;

/** Crawls XenForo child forums, pagination and every visible thread. */
async function crawlForum(
  rootUrl: string,
  prefix: string,
  loadPage: PageLoader
): Promise<ParsedForumSection[]> {
  if (!rootUrl) return [];
  const forumQueue = [rootUrl];
  const seenForums = new Set<string>();
  const threads = new Map<string, { title: string; sectionId: string; sectionTitle: string }>();

  while (forumQueue.length && seenForums.size < MAX_FORUM_PAGES) {
    const url = forumQueue.shift() as string;
    if (seenForums.has(url)) continue;
    seenForums.add(url);
    const html = await loadPage(url);
    const $ = cheerio.load(html);
    const pageTitle = normalize($('h1.p-title-value').first().text()) || 'Правила проєкту';
    const sectionId = `forum-${stablePart(url)}`;

    $('.structItem--thread .structItem-title a[href*="/threads/"]').each((_i, element) => {
      const threadUrl = absoluteUrl($(element).attr('href'), url);
      if (threadUrl && threads.size < MAX_THREAD_PAGES) threads.set(threadUrl, { title: normalize($(element).text()), sectionId, sectionTitle: pageTitle });
    });
    $('.node--forum .node-title a[href*="/forums/"]').each((_i, element) => {
      const child = absoluteUrl($(element).attr('href'), url);
      if (child && !seenForums.has(child) && forumQueue.length + seenForums.size < MAX_FORUM_PAGES) forumQueue.push(child);
    });
    const next = absoluteUrl($('a.pageNav-jump--next').attr('href'), url);
    if (next && !seenForums.has(next)) forumQueue.push(next);
  }

  if (threads.size === 0) throw new CrawlerError('invalid', 'XenForo: у вказаному розділі не знайдено тем із правилами; старі дані збережено.');
  const sections = new Map<string, ParsedForumSection>();
  for (const [url, meta] of threads) {
    const html = await loadPage(url);
    const items = parseThread(html, url, prefix);
    const section = sections.get(meta.sectionId) ?? {
      id: meta.sectionId,
      title: meta.sectionTitle,
      items: [],
      fetchedAt: Date.now(),
      complete: true,
      skippedThreads: []
    };
    if (!items.length) {
      section.complete = false;
      section.skippedThreads.push(url);
      sections.set(meta.sectionId, section);
      continue;
    }
    const offset = section.items.length;
    section.items.push(...items.map((item, index) => ({ ...item, order: offset + index, title: item.title || meta.title })));
    sections.set(meta.sectionId, section);
  }
  const result = [...sections.values()].filter((section) => section.items.length > 0);
  if (!result.length) throw new CrawlerError('invalid', 'Теми знайдено, але жодного нумерованого пункту не розпізнано; старі дані збережено.');
  logger.info('crawler: xenforo crawl completed', {
    forums: seenForums.size,
    threads: threads.size,
    sections: result.length,
    items: result.reduce((sum, section) => sum + section.items.length, 0),
    skippedThreads: result.reduce((sum, section) => sum + section.skippedThreads.length, 0)
  });
  return result;
}

/** Crawls the public forum with polite, robots-aware HTTP requests. */
export async function crawlXenForoRules(rootUrl: string, prefix = 'R'): Promise<ParsedForumSection[]> {
  return crawlForum(rootUrl, prefix, politeFetch);
}

export interface ForumSnapshotPage {
  url: string;
  html: string;
}

/**
 * Parses an operator-provided snapshot with zero network activity. This is the
 * supported path when a server cannot resolve the forum or is challenged.
 */
export async function crawlForumSnapshot(
  rootUrl: string,
  prefix: string,
  pages: ForumSnapshotPage[]
): Promise<ParsedForumSection[]> {
  const root = assertOfficialForumUrl(rootUrl);
  if (!root.includes('/forums/')) {
    throw new CrawlerError('invalid', 'Коренева сторінка snapshot має бути розділом форуму, а не темою.');
  }
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_SNAPSHOT_PAGES) {
    throw new CrawlerError('invalid', `Snapshot має містити від 1 до ${MAX_SNAPSHOT_PAGES} сторінок.`);
  }

  const byUrl = new Map<string, string>();
  for (const page of pages) {
    if (!page || typeof page.url !== 'string' || typeof page.html !== 'string') {
      throw new CrawlerError('invalid', 'Кожна сторінка snapshot повинна містити url і html.');
    }
    const url = assertOfficialForumUrl(page.url);
    if (Buffer.byteLength(page.html, 'utf8') > MAX_SNAPSHOT_PAGE_BYTES) {
      throw new CrawlerError('invalid', `Сторінка snapshot завелика: ${url}`);
    }
    byUrl.set(url, page.html);
  }
  if (!byUrl.has(root)) {
    throw new CrawlerError('invalid', 'У snapshot відсутня коренева сторінка розділу.');
  }

  return crawlForum(root, prefix, async (requestedUrl) => {
    const requested = assertOfficialForumUrl(requestedUrl);
    const html = byUrl.get(requested);
    if (html === undefined) {
      throw new CrawlerError('invalid', `Snapshot неповний: відсутня сторінка ${requested}`);
    }
    return html;
  });
}

/** Single-page compatibility helper used for an explicitly configured laws topic. */
export async function parseRuleSection(url: string, sectionPrefix: string): Promise<ParsedSection> {
  if (!url) return { items: [], fetchedAt: Date.now() };
  const html = await politeFetch(url);
  const items = parseThread(html, url, sectionPrefix);
  if (!items.length) throw new CrawlerError('invalid', 'У темі не знайдено нумерованих правил; старі дані збережено.');
  return { items, fetchedAt: Date.now() };
}
