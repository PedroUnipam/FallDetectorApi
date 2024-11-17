import { authenticate } from '@src/plugins/auth';
import { FastifyPluginAsync } from 'fastify';

const profileRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/profile',
    {
      preHandler: [authenticate],
    },
    (request) => {
      return {
        uid: request.user?.uid,
        email: request.user?.email,
        user: request.user,
      };
    }
  );
};

export default profileRoute;
