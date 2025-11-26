import { patients, users } from '@src/db/schema';
import { auth } from '@src/lib/firebase';
import { eq } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';
import { FirebaseAppError } from 'firebase-admin/app';

interface PatientInfo {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  dateOfBirth: string; // ISO date string
}

interface RegisterBody {
  email: string;
  password: string;
  cpf: string;
  name: string;
  cellphone: string;
  patient?: PatientInfo;
}

const registerRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: RegisterBody }>(
    '/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'cpf', 'name', 'cellphone'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
            },
            password: {
              type: 'string',
              minLength: 6,
            },
            cpf: {
              type: 'string',
            },
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
      const { email, password, cpf, name, cellphone, patient } = request.body;
      let firebaseUid: string | null = null;

      try {
        const existingUser = await fastify.db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUser.length > 0) {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'User with this email already exists',
          });
        }

        const existingCpf = await fastify.db
          .select()
          .from(users)
          .where(eq(users.cpf, cpf))
          .limit(1);

        if (existingCpf.length > 0) {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'User with this CPF already exists',
          });
        }

        const firebaseUser = await auth.createUser({
          email,
          password,
          emailVerified: false,
        });

        firebaseUid = firebaseUser.uid;

        const [dbUser] = await fastify.db
          .insert(users)
          .values({
            firebaseUid: firebaseUser.uid,
            email: firebaseUser.email!,
            cpf,
            name,
            didAgreeToLGPD: true,
            cellphone,
          })
          .returning();

        if (patient) {
          try {
            const dateOfBirth = new Date(patient.dateOfBirth);
            if (isNaN(dateOfBirth.getTime())) {
              return reply.code(400).send({
                error: 'Bad Request',
                message: 'Invalid date of birth format',
              });
            }

            await fastify.db
              .insert(patients)
              .values({
                userId: dbUser.id,
                street: patient.street,
                city: patient.city,
                state: patient.state,
                zipCode: patient.zipCode,
                dateOfBirth,
              })
              .returning();
          } catch (patientError: unknown) {
            fastify.log.error(
              `Failed to create patient record: ${patientError?.toString()}`
            );
            // User was created successfully, but patient creation failed
            // Return success with user info, but note that patient creation failed
            return reply.code(201).send({
              id: dbUser.id,
              firebaseUid: dbUser.firebaseUid,
              email: dbUser.email,
              cpf: dbUser.cpf,
              name: dbUser.name,
              didAgreeToLGPD: dbUser.didAgreeToLGPD,
              cellphone: dbUser.cellphone,
              createdAt: dbUser.createdAt,
              warning:
                'User created successfully, but patient information could not be saved',
            });
          }
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
          .where(eq(users.id, dbUser.id))
          .limit(1);

        const [userWithPatient] = response;

        return reply.code(201).send(userWithPatient);
      } catch (error: any) {
        fastify.log.error(error);

        // Clean up Firebase user if it was created but database insert failed
        if (firebaseUid) {
          try {
            await auth.deleteUser(firebaseUid);
          } catch (deleteError) {
            fastify.log.error(
              `Failed to clean up Firebase user: ${deleteError?.toString()}`
            );
          }
        }

        // Handle Firebase-specific errors
        if (error instanceof FirebaseAppError) {
          if (error.code === 'auth/email-already-exists') {
            return reply.code(409).send({
              error: 'Conflict',
              message: 'User with this email already exists',
            });
          }

          if (error.code === 'auth/invalid-email') {
            return reply.code(400).send({
              error: 'Bad Request',
              message: 'Invalid email address',
            });
          }

          if (error.code === 'auth/weak-password') {
            return reply.code(400).send({
              error: 'Bad Request',
              message: 'Password is too weak',
            });
          }
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create user',
        });
      }
    }
  );
};

export default registerRoute;
