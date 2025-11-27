import 'dotenv/config';

import cors from '@fastify/cors';
import env from '@fastify/env';
import { db } from '@src/lib/db';
import healthRoute from '@src/routes/health';
import patientCaregiversRoute from '@src/routes/patient-caregivers';
import profileRoute from '@src/routes/profile';
import registerRoute from '@src/routes/register';
import usersRoute from '@src/routes/users';
import Fastify from 'fastify';

interface EnvConfig {
  PORT: string;
  HOST: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: EnvConfig;
    db: typeof db;
  }
}

const schema = {
  type: 'object',
  required: ['PORT', 'HOST', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
  properties: {
    PORT: {
      type: 'string',
      default: '3000',
    },
    HOST: {
      type: 'string',
      default: '0.0.0.0',
    },
    TURSO_DATABASE_URL: {
      type: 'string',
    },
    TURSO_AUTH_TOKEN: {
      type: 'string',
    },
  },
};

const options = {
  confKey: 'config',
  schema,
  dotenv: true,
};

async function build() {
  const fastify = Fastify({
    logger: true,
  });

  await fastify.register(env, options);

  // Register CORS plugin - allow all origins and methods
  await fastify.register(cors, {
    origin: true,
  });

  // Initialize database connection
  // The db instance is already created and exported from @src/lib/db
  // This ensures the connection is established and env vars are validated
  fastify.log.info('Database connection initialized');

  // Register routes
  await fastify.register(healthRoute);
  await fastify.register(registerRoute);
  await fastify.register(profileRoute);
  await fastify.register(usersRoute);
  await fastify.register(patientCaregiversRoute);

  // Make db available on fastify instance
  fastify.decorate('db', db);

  return fastify;
}

async function start() {
  try {
    const fastify = await build();
    const port = parseInt(fastify.config.PORT, 10);
    const host = fastify.config.HOST;

    await fastify.listen({ port, host });
    fastify.log.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

void start();
