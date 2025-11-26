import { patients, users } from '@src/db/schema';
import { authenticate } from '@src/plugins/auth';
import { eq } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';

const profileRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/profile',
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

      const response = await fastify.db
        .select({
          id: users.id,
          firebaseUid: users.firebaseUid,
          email: users.email,
          cpf: users.cpf,
          name: users.name,
          didAgreeToLGPD: users.didAgreeToLGPD,
          cellphone: users.cellphone,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          patient: {
            id: patients.id,
            street: patients.street,
            city: patients.city,
            state: patients.state,
            zipCode: patients.zipCode,
            dateOfBirth: patients.dateOfBirth,
            createdAt: patients.createdAt,
            updatedAt: patients.updatedAt,
          },
        })
        .from(users)
        .leftJoin(patients, eq(patients.userId, users.id))
        .where(eq(users.firebaseUid, firebaseUid))
        .limit(1);

      const [userWithPatient] = response;

      if (!userWithPatient) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'User not found in database',
        });
      }

      return userWithPatient;
    }
  );
};

export default profileRoute;
