import { Router } from 'express';

/**
 * OpenAPI 3.1 spec for /api/openapi.json (TASK-141).
 *
 * Hand-curated rather than auto-generated — express-route enumeration via
 * `_router.stack` is fragile across versions. The cost is keeping this in
 * sync; the benefit is a stable, reviewable schema. Swagger UI (TASK-142)
 * mounts this spec at /docs.
 */
const SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Hermeschain API',
    version: '0.3.0',
    description: 'Public REST API for Hermeschain.',
  },
  servers: [{ url: 'https://hermeschain.io' }],
  paths: {
    '/api/status': {
      get: {
        summary: 'Snapshot of chain + service status',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/api/blocks/{height}': {
      get: {
        summary: 'Get a block by height',
        parameters: [{ name: 'height', in: 'path', required: true, schema: { type: 'integer' } },
                     { name: 'include', in: 'query', required: false, schema: { type: 'string', enum: ['receipts'] } }],
        responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } },
      },
    },
    '/api/blocks/search': {
      get: {
        summary: 'Search blocks by height range + producer (TASK-153)',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'integer' } },
          { name: 'to', in: 'query', schema: { type: 'integer' } },
          { name: 'producer', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/api/tx/{hash}': {
      get: {
        summary: 'Get a transaction by hash (with optional decoded logs)',
        parameters: [{ name: 'hash', in: 'path', required: true, schema: { type: 'string' } },
                     { name: 'decodeLogs', in: 'query', schema: { type: 'boolean' } }],
        responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } },
      },
    },
    '/api/account/{addr}': {
      get: { summary: 'Get account balance + nonce', responses: { '200': { description: 'OK' } } },
    },
    '/api/account/{addr}/next-nonce': {
      get: { summary: 'Suggested next nonce (TASK-057)', responses: { '200': { description: 'OK' } } },
    },
    '/api/transactions': {
      post: { summary: 'Submit a signed tx (TASK-170 idempotent on hash)', responses: { '200': { description: 'OK' }, '400': { description: 'Invalid' } } },
    },
    '/api/mempool': { get: { summary: 'Pending txs (TASK-166)', responses: { '200': { description: 'OK' } } } },
    '/api/mempool/{hash}': { get: { summary: 'Single pending tx (TASK-167)', responses: { '200': { description: 'OK' }, '404': { description: 'Not in mempool' } } } },
    '/api/chain/tps': { get: { summary: 'TPS over a window (TASK-051)', responses: { '200': { description: 'OK' } } } },
    '/api/wallet/validate/{input}': { get: { summary: 'Address validity (TASK-137)', responses: { '200': { description: 'OK' } } } },
    '/api/mesh/peers': { get: { summary: 'Active peer list', responses: { '200': { description: 'OK' } } } },
    '/api/mesh/head': { get: { summary: 'Our chain head', responses: { '200': { description: 'OK' } } } },
    '/api/mesh/headers': { get: { summary: 'Header range fetch (TASK-003)', responses: { '200': { description: 'OK' } } } },
    '/api/mesh/blocks': { get: { summary: 'Bulk block fetch (TASK-004)', responses: { '200': { description: 'OK' } } } },
    '/api/mesh/announce': { post: { summary: 'Register/heartbeat as a peer', responses: { '200': { description: 'OK' } } } },
    '/api/mesh/block': { post: { summary: 'Gossip a block (TASK-002)', responses: { '200': { description: 'Accepted' }, '400': { description: 'Bad payload' }, '409': { description: 'Rejected' } } } },
    '/api/metrics': { get: { summary: 'Prometheus exposition (TASK-152)', responses: { '200': { description: 'OK' } } } },
    '/api/build': { get: { summary: 'Build info (TASK-150)', responses: { '200': { description: 'OK' } } } },
    '/api/newsletter': { post: { summary: 'Newsletter subscribe (TASK-486)', responses: { '200': { description: 'OK' }, '400': { description: 'Bad email' } } } },
    '/health/live': { get: { summary: 'Process up (TASK-149)', responses: { '200': { description: 'live' }, '503': { description: 'draining' } } } },
    '/health/ready': { get: { summary: 'Ready to serve (TASK-149)', responses: { '200': { description: 'ready' }, '503': { description: 'failures' } } } },
    '/health/deep': { get: { summary: 'Deep read-path probe (TASK-149)', responses: { '200': { description: 'ready' }, '503': { description: 'failures' } } } },
  },
};

export function createOpenApiRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => res.json(SPEC));
  return router;
}
