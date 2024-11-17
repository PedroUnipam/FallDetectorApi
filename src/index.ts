import 'dotenv/config';

import env from '@fastify/env';
import healthRoute from '@src/routes/health';
import profileRoute from '@src/routes/profile';
import Fastify from 'fastify';

interface EnvConfig {
  PORT: string;
  HOST: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: EnvConfig;
  }
}

const schema = {
  type: 'object',
  required: ['PORT', 'HOST'],
  properties: {
    PORT: {
      type: 'string',
      default: '3000',
    },
    HOST: {
      type: 'string',
      default: '0.0.0.0',
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

  // Register routes
  await fastify.register(healthRoute);
  await fastify.register(profileRoute);

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
