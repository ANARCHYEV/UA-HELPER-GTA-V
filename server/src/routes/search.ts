import type { FastifyInstance } from 'fastify';
import { rows } from '../db/db';
import { searchRules } from '../services/retrieval';

/** BM25 search endpoint (rules + laws). */
export function registerSearch(app: FastifyInstance): void {
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/v1/search',
    async (req, reply) => {
      const q = (req.query.q ?? '').trim();
      if (!q) return reply.code(400).send({ error: 'missing query param: q' });
      const limit = Math.min(Number(req.query.limit ?? 10) || 10, 50);
      return { query: q, results: searchRules(q, limit) };
    }
  );

  app.get('/v1/search/stats', async () => {
    const items = rows<{ c: number }>(
      'SELECT (SELECT COUNT(*) FROM rules WHERE deleted_at IS NULL) AS c'
    );
    return { indexedRules: items[0]?.c ?? 0 };
  });
}
