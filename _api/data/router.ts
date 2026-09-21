import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { requireAuth } from '../lib/authMiddleware';
import { loadTenantContext, ORG_SCOPED_ENTITIES } from './tenantMiddleware';
import { ENTITY_TABLE, pkColumn, pkPropertyName } from './entityMap';
import { buildWhere, buildOrderBy, buildStartAfter, getLimit } from './constraintsToSql';
import { emitDataChanged } from '../lib/realtimeBus';
import { normalizeTimestamps } from '../lib/normalizeTimestamps';
import { leadStatusCounts, systemMetricsDashboard, organizations, users, processingLocks, messages } from '../db/schema';

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

// `settings`/`config` armazenam tudo dentro de uma única coluna `data` (jsonb) — não têm
// colunas reais para campos de negócio como logoDark/companyName (ver _api/db/schema/settings.ts).
// As rotas genéricas abaixo fazem `.set(req.body)`/`.values(req.body)` direto contra as colunas
// da tabela; para essas duas entidades isso silenciosamente descarta todo campo que não seja
// id/createdAt/updatedAt (os únicos nomes que colidem com colunas reais), sem erro — o PATCH
// "funciona" (retorna 200, até atualiza updatedAt) mas o conteúdo real nunca é persistido.
// Confirmado em produção: branding (logoDark/logoLight) parava de refletir uploads novos assim
// que a entidade migrou de documento Firestore plano para linha Postgres com coluna jsonb.
const GENERIC_JSON_ENTITIES = new Set(['settings', 'config']);

// `leads` tem colunas reais só pros campos mais usados/filtrados (status, name,
// phone, cpf, plate...) e uma coluna `data` (jsonb) pra tudo o mais que o tipo
// Lead define (dezenas de campos: documents, rg, rgOrgaoEmissor, birthDate,
// civilStatus, endereços, etc.). As rotas genéricas abaixo faziam `.set(req.body)`
// direto contra as colunas da tabela — igual ao bug já documentado pra
// settings/config acima — então qualquer campo que não fosse uma dessas ~20
// colunas era silenciosamente descartado, sem erro, sem log. Confirmado em
// produção: import de CNH/CRLV/apólice num lead persistia o anexo no Storage
// mas perdia a referência (documents) e os campos extraídos (rg, etc.) porque
// nenhum deles é coluna de `leads` — a coluna `data` que deveria guardá-los
// nunca era escrita.
const HYBRID_JSON_ENTITIES = new Set(['leads', 'lead']);
const JSON_BLOB_ENTITIES = new Set([...GENERIC_JSON_ENTITIES, ...HYBRID_JSON_ENTITIES]);

function flattenJsonRow(row: any): any {
  if (!row) return row;
  const { data, ...rest } = row;
  return { ...(data ?? {}), ...rest };
}

// Separa um payload plano (ex: o `after` que o DataService do frontend monta)
// entre campos que são coluna real da tabela e campos que precisam cair na
// coluna `data` (jsonb). `data` nunca é aceito como campo direto do payload —
// é sempre gerenciado por quem chama esta função.
function splitHybridColumns(table: any, body: Record<string, any>): { known: Record<string, any>; extra: Record<string, any> } {
  const known: Record<string, any> = {};
  const extra: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'data') continue;
    if (table[key] !== undefined) known[key] = value;
    else extra[key] = value;
  }
  return { known, extra };
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

// email_settings é keyed por userId (ver PK_COLUMN em entityMap.ts) e não tem coluna
// organization_id pra reusar orgScopeWhere — sem este guard, GET/PATCH/DELETE
// /api/data/email_settings/:id não tinham NENHUMA verificação de posse, e :id é
// justamente o userId escolhido livremente por quem chama: qualquer usuário
// autenticado lia e sobrescrevia assinatura/resposta automática/conta padrão de
// e-mail de outro usuário só trocando o id na URL (achado F-17 da auditoria — a rota
// dedicada /api/email/settings já foi corrigida separadamente, mas nunca protegeu
// este caminho genérico, que continua registrado em ENTITY_TABLE).
const SELF_USER_PK_ENTITIES = new Set(['email_settings']);
function selfUserScopeWhere(entity: string, table: any, req: any) {
  if (req.userSuperadmin) return undefined;
  if (!SELF_USER_PK_ENTITIES.has(entity)) return undefined;
  return eq(table.userId, req.userId);
}

// A única barreira real que existia contra escalação de privilégio (um usuário comum
// mudando o próprio role/permissions pra admin) era DataPolicyService.checkPermissions —
// que roda só no navegador. Qualquer PATCH/PUT direto em /api/data/users/:id (via
// curl/Postman, sem passar pelo DataService do frontend) alterava role/permissions/
// organizationId/superadmin de qualquer usuário da própria organização sem checagem
// nenhuma no backend (achado F-14 da auditoria). Espelha exatamente a mesma lista de
// campos e a mesma regra (bloqueado pra quem não é admin/superadmin) que já existia em
// DataService.ts:1022-1034 — só que agora também no servidor, que é quem manda de
// verdade. Escopo: só PATCH/PUT (edição de registro existente) — POST de criação
// continua livre pra permitir o auto-cadastro definir o role padrão inicial (baixo
// privilégio), igual o frontend já fazia.
const SENSITIVE_USER_FIELDS = ['role', 'permissions', 'ownerId', 'createdBy', 'organizationId', 'superadmin'];
function assertNoPrivilegeEscalation(entity: string, body: Record<string, any>, req: any, res: any): boolean {
  if (entity !== 'users' && entity !== 'user') return true;
  // Mesma condição de UserProfileModal.tsx:92 (isAdmin) — um usuário com
  // permissions.canManageUsers=true mas role !== 'admin' também tem permissão
  // legítima de editar outros usuários nesta tela.
  if (req.userSuperadmin || req.userRole === 'admin' || req.userPermissions?.canManageUsers) return true;
  const attempted = SENSITIVE_USER_FIELDS.filter(f => body[f] !== undefined);
  if (attempted.length > 0) {
    res.status(403).json({ error: `Ação negada: campos restritos (${attempted.join(', ')})` });
    return false;
  }
  return true;
}

function scopeWhere(entity: string, table: any, req: any) {
  const clauses = [orgScopeWhere(entity, table, req), selfUserScopeWhere(entity, table, req)].filter(Boolean);
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...(clauses as any[]));
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

// Claim idempotente de mensagem (leadAutomation.ts) — equivalente ao runTransaction
// original que lia messages/{id}.aiProcessed e só marcava se ainda não estivesse marcado.
// Mesmo padrão atômico dos locks: UPDATE condicional + RETURNING, sem SELECT prévio, para
// não reabrir a mesma janela de corrida (duas invocações do mesmo webhook em paralelo).
dataRouter.post('/_claims/message', async (req, res) => {
  const { messageId } = req.body;
  const [row] = await getDb().update(messages)
    .set({ aiProcessed: true, aiProcessingStartedAt: new Date().toISOString() })
    .where(and(eq(messages.id, messageId), sql`(${messages.aiProcessed} is not true)`))
    .returning();
  // claimed=true → mensagem existe e não estava processada, agora está sob nossa responsabilidade.
  // claimed=false → ou não existe, ou já tinha sido processada — nos dois casos, pular (mesma
  // semântica do original: `if (!mSnap.exists()) return true;` tratava "não existe" como "já claimed").
  res.json({ claimed: !!row });
});

// Escrita atômica multi-operação (LoggerService.flush, MetricsService, BatchCoordinatorService
// via leadAutomation.ts) — várias operações numa única transação real, com a mesma proteção de
// isolamento de tenant das rotas genéricas (org injetada em "set", filtrada em "update"/"delete").
type BatchOp = { type: 'set' | 'update' | 'delete'; entity: string; id: string; data?: Record<string, any> };

dataRouter.post('/_batch', async (req: any, res) => {
  const operations: BatchOp[] = req.body.operations ?? [];
  const results = await getDb().transaction(async (tx) => {
    const out: any[] = [];
    for (const op of operations) {
      const table = ENTITY_TABLE[op.entity];
      if (!table) throw new Error(`_batch: entidade desconhecida "${op.entity}"`);
      const pkProp = pkPropertyName(op.entity);
      const rawData = { ...(op.data ?? {}) };
      const idEq = eq(pkColumn(op.entity, table), op.id);

      // Mesmo tratamento das rotas singulares (POST/PATCH/PUT /:entity) — sem isso,
      // qualquer campo de uma entidade jsonb (settings/config/leads) que não seja
      // coluna real da tabela era silenciosamente descartado num batch, nunca caindo
      // na coluna `data` (achado F-03 da auditoria). Nenhum caller atual do /_batch
      // toca essas entidades, mas a rota genérica precisa se comportar igual às
      // outras pra não virar um jeito silencioso de perder dado no futuro.
      let data: Record<string, any> = rawData;
      if (GENERIC_JSON_ENTITIES.has(op.entity)) {
        data = { data: rawData };
      } else if (HYBRID_JSON_ENTITIES.has(op.entity)) {
        const { known, extra } = splitHybridColumns(table, rawData);
        data = { ...known, data: extra };
      }

      if (op.type === 'set') {
        if (!req.userSuperadmin && ORG_SCOPED_ENTITIES.has(op.entity) && table.organizationId) {
          data.organizationId = req.organizationId;
        }
        // Merge, não substituição: um upsert que só toca um subconjunto de campos
        // (comum em writes incrementais) não pode apagar o resto do JSONB `data`
        // já persistido pra esse registro.
        if (JSON_BLOB_ENTITIES.has(op.entity)) {
          const [current] = await tx.select().from(table).where(idEq);
          data.data = { ...(current?.data ?? {}), ...data.data };
        }
        const [row] = await tx.insert(table).values({ ...data, [pkProp]: op.id })
          .onConflictDoUpdate({ target: pkColumn(op.entity, table), set: data }).returning();
        out.push(row);
      } else if (op.type === 'update') {
        const scope = orgScopeWhere(op.entity, table, req);
        const where = scope ? and(idEq, scope) : idEq;
        if (JSON_BLOB_ENTITIES.has(op.entity)) {
          const [current] = await tx.select().from(table).where(where);
          data.data = { ...(current?.data ?? {}), ...data.data };
        }
        const [row] = await tx.update(table).set(data).where(where).returning();
        out.push(row ?? null);
      } else {
        const scope = orgScopeWhere(op.entity, table, req);
        const where = scope ? and(idEq, scope) : idEq;
        await tx.delete(table).where(where);
        out.push({ [pkProp]: op.id, deleted: true });
      }
    }
    return out;
  });
  for (const [i, op] of operations.entries()) {
    await emitDataChanged(op.entity, op.id, results[i]?.organizationId ?? null);
  }
  res.status(200).json(results);
});

dataRouter.get('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const scope = scopeWhere(req.params.entity, table, req);
  const idEq = eq(pkColumn(req.params.entity, table), req.params.id);
  const where = scope ? and(idEq, scope) : idEq;
  const [row] = await getDb().select().from(table).where(where);
  // Se o registro existe mas é de outra organização, retorna 404 (não 403) para não
  // revelar existência do dado a quem não tem acesso.
  res.json(JSON_BLOB_ENTITIES.has(req.params.entity) ? flattenJsonRow(row ?? null) : (row ?? null));
});

dataRouter.post('/:entity/query', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const constraints = req.body.constraints ?? [];
  const userWhere = buildWhere(table, constraints);
  const cursorWhere = buildStartAfter(table, constraints);
  const scope = scopeWhere(req.params.entity, table, req);
  const clauses = [userWhere, cursorWhere, scope].filter(Boolean);
  const where = clauses.length ? and(...clauses) : undefined;
  let q = getDb().select().from(table).where(where);
  const ob = buildOrderBy(table, constraints);
  if (ob) q = q.orderBy(ob) as any;
  const n = getLimit(constraints);
  if (n) q = q.limit(n) as any;
  const rows = await q;
  res.json(JSON_BLOB_ENTITIES.has(req.params.entity) ? rows.map(flattenJsonRow) : rows);
});

dataRouter.post('/:entity', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  if (!req.userSuperadmin && ORG_SCOPED_ENTITIES.has(req.params.entity) && table.organizationId) {
    if (req.body.organizationId && req.body.organizationId !== req.organizationId) {
      return res.status(403).json({ error: 'organizationId do payload não corresponde ao usuário autenticado' });
    }
    req.body.organizationId = req.organizationId;
  }
  if (!req.userSuperadmin && SELF_USER_PK_ENTITIES.has(req.params.entity)) {
    if (req.body.userId && req.body.userId !== req.userId) {
      return res.status(403).json({ error: 'userId do payload não corresponde ao usuário autenticado' });
    }
    req.body.userId = req.userId;
  }
  let values: any = req.body;
  if (GENERIC_JSON_ENTITIES.has(req.params.entity)) {
    values = { [pkPropertyName(req.params.entity)]: req.body.id, data: req.body };
  } else if (HYBRID_JSON_ENTITIES.has(req.params.entity)) {
    const { known, extra } = splitHybridColumns(table, req.body);
    values = { ...known, data: extra };
  }
  const [row] = await getDb().insert(table).values(values).returning();
  await emitDataChanged(req.params.entity, row[pkPropertyName(req.params.entity)], row.organizationId ?? null);
  res.status(201).json(JSON_BLOB_ENTITIES.has(req.params.entity) ? flattenJsonRow(row) : row);
});

dataRouter.patch('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  if (!assertNoPrivilegeEscalation(req.params.entity, req.body, req, res)) return;
  const scope = scopeWhere(req.params.entity, table, req);
  const idEq = eq(pkColumn(req.params.entity, table), req.params.id);
  const where = scope ? and(idEq, scope) : idEq;
  let setValues: any = req.body;
  if (GENERIC_JSON_ENTITIES.has(req.params.entity)) {
    const [current] = await getDb().select().from(table).where(where);
    setValues = { data: { ...(current?.data ?? {}), ...req.body } };
  } else if (HYBRID_JSON_ENTITIES.has(req.params.entity)) {
    const [current] = await getDb().select().from(table).where(where);
    const { known, extra } = splitHybridColumns(table, req.body);
    setValues = { ...known, data: { ...(current?.data ?? {}), ...extra } };
  }
  const [row] = await getDb().update(table).set(setValues).where(where).returning();
  await emitDataChanged(req.params.entity, req.params.id, row?.organizationId ?? null);
  res.json(JSON_BLOB_ENTITIES.has(req.params.entity) ? flattenJsonRow(row ?? null) : (row ?? null));
});

dataRouter.put('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  if (!assertNoPrivilegeEscalation(req.params.entity, req.body, req, res)) return;
  if (!req.userSuperadmin && ORG_SCOPED_ENTITIES.has(req.params.entity) && table.organizationId) {
    if (req.body.organizationId && req.body.organizationId !== req.organizationId) {
      return res.status(403).json({ error: 'organizationId do payload não corresponde ao usuário autenticado' });
    }
    req.body.organizationId = req.organizationId;
  }
  const pkProp = pkPropertyName(req.params.entity);
  let values: any = { ...req.body, [pkProp]: req.params.id };
  let setOnConflict: any = req.body;
  if (GENERIC_JSON_ENTITIES.has(req.params.entity)) {
    values = { [pkProp]: req.params.id, data: req.body };
    setOnConflict = { data: req.body };
  } else if (HYBRID_JSON_ENTITIES.has(req.params.entity)) {
    const { known, extra } = splitHybridColumns(table, req.body);
    values = { ...known, [pkProp]: req.params.id, data: extra };
    setOnConflict = { ...known, data: extra };
  }
  const [row] = await getDb()
    .insert(table)
    .values(values)
    .onConflictDoUpdate({ target: pkColumn(req.params.entity, table), set: setOnConflict })
    .returning();
  await emitDataChanged(req.params.entity, req.params.id, row?.organizationId ?? null);
  res.json(JSON_BLOB_ENTITIES.has(req.params.entity) ? flattenJsonRow(row) : row);
});

dataRouter.delete('/:entity/:id', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  const scope = scopeWhere(req.params.entity, table, req);
  const idEq = eq(pkColumn(req.params.entity, table), req.params.id);
  const where = scope ? and(idEq, scope) : idEq;
  // .returning() ANTES de perder a linha — sem isso, organizationId vira null no evento
  // e o socket emite pro grupo 'global' em vez da room certa.
  const [deleted] = await getDb().delete(table).where(where).returning();
  await emitDataChanged(req.params.entity, req.params.id, deleted?.organizationId ?? null);
  res.status(204).end();
});
