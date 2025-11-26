import { users } from '@src/db/schema';
import { auth } from '@src/lib/firebase';
import { eq } from 'drizzle-orm';
import { FastifyPluginAsync } from 'fastify';
import { FirebaseAppError } from 'firebase-admin/app';

interface RegisterBody {
  email: string;
  password: string;
}

const registerRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: RegisterBody }>(
    '/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
            },
            password: {
              type: 'string',
              minLength: 6,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
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
          })
          .returning();

        return reply.code(201).send({
          id: dbUser.id,
          firebaseUid: dbUser.firebaseUid,
          email: dbUser.email,
          createdAt: dbUser.createdAt,
        });
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
