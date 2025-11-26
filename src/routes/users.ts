import { users } from '@src/db/schema';
import { authenticate } from '@src/plugins/auth';
import { eq } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';

const usersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { email: string } }>(
    '/users/email/:email',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { email } = request.params;

      const user = await fastify.db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (user.length === 0) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'User with this email does not exist',
        });
      }

      return user[0];
    }
  );
};

export default usersRoute;

