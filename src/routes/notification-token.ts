import { users } from '@src/db/schema';
import { authenticate } from '@src/plugins/auth';
import { eq } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';

interface UpdateNotificationTokenBody {
  token: string;
}

const notificationTokenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: UpdateNotificationTokenBody }>(
    '/notification-token',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: {
              type: 'string',
            },
          },
        },
      },
    },
    async (request, reply) => {
      const firebaseUid = request.user?.uid;

      if (!firebaseUid) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User UID not found in token',
        });
      }

      const { token } = request.body;

      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Token is required and must be a non-empty string',
        });
      }

      // Find user by Firebase UID
      const [existingUser] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, firebaseUid))
        .limit(1);

      if (!existingUser) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'User not found in database',
        });
      }

      // Update user with the notification token
      await fastify.db
        .update(users)
        .set({
          expoNotificationToken: token.trim(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id));

      return reply.code(200).send({
        success: true,
        message: 'Notification token updated successfully',
      });
    }
  );
};

export default notificationTokenRoute;

