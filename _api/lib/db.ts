import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../db/schema';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida — configure .env (dev) ou a env var do servidor (prod)');
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}
