import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/rap');
export const db = drizzle(sql, { schema });