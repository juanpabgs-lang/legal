import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { getConfig } from '../config';
import { getDb } from '../db/client';
import { AppError } from '../lib/errors';
import { registerRoutes } from './routes';

export async function buildApp() {
  const cfg = getConfig();
  const app = Fastify({
    logger: cfg.NODE_ENV === 'test' ? false : { level: cfg.LOG_LEVEL },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: cfg.RATE_LIMIT_MAX, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Norfront API',
        description: 'Predictive client acquisition for law firms. Deep Swarm plugs in last.',
        version: '0.1.0',
      },
      tags: [
        { name: 'auth' },
        { name: 'firm' },
        { name: 'opportunities' },
        { name: 'records' },
        { name: 'pilot' },
        { name: 'admin' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((err, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({ error: 'bad_request', message: 'Request failed validation', details: err.validation });
    }
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
    }
    req.log.error({ err }, 'unhandled');
    return reply.code(500).send({ error: 'internal', message: 'Internal server error' });
  });

  app.decorate('db', getDb());
  await registerRoutes(app);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof getDb>;
  }
}
