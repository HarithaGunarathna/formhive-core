import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireJwt(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  await request.jwtVerify();
}
