import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '@src/db/schema';

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!databaseUrl || !authToken) {
  throw new Error(
    'Missing Turso configuration. Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables.',
  );
}

const client = createClient({
  url: databaseUrl,
  authToken,
});

export const db = drizzle(client, { schema });
export default db;

