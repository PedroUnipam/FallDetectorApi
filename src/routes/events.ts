import { events, patientCaregivers, patients, users } from '@src/db/schema';
import { authenticate } from '@src/plugins/auth';
import { desc, eq, inArray } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';

interface CreateEventBody {
  type: 'fall_1' | 'fall_2' | 'fall_3' | 'need_help' | 'ok';
}

const eventsRoute: FastifyPluginAsync = async (fastify) => {
  // POST /events - Create a new event
  fastify.post<{ Body: CreateEventBody }>(
    '/events',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              enum: ['fall_1', 'fall_2', 'fall_3', 'need_help', 'ok'],
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

      const { type } = request.body;

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

      // Create event with inferred patientId (user ID) and date
      await fastify.db.insert(events).values({
        type,
        patientId: existingUser.id,
      });

      return reply.code(204).send();
    }
  );

  // GET /events - List events for authenticated user and patients they care for
  fastify.get(
    '/events',
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

      // Get patient IDs: authenticated user's ID + patients they care for
      const patientIds: number[] = [existingUser.id];

      // Check if user is a caregiver and get user IDs for patients they care for
      const caredForPatientUsers = await fastify.db
        .select({
          userId: patients.userId,
        })
        .from(patientCaregivers)
        .innerJoin(patients, eq(patients.id, patientCaregivers.patientId))
        .where(eq(patientCaregivers.caregiverId, existingUser.id));

      caredForPatientUsers.forEach((p) => {
        if (!patientIds.includes(p.userId)) {
          patientIds.push(p.userId);
        }
      });

      // Query events with full patient information
      const eventsList = await fastify.db
        .select({
          id: events.id,
          date: events.date,
          type: events.type,
          patientId: events.patientId,
          userId: users.id,
          userName: users.name,
          userCellphone: users.cellphone,
          patientStreet: patients.street,
          patientCity: patients.city,
          patientState: patients.state,
          patientZipCode: patients.zipCode,
        })
        .from(events)
        .innerJoin(users, eq(users.id, events.patientId))
        .leftJoin(patients, eq(patients.userId, users.id))
        .where(inArray(events.patientId, patientIds))
        .orderBy(desc(events.date));

      // Map to desired response structure
      return eventsList.map((event) => ({
        id: event.id,
        date: event.date,
        type: event.type,
        patientUserId: event.patientId,
        patient: {
          name: event.userName,
          cellphone: event.userCellphone,
          patientInfo: {
            street: event.patientStreet,
            city: event.patientCity,
            state: event.patientState,
            zipCode: event.patientZipCode,
          },
        },
      }));
    }
  );
};

export default eventsRoute;
