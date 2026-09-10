import { eq, and } from 'drizzle-orm';
import { getDb } from './db';
import { ENTITY_TABLE, pkColumn, pkPropertyName } from '../data/entityMap';
import { normalizeTimestamps } from './normalizeTimestamps';

function resolveTable(collection: string) {
  const table = ENTITY_TABLE[collection];
  if (!table) throw new Error(`pgData: entidade desconhecida "${collection}" — adicione em _api/data/entityMap.ts`);
  return table;
}

export async function fsGet(collection: string, id: string): Promise<Record<string, any> | null> {
  const table = resolveTable(collection);
  const [row] = await getDb().select().from(table).where(eq(pkColumn(collection, table), id));
  return row ? normalizeTimestamps(row) : null;
}

export async function fsSet(collection: string, id: string, data: Record<string, any>): Promise<void> {
  const table = resolveTable(collection);
  const pkProp = pkPropertyName(collection);
  await getDb().insert(table).values({ ...data, [pkProp]: id })
    .onConflictDoUpdate({ target: pkColumn(collection, table), set: data });
}

export async function fsUpdate(collection: string, id: string, data: Record<string, any>): Promise<void> {
  const table = resolveTable(collection);
  await getDb().update(table).set(data).where(eq(pkColumn(collection, table), id));
}

export async function fsDelete(collection: string, id: string): Promise<void> {
  const table = resolveTable(collection);
  await getDb().delete(table).where(eq(pkColumn(collection, table), id));
}

// Paridade exata com adminFirebase.ts: o parser original (buildStructuredQuery) só suporta
// filtros de igualdade — esta versão também só implementa eq(), de propósito.
function buildEqFilters(table: any, filters: Array<{ field: string; value: string }>) {
  const clauses = filters.map(f => eq(table[f.field], f.value));
  return clauses.length > 1 ? and(...clauses) : clauses[0];
}

export async function fsQuery(collection: string, filters: Array<{ field: string; value: string }>): Promise<Array<{ id: string }>> {
  const table = resolveTable(collection);
  const pkProp = pkPropertyName(collection);
  const rows = await getDb().select({ id: table[pkProp] }).from(table).where(buildEqFilters(table, filters)).limit(1);
  return rows;
}

export async function fsQueryFull(
  collection: string,
  filters: Array<{ field: string; value: string }>,
  limitN = 500,
): Promise<Array<Record<string, any> & { id: string }>> {
  const table = resolveTable(collection);
  const rows = await getDb().select().from(table).where(buildEqFilters(table, filters)).limit(limitN);
  return rows.map((r: any) => normalizeTimestamps(r));
}
