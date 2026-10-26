import type { FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/client';
import { unauthorized } from '../lib/errors';
import { resolveBearer, type AuthedUser } from '../modules/auth/service';

export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const user = await resolveBearer(getDb(), req.headers.authorization);
  (req as FastifyRequest & { user: AuthedUser }).user = user;
}

export function getUser(req: FastifyRequest): AuthedUser {
  const user = (req as FastifyRequest & { user?: AuthedUser }).user;
  if (!user) throw unauthorized();
  return user;
}
