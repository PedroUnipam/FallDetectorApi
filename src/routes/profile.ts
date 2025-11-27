import { patients, users } from '@src/db/schema';
import { authenticate } from '@src/plugins/auth';
import { eq } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';

interface PatientInfo {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  dateOfBirth: string; // ISO date string
}

interface UpdateProfileBody {
  name?: string;
  cellphone?: string;
  patient?: PatientInfo;
}

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
          device: users.device,
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

  fastify.put<{ Body: UpdateProfileBody }>(
    '/profile',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
            cellphone: {
              type: 'string',
            },
            patient: {
              type: 'object',
              properties: {
                street: {
                  type: 'string',
                },
                city: {
                  type: 'string',
                },
                state: {
                  type: 'string',
                },
                zipCode: {
                  type: 'string',
                },
                dateOfBirth: {
                  type: 'string',
                  format: 'date',
                },
              },
              required: ['street', 'city', 'state', 'zipCode', 'dateOfBirth'],
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

      const { name, cellphone, patient } = request.body;

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

      // Prepare user update data
      const userUpdateData: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        userUpdateData.name = name;
      }

      if (cellphone !== undefined) {
        userUpdateData.cellphone = cellphone;
      }

      // Update user if there are fields to update
      if (name !== undefined || cellphone !== undefined) {
        await fastify.db
          .update(users)
          .set(userUpdateData)
          .where(eq(users.id, existingUser.id));
      }

      // Handle patient info
      if (patient) {
        const dateOfBirth = new Date(patient.dateOfBirth);
        if (isNaN(dateOfBirth.getTime())) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Invalid date of birth format',
          });
        }

        // Check if patient record exists
        const [existingPatient] = await fastify.db
          .select()
          .from(patients)
          .where(eq(patients.userId, existingUser.id))
          .limit(1);

        if (existingPatient) {
          // Update existing patient record
          await fastify.db
            .update(patients)
            .set({
              street: patient.street,
              city: patient.city,
              state: patient.state,
              zipCode: patient.zipCode,
              dateOfBirth,
              updatedAt: new Date(),
            })
            .where(eq(patients.id, existingPatient.id));
        } else {
          // Create new patient record
          await fastify.db.insert(patients).values({
            userId: existingUser.id,
            street: patient.street,
            city: patient.city,
            state: patient.state,
            zipCode: patient.zipCode,
            dateOfBirth,
          });
        }
      }

      // Fetch and return updated user data with patient info
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
        .where(eq(users.id, existingUser.id))
        .limit(1);

      const [userWithPatient] = response;

      return userWithPatient;
    }
  );
};

export default profileRoute;
