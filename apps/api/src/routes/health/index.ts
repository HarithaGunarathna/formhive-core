import type { FastifyInstance } from 'fastify';
import { db } from '../../lib/db';
import { redis } from '../../lib/redis';
import { sql } from 'drizzle-orm';

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/db', async (_request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return reply.send({ status: 'ok' });
    } catch (err) {
      app.log.error(err);
      return reply.status(503).send({ status: 'error', message: 'Database unreachable' });
    }
  });

  app.get('/redis', async (_request, reply) => {
    try {
      const pong = await redis.ping();
      return reply.send({ status: 'ok', response: pong });
    } catch (err) {
      app.log.error(err);
      return reply.status(503).send({ status: 'error', message: 'Redis unreachable' });
    }
  });
}
