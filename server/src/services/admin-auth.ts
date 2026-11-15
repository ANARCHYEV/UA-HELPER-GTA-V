import { timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';

function tokenFromRequest(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (typeof authorization === 'string' && /^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }
  const explicit = request.headers['x-admin-token'];
  return typeof explicit === 'string' ? explicit.trim() : '';
}

/** Guards operational endpoints; disabled by default until ADMIN_TOKEN is set. */
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.adminToken) {
    reply.code(503).send({ error: 'admin endpoint is disabled' });
    return false;
  }
  const provided = tokenFromRequest(request);
  const expected = config.adminToken;
  const valid = provided.length === expected.length
    && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!valid) {
    reply.code(401).send({ error: 'admin authorization required' });
    return false;
  }
  return true;
}
