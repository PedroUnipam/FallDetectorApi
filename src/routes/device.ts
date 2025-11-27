import { users } from '@src/db/schema';
import { authenticate } from '@src/plugins/auth';
import { eq } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';

interface AddDeviceBody {
  device: string;
}

const deviceRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: AddDeviceBody }>(
    '/device',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['device'],
          properties: {
            device: {
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

      const { device } = request.body;

      if (!device || typeof device !== 'string' || device.trim().length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Device is required and must be a non-empty string',
        });
      }

      const deviceId = device.trim();

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

      // Check if device is already linked to another user
      const [deviceOwner] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.device, deviceId))
        .limit(1);

      if (deviceOwner && deviceOwner.id !== existingUser.id) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Device is already linked to another user',
        });
      }

      // Update user with the device
      await fastify.db
        .update(users)
        .set({
          device: deviceId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id));

      return reply.code(200).send({
        success: true,
        message: 'Device linked successfully',
        device: deviceId,
      });
    }
  );

  fastify.delete(
    '/device',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const firebaseUid = request.user?.uid;

      if (!firebaseUid) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User UID not found in token',
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

      // Check if user has a device linked
      if (!existingUser.device) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'No device linked to this user',
        });
      }

      // Unlink device from user
      await fastify.db
        .update(users)
        .set({
          device: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id));

      return reply.code(200).send({
        success: true,
        message: 'Device unlinked successfully',
      });
    }
  );
};

export default deviceRoute;

