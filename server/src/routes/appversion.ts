import type { FastifyInstance } from 'fastify';
import { rows } from '../db/db';
import { config } from '../config';

/**
 * GET /v1/app/version?current=1.0.0
 * Simple update metadata for the client UI; the actual electron-updater feed
 * (latest.yml + installer) is served from the static /downloads/ directory
 * by nginx - see deploy/nginx.conf and scripts/gen-latest-yml.ts.
 */
export function registerAppVersion(app: FastifyInstance): void {
  app.get<{ Querystring: { current?: string } }>('/v1/app/version', async (req) => {
    const latest = rows<{
      version: string;
      url: string;
      notes: string | null;
      mandatory: number;
      published_at: number;
    }>(
      "SELECT version, url, notes, mandatory, published_at FROM app_releases WHERE channel = 'stable' ORDER BY published_at DESC LIMIT 1"
    )[0];

    const current = req.query.current ?? '';
    const updateAvailable = !!latest && latest.version !== current;

    return {
      current,
      latest: latest?.version ?? null,
      updateAvailable,
      url: latest?.url ?? null,
      notes: latest?.notes ?? null,
      mandatory: latest?.mandatory === 1,
      publishedAt: latest?.published_at ?? null,
      downloadsBaseUrl: config.downloadsPublicUrl
    };
  });

  // list of published versions (for changelog UI)
  app.get('/v1/app/releases', async () => {
    const releases = rows(
      "SELECT version, notes, published_at FROM app_releases WHERE channel = 'stable' ORDER BY published_at DESC LIMIT 20"
    );
    return { releases };
  });
}
