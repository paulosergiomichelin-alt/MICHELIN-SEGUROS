import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { requireAuth } from '../lib/authMiddleware';
import { ENTITY_TABLE } from './entityMap';
import { buildWhere, buildOrderBy, buildStartAfter, getLimit } from './constraintsToSql';
import { emitDataChanged } from '../lib/realtimeBus';

export const dataRouter = Router();
dataRouter.use(requireAuth);

dataRouter.get('/_whoami', (req: any, res) => res.json({ uid: req.userId }));

function resolveTable(entity: string, res: any) {
  const table = ENTITY_TABLE[entity];
  if (!table) { res.status(404).json({ error: `Entidade desconhecida: ${entity}` }); return null; }
  return table;
}

dataRouter.get('/:entity/:id', async (req, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const [row] = await getDb().select().from(table).where(eq(table.id, req.params.id));
  res.json(row ?? null);
});

dataRouter.post('/:entity/query', async (req, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const constraints = req.body.constraints ?? [];
  const userWhere = buildWhere(table, constraints);
  const cursorWhere = buildStartAfter(table, constraints);
  const where = userWhere && cursorWhere ? and(userWhere, cursorWhere) : (userWhere ?? cursorWhere);
  let q = getDb().select().from(table).where(where);
  const ob = buildOrderBy(table, constraints);
  if (ob) q = q.orderBy(ob) as any;
  const n = getLimit(constraints);
  if (n) q = q.limit(n) as any;
  const rows = await q;
  res.json(rows);
});

dataRouter.post('/:entity', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const [row] = await getDb().insert(table).values(req.body).returning();
  await emitDataChanged(req.params.entity, row.id, row.organizationId ?? null);
  res.status(201).json(row);
});

dataRouter.patch('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const [row] = await getDb().update(table).set(req.body).where(eq(table.id, req.params.id)).returning();
  await emitDataChanged(req.params.entity, req.params.id, row?.organizationId ?? null);
  res.json(row ?? null);
});

dataRouter.put('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const [row] = await getDb()
    .insert(table)
    .values({ ...req.body, id: req.params.id })
    .onConflictDoUpdate({ target: table.id, set: req.body })
    .returning();
  await emitDataChanged(req.params.entity, req.params.id, row?.organizationId ?? null);
  res.json(row);
});

dataRouter.delete('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  // .returning() ANTES de perder a linha — sem isso, organizationId vira null no evento
  // e o socket emite pro grupo 'global' em vez da room certa.
  const [deleted] = await getDb().delete(table).where(eq(table.id, req.params.id)).returning();
  await emitDataChanged(req.params.entity, req.params.id, deleted?.organizationId ?? null);
  res.status(204).end();
});
