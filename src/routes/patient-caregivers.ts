import {
  type PatientCaregiver,
  patientCaregivers,
  patients,
  users,
} from '@src/db/schema';
import { authenticate } from '@src/plugins/auth';
import { and, eq } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';

interface LinkPatientCaregiverBody {
  caregiverId: number;
}

const patientCaregiversRoute: FastifyPluginAsync = async (fastify) => {
  // POST /patient-caregivers - Link a patient to a caregiver
  fastify.post<{ Body: LinkPatientCaregiverBody }>(
    '/patient-caregivers',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['caregiverId'],
          properties: {
            caregiverId: {
              type: 'number',
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { caregiverId } = request.body;
      const firebaseUid = request.user?.uid;

      if (!firebaseUid) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'User UID not found in token',
        });
      }

      // Get logged-in user
      const [loggedInUser] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, firebaseUid))
        .limit(1);

      if (!loggedInUser) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'User not found in database',
        });
      }

      // Validate patient exists and has a patient record
      const [patient] = await fastify.db
        .select()
        .from(patients)
        .where(eq(patients.userId, loggedInUser.id))
        .limit(1);

      if (!patient) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Patient record not found for logged-in user',
        });
      }

      const patientId = patient.id;

      // Validate caregiver exists
      const [caregiver] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.id, caregiverId))
        .limit(1);

      if (!caregiver) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Caregiver not found',
        });
      }

      // Check if link already exists
      const [existingLink] = await fastify.db
        .select()
        .from(patientCaregivers)
        .where(
          and(
            eq(patientCaregivers.patientId, patientId),
            eq(patientCaregivers.caregiverId, caregiverId)
          )
        )
        .limit(1);

      if (existingLink) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Patient and caregiver are already linked',
        });
      }

      // Create the link
      const [link] = await fastify.db
        .insert(patientCaregivers)
        .values({
          patientId,
          caregiverId,
        })
        .returning();

      // Fetch patient and caregiver info for response
      const [patientWithUser] = await fastify.db
        .select({
          id: patients.id,
          userId: patients.userId,
          street: patients.street,
          city: patients.city,
          state: patients.state,
          zipCode: patients.zipCode,
          dateOfBirth: patients.dateOfBirth,
          createdAt: patients.createdAt,
          updatedAt: patients.updatedAt,
          user: {
            id: users.id,
            firebaseUid: users.firebaseUid,
            email: users.email,
            cpf: users.cpf,
            name: users.name,
            cellphone: users.cellphone,
          },
        })
        .from(patients)
        .innerJoin(users, eq(users.id, patients.userId))
        .where(eq(patients.id, patientId))
        .limit(1);

      return reply.code(201).send({
        id: link.id,
        patientId: link.patientId,
        caregiverId: link.caregiverId,
        createdAt: link.createdAt,
        patient: patientWithUser,
        caregiver: {
          id: caregiver.id,
          firebaseUid: caregiver.firebaseUid,
          email: caregiver.email,
          cpf: caregiver.cpf,
          name: caregiver.name,
          cellphone: caregiver.cellphone,
        },
      });
    }
  );

  // GET /patient-caregivers/patient - List all caregivers for the logged-in patient
  fastify.get(
    '/patient-caregivers/patient',
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

      // Get logged-in user
      const [loggedInUser] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, firebaseUid))
        .limit(1);

      if (!loggedInUser) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'User not found in database',
        });
      }

      // Validate patient exists
      const [patient] = await fastify.db
        .select()
        .from(patients)
        .where(eq(patients.userId, loggedInUser.id))
        .limit(1);

      if (!patient) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Patient record not found for logged-in user',
        });
      }

      const patientId = patient.id;

      // Fetch all caregivers for this patient
      const caregivers = await fastify.db
        .select({
          id: users.id,
          firebaseUid: users.firebaseUid,
          email: users.email,
          cpf: users.cpf,
          name: users.name,
          cellphone: users.cellphone,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(patientCaregivers)
        .innerJoin(users, eq(users.id, patientCaregivers.caregiverId))
        .where(eq(patientCaregivers.patientId, patientId));

      return caregivers;
    }
  );

  // GET /patient-caregivers/caregiver/:caregiverId - List all patients for a caregiver
  fastify.get<{ Params: { caregiverId: string } }>(
    '/patient-caregivers/caregiver/:caregiverId',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const caregiverId = parseInt(request.params.caregiverId, 10);

      if (isNaN(caregiverId)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid caregiver ID',
        });
      }

      // Validate caregiver exists
      const [caregiver] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.id, caregiverId))
        .limit(1);

      if (!caregiver) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Caregiver not found',
        });
      }

      // Fetch all patients for this caregiver
      const patientsList = await fastify.db
        .select({
          id: patients.id,
          userId: patients.userId,
          street: patients.street,
          city: patients.city,
          state: patients.state,
          zipCode: patients.zipCode,
          dateOfBirth: patients.dateOfBirth,
          createdAt: patients.createdAt,
          updatedAt: patients.updatedAt,
          user: {
            id: users.id,
            firebaseUid: users.firebaseUid,
            email: users.email,
            cpf: users.cpf,
            name: users.name,
            cellphone: users.cellphone,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          },
        })
        .from(patientCaregivers)
        .innerJoin(patients, eq(patients.id, patientCaregivers.patientId))
        .innerJoin(users, eq(users.id, patients.userId))
        .where(eq(patientCaregivers.caregiverId, caregiverId));

      return patientsList;
    }
  );

  // DELETE /patient-caregivers - Unlink a patient from a caregiver
  fastify.delete<{ Body: LinkPatientCaregiverBody }>(
    '/patient-caregivers',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['caregiverId'],
          properties: {
            caregiverId: {
              type: 'number',
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

      const { caregiverId } = request.body;

      // Get logged-in user
      const [loggedInUser] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, firebaseUid))
        .limit(1);

      if (!loggedInUser) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'User not found in database',
        });
      }

      // Validate patient exists
      const [patient] = await fastify.db
        .select()
        .from(patients)
        .where(eq(patients.userId, loggedInUser.id))
        .limit(1);

      if (!patient) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Patient record not found for logged-in user',
        });
      }

      const patientId = patient.id;

      // Check if link exists
      const links = await fastify.db
        .select()
        .from(patientCaregivers)
        .where(
          and(
            eq(patientCaregivers.patientId, patientId),
            eq(patientCaregivers.caregiverId, caregiverId)
          )
        )
        .limit(1);

      const link = links[0] as PatientCaregiver | undefined;

      if (!link) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Patient and caregiver are not linked',
        });
      }

      // Delete the link
      await fastify.db
        .delete(patientCaregivers)
        .where(
          and(
            eq(patientCaregivers.patientId, patientId),
            eq(patientCaregivers.caregiverId, caregiverId)
          )
        );

      return reply.code(200).send({
        message: 'Patient and caregiver successfully unlinked',
      });
    }
  );
};

export default patientCaregiversRoute;
