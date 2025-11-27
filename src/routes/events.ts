import { events, patientCaregivers, patients, users } from '@src/db/schema';
import { db } from '@src/lib/db';
import { authenticate } from '@src/plugins/auth';
import { desc, eq, inArray } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';

/**
 * Sends push notifications to caregivers of a patient
 */
async function notifyCaregivers(
  dbInstance: typeof db,
  patientUserId: number,
  patientName: string
): Promise<void> {
  // Find the patient record
  const [patient] = await dbInstance
    .select()
    .from(patients)
    .where(eq(patients.userId, patientUserId))
    .limit(1);

  if (!patient) {
    // Patient record doesn't exist, no caregivers to notify
    return;
  }

  // Find all caregivers for this patient
  const caregivers = await dbInstance
    .select({
      id: users.id,
      name: users.name,
      expoNotificationToken: users.expoNotificationToken,
    })
    .from(patientCaregivers)
    .innerJoin(users, eq(users.id, patientCaregivers.caregiverId))
    .where(eq(patientCaregivers.patientId, patient.id));

  // Send notifications to caregivers who have tokens
  console.log({ caregivers });
  const notificationPromises = caregivers
    .filter((caregiver) => caregiver.expoNotificationToken)
    .map(async (caregiver) => {
      try {
        const body = {
          to: caregiver.expoNotificationToken,
          title: 'queda',
          body: patientName,
        };

        console.log({ body });
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          console.error(
            `Failed to send notification to caregiver ${caregiver.id}: ${response.statusText}`
          );
        }

        const responseBody = await response.json();
        console.log(responseBody);
      } catch (error) {
        console.error(`Error sending notification to caregiver ${caregiver.id}:`, error);
      }
    });

  // Wait for all notifications to be sent (don't block on errors)
  await Promise.allSettled(notificationPromises);
}

interface CreateEventBody {
  type: 'fall_1' | 'fall_2' | 'fall_3' | 'need_help' | 'ok';
}

interface CreateDeviceEventBody {
  fallLevel: number;
}

const eventsRoute: FastifyPluginAsync = async (fastify) => {
  // POST /devices/:deviceId/events - Create a new event from device (no auth required)
  fastify.post<{ Params: { deviceId: string }; Body: CreateDeviceEventBody }>(
    '/devices/:deviceId/events',
    {
      schema: {
        params: {
          type: 'object',
          required: ['deviceId'],
          properties: {
            deviceId: {
              type: 'string',
            },
          },
        },
        body: {
          type: 'object',
          required: ['fallLevel'],
          properties: {
            fallLevel: {
              type: 'number',
              minimum: 1,
              maximum: 3,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { deviceId } = request.params;
      const { fallLevel } = request.body;

      if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Device ID is required',
        });
      }

      if (!fallLevel || typeof fallLevel !== 'number' || fallLevel < 1 || fallLevel > 3) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'fallLevel must be a number between 1 and 3',
        });
      }

      // Find user by device ID
      const [deviceUser] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.device, deviceId.trim()))
        .limit(1);

      if (!deviceUser) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Device not found or not linked to any user',
        });
      }

      // Convert fallLevel to event type format
      const eventType = `fall_${fallLevel}` as 'fall_1' | 'fall_2' | 'fall_3';

      // Create event with inferred patientId (user ID) and date
      await fastify.db.insert(events).values({
        type: eventType,
        patientId: deviceUser.id,
      });

      // Notify caregivers asynchronously (don't block response)
      notifyCaregivers(fastify.db, deviceUser.id, deviceUser.name).catch(
        (error: unknown) => {
          fastify.log.error({ err: error }, 'Error notifying caregivers');
        }
      );

      return reply.code(204).send();
    }
  );

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

      // Notify caregivers asynchronously (don't block response)
      notifyCaregivers(fastify.db, existingUser.id, existingUser.name).catch(
        (error: unknown) => {
          fastify.log.error({ err: error }, 'Error notifying caregivers');
        }
      );

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
