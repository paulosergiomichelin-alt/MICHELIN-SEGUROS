import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from '../db/schema';

// drizzle-orm/neon-http NÃO suporta transações (getDb().transaction() lança
// "No transactions support in neon-http driver") — descoberto na Fase 3 ao implementar
// a rota de bootstrap de onboarding, que precisa gravar organizations+users atomicamente.
// neon-serverless usa WebSocket (via Pool) e suporta transações reais, necessárias também
// pelos locks distribuídos (Fase 3 Task 6) e pelo endpoint _batch (Fase 3 Task 11).
neonConfig.webSocketConstructor = ws;

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida — configure .env (dev) ou a env var do servidor (prod)');
  const pool = new Pool({ connectionString: url });
  _db = drizzle(pool, { schema });
  return _db;
}
