import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as policySchema from './policy-schema';

// postgres-js works against local Postgres and Neon (direct connection).
// Local:  postgresql://rap:rap@localhost:5432/rap?sslmode=disable
// Neon:   postgresql://user:pass@host/db?sslmode=require
const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://localhost:5432/rap';

const client = postgres(connectionString);
export const db = drizzle(client, { schema: { ...schema, ...policySchema } });
