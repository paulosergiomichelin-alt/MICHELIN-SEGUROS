import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { requireAuth } from '../lib/authMiddleware';
import { loadTenantContext, ORG_SCOPED_ENTITIES } from './tenantMiddleware';
import { ENTITY_TABLE } from './entityMap';
import { buildWhere, buildOrderBy, buildStartAfter, getLimit } from './constraintsToSql';
import { emitDataChanged } from '../lib/realtimeBus';

export const dataRouter = Router();
dataRouter.use(requireAuth);

dataRouter.get('/_whoami', (req: any, res) => res.json({ uid: req.userId }));

// Tudo a partir daqui exige um perfil de usuário cadastrado (users) e é automaticamente
// filtrado pela organização desse usuário quando a entidade é org-scoped — antes desta
// tarefa, essa regra só existia no browser (ver self-review da Fase 1).
dataRouter.use(loadTenantContext);

function resolveTable(entity: string, res: any) {
  const table = ENTITY_TABLE[entity];
  if (!table) { res.status(404).json({ error: `Entidade desconhecida: ${entity}` }); return null; }
  return table;
}

function orgScopeWhere(entity: string, table: any, req: any) {
  if (!ORG_SCOPED_ENTITIES.has(entity) || !table.organizationId) return undefined;
  return eq(table.organizationId, req.organizationId);
}

dataRouter.get('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const scope = orgScopeWhere(req.params.entity, table, req);
  const where = scope ? and(eq(table.id, req.params.id), scope) : eq(table.id, req.params.id);
  const [row] = await getDb().select().from(table).where(where);
  // Se o registro existe mas é de outra organização, retorna 404 (não 403) para não
  // revelar existência do dado a quem não tem acesso.
  res.json(row ?? null);
});

dataRouter.post('/:entity/query', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const constraints = req.body.constraints ?? [];
  const userWhere = buildWhere(table, constraints);
  const cursorWhere = buildStartAfter(table, constraints);
  const scope = orgScopeWhere(req.params.entity, table, req);
  const clauses = [userWhere, cursorWhere, scope].filter(Boolean);
  const where = clauses.length ? and(...clauses) : undefined;
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
  if (ORG_SCOPED_ENTITIES.has(req.params.entity) && table.organizationId) {
    if (req.body.organizationId && req.body.organizationId !== req.organizationId) {
      return res.status(403).json({ error: 'organizationId do payload não corresponde ao usuário autenticado' });
    }
    req.body.organizationId = req.organizationId;
  }
  const [row] = await getDb().insert(table).values(req.body).returning();
  await emitDataChanged(req.params.entity, row.id, row.organizationId ?? null);
  res.status(201).json(row);
});

dataRouter.patch('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const scope = orgScopeWhere(req.params.entity, table, req);
  const where = scope ? and(eq(table.id, req.params.id), scope) : eq(table.id, req.params.id);
  const [row] = await getDb().update(table).set(req.body).where(where).returning();
  await emitDataChanged(req.params.entity, req.params.id, row?.organizationId ?? null);
  res.json(row ?? null);
});

dataRouter.put('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  if (ORG_SCOPED_ENTITIES.has(req.params.entity) && table.organizationId) {
    if (req.body.organizationId && req.body.organizationId !== req.organizationId) {
      return res.status(403).json({ error: 'organizationId do payload não corresponde ao usuário autenticado' });
    }
    req.body.organizationId = req.organizationId;
  }
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
  const scope = orgScopeWhere(req.params.entity, table, req);
  const where = scope ? and(eq(table.id, req.params.id), scope) : eq(table.id, req.params.id);
  // .returning() ANTES de perder a linha — sem isso, organizationId vira null no evento
  // e o socket emite pro grupo 'global' em vez da room certa.
  const [deleted] = await getDb().delete(table).where(where).returning();
  await emitDataChanged(req.params.entity, req.params.id, deleted?.organizationId ?? null);
  res.status(204).end();
});
