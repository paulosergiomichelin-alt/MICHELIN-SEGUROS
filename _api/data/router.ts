import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { requireAuth } from '../lib/authMiddleware';
import { loadTenantContext, ORG_SCOPED_ENTITIES } from './tenantMiddleware';
import { ENTITY_TABLE, pkColumn, pkPropertyName } from './entityMap';
import { buildWhere, buildOrderBy, buildStartAfter, getLimit } from './constraintsToSql';
import { emitDataChanged } from '../lib/realtimeBus';
import { normalizeTimestamps } from '../lib/normalizeTimestamps';
import { leadStatusCounts, systemMetricsDashboard, organizations, users, processingLocks } from '../db/schema';

export const dataRouter = Router();
dataRouter.use(requireAuth);

// Normaliza toda resposta JSON desta rota (timestamps Postgres → ISO 8601) — ver
// _api/lib/normalizeTimestamps.ts. Aplicado como middleware, não por chamada, para
// nenhuma rota nova esquecer.
dataRouter.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body: any) => originalJson(normalizeTimestamps(body));
  next();
});

dataRouter.get('/_whoami', (req: any, res) => res.json({ uid: req.userId }));

// Bootstrap de onboarding — registrada ANTES de loadTenantContext de propósito: um usuário
// recém-criado no Firebase Auth ainda não tem linha em `users`, então o middleware de tenant
// (que exige perfil existente) bloquearia a própria criação desse perfil. É a única rota deste
// router que não passa por isolamento de tenant, porque ainda não existe tenant a isolar.
dataRouter.post('/_onboarding/empresa', async (req: any, res) => {
  const { empresa, user } = req.body;
  if (!empresa?.id || !user?.id) return res.status(400).json({ error: 'empresa.id e user.id são obrigatórios' });
  if (user.id !== req.userId) return res.status(403).json({ error: 'user.id deve corresponder ao usuário autenticado' });
  const [empresaRow] = await getDb().transaction(async (tx) => {
    const [e] = await tx.insert(organizations).values(empresa)
      .onConflictDoUpdate({ target: organizations.id, set: empresa }).returning();
    await tx.insert(users).values(user).onConflictDoUpdate({ target: users.id, set: user });
    return [e];
  });
  res.status(201).json(empresaRow);
});

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
  // Superadmins bypassam isolamento de tenant — mesma regra de DataPolicyService.applyVisibilityConstraints
  // no cliente (ADR-6). Sem este bypass, telas de administração de plataforma (ex.: listar todas as
  // empresas) ficariam presas à organização do próprio superadmin.
  if (req.userSuperadmin) return undefined;
  if (!ORG_SCOPED_ENTITIES.has(entity)) return undefined;
  // Caso especial: `organizations` (empresas) não tem coluna organization_id — a própria
  // linha É a organização. Sem este caso, o guard genérico abaixo (!table.organizationId)
  // pulava a checagem inteira e qualquer usuário autenticado lia a empresa de qualquer
  // outro tenant pela API genérica. Descoberto ao testar leitura cross-tenant após a troca
  // de driver — não é uma regressão da troca, já existia desde a Fase 2 Task 1.
  if (entity === 'empresas' || entity === 'empresa') return eq(table.id, req.organizationId);
  if (!table.organizationId) return undefined;
  return eq(table.organizationId, req.organizationId);
}

// Rotas de incremento atômico para os agregados de métricas (DataService.updateAggregates).
// Registradas antes das rotas genéricas /:entity para não depender de ordem — de qualquer
// forma não colidem, pois nenhuma rota genérica POST de 2 segmentos aceita um segundo
// segmento livre além do literal "query".
dataRouter.post('/_metrics/lead-status-count', async (req, res) => {
  const { status, delta } = req.body;
  await getDb().insert(leadStatusCounts).values({ status, count: delta })
    .onConflictDoUpdate({ target: leadStatusCounts.status, set: { count: sql`${leadStatusCounts.count} + ${delta}` } });
  res.status(204).end();
});

dataRouter.post('/_metrics/total-leads', async (req, res) => {
  const { delta } = req.body;
  await getDb().update(systemMetricsDashboard)
    .set({ totalLeads: sql`${systemMetricsDashboard.totalLeads} + ${delta}` })
    .where(eq(systemMetricsDashboard.id, 'dashboard'));
  res.status(204).end();
});

// Locks distribuídos (LockService.ts). Um SELECT seguido de INSERT/UPDATE, mesmo dentro de
// uma transação, NÃO é atômico contra concorrência real: duas requisições simultâneas podem
// ambas passar pelo SELECT antes de qualquer COMMIT, e uma delas quebra com violação de PK em
// vez de retornar { acquired: false } — confirmado empiricamente ao testar duas aquisições
// concorrentes do mesmo lock (uma delas lançava erro de chave duplicada). Corrigido com um
// único INSERT ... ON CONFLICT DO UPDATE ... WHERE — atômico por natureza do Postgres: o WHERE
// após DO UPDATE só aplica a atualização se o lock existente já expirou ou pertence ao mesmo
// dono/instância; caso contrário a linha não é tocada e RETURNING não traz nada.
dataRouter.post('/_locks/acquire', async (req, res) => {
  const { id, ownerId, instanceId, ttlMs } = req.body;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const [row] = await getDb().insert(processingLocks)
    .values({ id, resourceId: id, ownerId, instanceId, expiresAt })
    .onConflictDoUpdate({
      target: processingLocks.id,
      set: { ownerId, instanceId, expiresAt },
      where: sql`${processingLocks.expiresAt} <= now() or (${processingLocks.ownerId} = ${ownerId} and ${processingLocks.instanceId} = ${instanceId})`,
    })
    .returning();
  res.json({ acquired: !!row });
});

dataRouter.post('/_locks/release', async (req, res) => {
  const { id, ownerId } = req.body;
  await getDb().delete(processingLocks).where(and(eq(processingLocks.id, id), eq(processingLocks.ownerId, ownerId)));
  res.status(204).end();
});

dataRouter.get('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const scope = orgScopeWhere(req.params.entity, table, req);
  const idEq = eq(pkColumn(req.params.entity, table), req.params.id);
  const where = scope ? and(idEq, scope) : idEq;
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
  if (!req.userSuperadmin && ORG_SCOPED_ENTITIES.has(req.params.entity) && table.organizationId) {
    if (req.body.organizationId && req.body.organizationId !== req.organizationId) {
      return res.status(403).json({ error: 'organizationId do payload não corresponde ao usuário autenticado' });
    }
    req.body.organizationId = req.organizationId;
  }
  const [row] = await getDb().insert(table).values(req.body).returning();
  await emitDataChanged(req.params.entity, row[pkPropertyName(req.params.entity)], row.organizationId ?? null);
  res.status(201).json(row);
});

dataRouter.patch('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const scope = orgScopeWhere(req.params.entity, table, req);
  const idEq = eq(pkColumn(req.params.entity, table), req.params.id);
  const where = scope ? and(idEq, scope) : idEq;
  const [row] = await getDb().update(table).set(req.body).where(where).returning();
  await emitDataChanged(req.params.entity, req.params.id, row?.organizationId ?? null);
  res.json(row ?? null);
});

dataRouter.put('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  if (!req.userSuperadmin && ORG_SCOPED_ENTITIES.has(req.params.entity) && table.organizationId) {
    if (req.body.organizationId && req.body.organizationId !== req.organizationId) {
      return res.status(403).json({ error: 'organizationId do payload não corresponde ao usuário autenticado' });
    }
    req.body.organizationId = req.organizationId;
  }
  const pkProp = pkPropertyName(req.params.entity);
  const [row] = await getDb()
    .insert(table)
    .values({ ...req.body, [pkProp]: req.params.id })
    .onConflictDoUpdate({ target: pkColumn(req.params.entity, table), set: req.body })
    .returning();
  await emitDataChanged(req.params.entity, req.params.id, row?.organizationId ?? null);
  res.json(row);
});

dataRouter.delete('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const scope = orgScopeWhere(req.params.entity, table, req);
  const idEq = eq(pkColumn(req.params.entity, table), req.params.id);
  const where = scope ? and(idEq, scope) : idEq;
  // .returning() ANTES de perder a linha — sem isso, organizationId vira null no evento
  // e o socket emite pro grupo 'global' em vez da room certa.
  const [deleted] = await getDb().delete(table).where(where).returning();
  await emitDataChanged(req.params.entity, req.params.id, deleted?.organizationId ?? null);
  res.status(204).end();
});
