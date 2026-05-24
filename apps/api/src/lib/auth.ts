// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireJwt(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  await request.jwtVerify();
}
