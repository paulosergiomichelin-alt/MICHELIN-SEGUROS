# Fase 1 — Schema Postgres + API Genérica de Dados + Autenticação + Tempo Real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o schema Drizzle completo no Neon, uma API HTTP genérica autenticada que substitui o acesso direto do browser ao Firestore, e a infraestrutura de tempo real via Socket.IO — tudo isso rodando em paralelo ao sistema Firestore existente (nada é desligado nesta fase).

**Architecture:** Rotas montadas em `server.ts` sob `/api/data/*`, protegidas por um middleware que valida o Firebase ID Token (JWKS do Google, sem depender do `firebase-admin`). Toda escrita bem-sucedida dispara `emitDataChanged` via Socket.IO. `DataService.ts` continua intocado até a Fase 2 — esta fase só constrói o que ele vai consumir.

**Tech Stack:** Drizzle ORM, `jose` (verificação de JWT), Socket.IO (já existente via `socketRegistry.ts`).

**Spec:** `docs/db-migration/SPEC.md` (seções 3, 4, 5, 6)

## Global Constraints

- IDs Firestore são preservados como `text` (ADR-8 da spec) — nenhuma tabela usa `serial`/`uuid` gerado para entidades que já existem no Firestore hoje.
- Toda rota nova exige um Firebase ID Token válido no header `Authorization: Bearer <token>` — sem exceção, mesmo em dev.
- Nenhuma rota desta fase é chamada por `DataService.ts` ou qualquer componente ainda — isso só acontece na Fase 2. Esta fase é validada por scripts de smoke-test manuais (`curl`), não pela UI.
- **Achado de segurança pré-existente relevante**: as rotas `_api/**` atuais não validam ID token — isso é aceitável para o Firestore porque `firestore.rules` cobre o acesso direto do browser. A nova API desta fase substitui exatamente esse boundary, então autenticação aqui não é opcional.

---

### Task 1: Schema Drizzle completo (tradução do DDL da spec)

**Files:**
- Create: `_api/db/schema/core.ts` (organizations, users, access_profiles)
- Create: `_api/db/schema/leads.ts` (leads, messages, notifications, follow_ups, flows, learning_memory)
- Create: `_api/db/schema/audit.ts` (audit_logs, system_logs, migration_logs, dead_letter_queue, processing_locks)
- Create: `_api/db/schema/metrics.ts` (system_metrics_dashboard, lead_status_counts, metrics_raw, metrics_users, metrics_daily)
- Create: `_api/db/schema/clientes.ts` (seguradoras, clientes, cliente_apolices, cliente_historico, cliente_relacionamentos)
- Create: `_api/db/schema/whatsapp.ts` (whatsapp_sessions, whatsapp_conversations, whatsapp_messages)
- Create: `_api/db/schema/campaigns-email.ts` (campaigns, campaign_log, email_accounts, email_settings)
- Create: `_api/db/schema/tenant-nfse.ts` (platform_agent_templates, platform_guardrails, tenant_agent_configs, tenant_onboarding_wizard_state, nfse_documents, nfse_logs)
- Create: `_api/db/schema/settings.ts` (settings, config — ver SPEC.md §4.13, adicionado numa revisão de correção)
- Create: `_api/db/schema/index.ts` (re-exporta tudo)

**Interfaces:**
- Consumes: DDL completo em `docs/db-migration/SPEC.md` §4 (fonte de verdade — cada tabela abaixo é tradução 1:1).
- Produces: objetos de tabela Drizzle (`leads`, `users`, `organizations`, etc.) importados por toda a Fase 1 em diante (Task 5 deste plano e todas as fases seguintes).

- [ ] **Passo 1: Escrever `core.ts` (padrão de referência — todas as demais tabelas seguem esta mesma tradução de tipos)**

```ts
// _api/db/schema/core.ts
import { pgTable, text, boolean, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  nomeRazaoSocial: text('nome_razao_social').notNull(),
  nomeFantasia: text('nome_fantasia'),
  cnpj: text('cnpj').notNull(),
  emailCorporativo: text('email_corporativo').notNull(),
  telefone: text('telefone'),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  planoSaas: text('plano_saas').notNull(),
  limiteUsuarios: integer('limite_usuarios').notNull(),
  limiteLeadsMes: integer('limite_leads_mes').notNull(),
  limiteStorageMb: integer('limite_storage_mb').notNull(),
  status: text('status').notNull(),
  trialExpiraEm: timestamp('trial_expira_em', { withTimezone: true }),
  timezone: text('timezone').notNull(),
  idioma: text('idioma').notNull(),
  ownerUserId: text('owner_user_id'),
  configuracoes: jsonb('configuracoes').notNull().default({}),
  fiscalSettings: jsonb('fiscal_settings'),
  certificate: jsonb('certificate'),
  fiscalServices: jsonb('fiscal_services'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  role: text('role').notNull(),
  userType: text('user_type').notNull(),
  profileId: text('profile_id'),
  permissions: jsonb('permissions').notNull(),
  cargo: text('cargo'),
  photoUrl: text('photo_url'),
  status: text('status').notNull(),
  onboardingCompleted: boolean('onboarding_completed'),
  metrics: jsonb('metrics'),
  activity: jsonb('activity'),
  theme: text('theme'),
  chatPreferences: jsonb('chat_preferences'),
  superadmin: boolean('superadmin').notNull().default(false),
  lastAccess: timestamp('last_access', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accessProfiles = pgTable('access_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  leadVisibility: text('lead_visibility').notNull(),
  permissions: jsonb('permissions').notNull(),
  menuPermissions: jsonb('menu_permissions').notNull().default([]),
  fieldPermissions: jsonb('field_permissions').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

> `drizzle-orm/pg-core` não exporta um tipo `timestamptz` — o import acima já está corrigido para `{ pgTable, text, boolean, integer, jsonb, timestamp }`; todo campo `timestamptz` do DDL SQL usa `timestamp('col', { withTimezone: true })`.

- [ ] **Passo 2: Escrever as 7 tabelas restantes de arquivos seguindo o mesmo mapeamento de tipos**

Tabela de tradução (aplicar mecanicamente a cada `CREATE TABLE` de `SPEC.md` §4 que ainda não foi feito):

| SQL (spec) | Drizzle |
|---|---|
| `text` | `text('col_name')` |
| `text PRIMARY KEY` | `text('col_name').primaryKey()` |
| `text REFERENCES outra(id)` | `text('col_name').references(() => outra.id)` |
| `timestamptz` | `timestamp('col_name', { withTimezone: true })` |
| `timestamptz NOT NULL DEFAULT now()` | `timestamp('col_name', { withTimezone: true }).notNull().defaultNow()` |
| `jsonb` | `jsonb('col_name')` |
| `integer` | `integer('col_name')` |
| `numeric` | `numeric('col_name')` |
| `boolean` | `boolean('col_name')` |
| `date` | `date('col_name')` |
| `bigserial PRIMARY KEY` | `bigserial('col_name', { mode: 'number' }).primaryKey()` |
| `NOT NULL` | `.notNull()` |
| `DEFAULT 'x'` | `.default('x')` |
| PK composta (`PRIMARY KEY (a, b)`) | `, (t) => ({ pk: primaryKey({ columns: [t.a, t.b] }) })` como segundo argumento de `pgTable` |

**Convenção de nome da variável Drizzle exportada**: sempre o `camelCase` do nome exato da tabela em `SPEC.md` §4 — ex.: `cliente_apolices` → `clienteApolices`, `whatsapp_conversations` → `whatsappConversations`, `campaign_log` → `campaignLog`, `lead_status_counts` → `leadStatusCounts`, `tenant_agent_configs` → `tenantAgentConfigs`. Essa é a convenção que o `ENTITY_TABLE` (Passo 1 da Task 4) e todas as fases seguintes assumem — não inventar variação.

Criar, tabela por tabela, exatamente na ordem e com os nomes de coluna listados em `SPEC.md` §4.2 a §4.13 — todas as 29 tabelas restantes (`leads`, `messages`, `notifications`, `follow_ups`, `flows`, `learning_memory`, `audit_logs`, `system_logs`, `system_metrics_dashboard`, `lead_status_counts`, `metrics_raw`, `metrics_users`, `metrics_daily`, `dead_letter_queue`, `migration_logs`, `processing_locks`, `seguradoras`, `clientes`, `cliente_apolices`, `cliente_historico`, `cliente_relacionamentos`, `whatsapp_sessions`, `whatsapp_conversations`, `whatsapp_messages`, `campaigns`, `campaign_log`, `email_accounts`, `email_settings`, `platform_agent_templates`, `platform_guardrails`, `tenant_agent_configs`, `tenant_onboarding_wizard_state`, `nfse_documents`, `nfse_logs`, `settings`, `config`), nos arquivos indicados na seção **Files** acima.

**Atenção à dependência circular `leads` ↔ `clientes`** (SPEC.md §4.2/§4.7): ao traduzir essas duas tabelas, `leads.clienteId` e `clientes.leadOrigemId` NÃO usam `.references()` inline — são `text('cliente_id')` / `text('lead_origem_id')` simples. As duas FKs são adicionadas numa migration separada gerada depois (Drizzle: uma segunda chamada a `db:generate` depois de editar o schema adicionando `.references()` nos dois campos e regenerando, ou um SQL manual de `ALTER TABLE` na pasta `drizzle/`) — nunca as duas `.references()` inline ao mesmo tempo, ou o `db:push`/`db:generate` falha por dependência circular entre os dois arquivos de schema.

- [ ] **Passo 3: Criar `index.ts` reexportando tudo**

```ts
// _api/db/schema/index.ts
export * from './core';
export * from './leads';
export * from './audit';
export * from './metrics';
export * from './clientes';
export * from './whatsapp';
export * from './campaigns-email';
export * from './tenant-nfse';
export * from './settings';
```

- [ ] **Passo 4: Atualizar `_api/lib/db.ts` para usar o schema**

```diff
- import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
+ import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
+ import * as schema from '../db/schema';
  ...
-   _db = drizzle(sql);
+   _db = drizzle(sql, { schema });
```

- [ ] **Passo 5: Gerar a migration SQL**

Run: `npm run db:generate`
Expected: cria `drizzle/0000_<nome>.sql` com todos os `CREATE TABLE` — abrir o arquivo gerado e comparar manualmente contra `SPEC.md` §4, tabela por tabela, confirmando que nenhuma foi esquecida (35 tabelas no total, contando `lead_status_counts`, `system_metrics_dashboard`, `settings` e `config` separadamente). As duas FKs circulares (`leads.cliente_id`, `clientes.lead_origem_id`) NÃO devem aparecer nesta primeira migration — confirmar que o SQL gerado cria as duas tabelas sem essas duas constraints.

- [ ] **Passo 6: Aplicar no Neon**

Run: `npm run db:push`
Expected: confirma a criação das 35 tabelas sem erro. Verificar com `npm run db:studio` (abre UI local do Drizzle Studio) que todas aparecem.

- [ ] **Passo 6b: Adicionar as duas FKs circulares numa segunda migration, como `DEFERRABLE INITIALLY DEFERRED`**

Editar `leads.ts` e `clientes.ts` acrescentando `.references(() => clientes.id)` em `clienteId` e `.references(() => leads.id)` em `leadOrigemId` respectivamente (agora que as duas tabelas já existem no schema TypeScript, o Drizzle consegue resolver a referência circular entre os dois módulos por import). Drizzle não expõe `DEFERRABLE` diretamente na API do `.references()` — depois de rodar `npm run db:generate` (que gera uma SEGUNDA migration SQL só com os dois `ALTER TABLE ... ADD CONSTRAINT`), editar manualmente o arquivo `.sql` gerado em `drizzle/` acrescentando `DEFERRABLE INITIALLY DEFERRED` ao final de cada um dos dois `ADD CONSTRAINT` (ver SPEC.md §4.2, a razão é dados de produção com ciclos reais lead↔cliente — sem isso a Fase 5 trava). Rodar `npm run db:push` para aplicar a migration editada.

- [ ] **Passo 7: Commit**

```bash
git add _api/db/schema drizzle _api/lib/db.ts
git commit -m "feat: schema Drizzle completo das 35 tabelas Postgres (paridade com Firestore)"
```

---

### Task 2: Middleware de autenticação (Firebase ID Token sem firebase-admin)

**Files:**
- Create: `_api/lib/verifyFirebaseToken.ts`
- Test: manual (Passo 4)

**Interfaces:**
- Produces: `export async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email?: string } >` — lança erro se inválido/expirado. Consumido pela Task 4 (middleware Express) e por qualquer rota autenticada das fases seguintes.

- [ ] **Passo 1: Instalar `jose`**

Run: `npm install jose`

- [ ] **Passo 2: Implementar verificação via JWKS do Google**

```ts
// _api/lib/verifyFirebaseToken.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const FIREBASE_PROJECT_ID = 'gen-lang-client-0929974546'; // mesmo PROJECT_ID de _api/lib/adminFirebase.ts

export async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email?: string }> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
  if (!payload.sub) throw new Error('Token sem subject (uid)');
  return { uid: payload.sub, email: payload.email as string | undefined };
}
```

- [ ] **Passo 3: Middleware Express**

```ts
// _api/lib/authMiddleware.ts
import { verifyFirebaseToken } from './verifyFirebaseToken';

export async function requireAuth(req: any, res: any, next: any) {
  const header = req.headers.authorization as string | undefined;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const { uid, email } = await verifyFirebaseToken(token);
    req.userId = uid;
    req.userEmail = email;
    next();
  } catch (e: any) {
    return res.status(401).json({ error: 'Token inválido', details: e.message });
  }
}
```

- [ ] **Passo 4: Verificação manual**

No frontend (console do browser, já logado): `await auth.currentUser.getIdToken()` → copiar o token. Depois:

```bash
curl -H "Authorization: Bearer <token-copiado>" http://localhost:3001/api/data/_whoami
```

(A rota `/api/data/_whoami` é criada no Passo 5 da Task 4 abaixo — só para smoke-test deste middleware. Esperado: `{ "uid": "<uid-do-usuario>" }`. Sem header ou com token expirado, esperado `401`.)

- [ ] **Passo 5: Commit**

```bash
git add _api/lib/verifyFirebaseToken.ts _api/lib/authMiddleware.ts
git commit -m "feat: middleware de autenticação via Firebase ID Token (JWKS, sem firebase-admin)"
```

---

### Task 3: Módulo neutro de query constraints (substitui `where/orderBy/limit/startAfter` do Firestore)

**Files:**
- Create: `src/lib/queryConstraints.ts`

**Interfaces:**
- Produces: `where(field, op, value)`, `orderBy(field, direction?)`, `limit(n)`, `startAfter(cursor)` — **mesma assinatura posicional** que `firebase/firestore` usa hoje, para que o `import` seja a única linha alterada nos ~19 arquivos listados em `docs/db-migration/INVENTORY.md` seção A. Consumido por `DataService.ts` (Fase 2, Task de tradução SQL) e diretamente pelos call-sites.

- [ ] **Passo 1: Implementar**

```ts
// src/lib/queryConstraints.ts
export type ConstraintOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';

export type QueryConstraint =
  | { kind: 'where'; field: string; op: ConstraintOp; value: unknown }
  | { kind: 'orderBy'; field: string; direction: 'asc' | 'desc' }
  | { kind: 'limit'; n: number }
  | { kind: 'startAfter'; cursor: unknown };

export function where(field: string, op: ConstraintOp, value: unknown): QueryConstraint {
  return { kind: 'where', field, op, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return { kind: 'orderBy', field, direction };
}

export function limit(n: number): QueryConstraint {
  return { kind: 'limit', n };
}

export function startAfter(cursor: unknown): QueryConstraint {
  return { kind: 'startAfter', cursor };
}
```

- [ ] **Passo 2: Verificar que compila isolado**

Run: `npx tsc --noEmit src/lib/queryConstraints.ts` (ou deixar para o build geral do projeto verificar — arquivo não depende de nada externo, risco de erro de tipo é baixo).

- [ ] **Passo 3: Commit**

```bash
git add src/lib/queryConstraints.ts
git commit -m "feat: módulo neutro de query constraints (substitui firebase/firestore where/orderBy/limit)"
```

---

### Task 4: Tradutor de constraints → SQL + API genérica de dados

**Files:**
- Create: `_api/data/constraintsToSql.ts`
- Create: `_api/data/router.ts`
- Modify: `server.ts` (montar o router)

**Interfaces:**
- Consumes: `QueryConstraint[]` (mesmo shape da Task 3), schema Drizzle da Task 1, `requireAuth` da Task 2.
- Produces: rotas HTTP:
  - `GET /api/data/_whoami` (smoke test da Task 2)
  - `GET /api/data/:entity/:id`
  - `POST /api/data/:entity/query` (body `{ constraints: QueryConstraint[] }` — cursor de paginação vai DENTRO de `constraints` como um item `{kind:'startAfter', cursor}`, produzido por `startAfter()` de `queryConstraints.ts`; não existe um campo `paginate` separado no body)
  - `POST /api/data/:entity` (body = payload de criação)
  - `PATCH /api/data/:entity/:id` (body = updates parciais)
  - `PUT /api/data/:entity/:id` (body = payload completo, upsert — equivalente a `save`)
  - `DELETE /api/data/:entity/:id`
  Estas 6 rotas (+ smoke test) são o contrato exato que a Fase 2 (`DataService.ts`) vai chamar via `fetch`.

- [ ] **Passo 1: Mapear nome de entidade → tabela Drizzle (mesma ideia do `COLLECTION_MAP` do `DataService.ts:62-102`)**

```ts
// _api/data/entityMap.ts
import * as schema from '../db/schema';

export const ENTITY_TABLE: Record<string, any> = {
  leads: schema.leads, lead: schema.leads,
  users: schema.users, user: schema.users,
  access_profiles: schema.accessProfiles, access_profile: schema.accessProfiles,
  audit_logs: schema.auditLogs, audit_log: schema.auditLogs,
  system_logs: schema.systemLogs, system_log: schema.systemLogs,
  notifications: schema.notifications, notification: schema.notifications,
  messages: schema.messages, message: schema.messages,
  follow_ups: schema.followUps, follow_up: schema.followUps,
  flows: schema.flows, flow: schema.flows,
  learning_memory: schema.learningMemory,
  dead_letter_queue: schema.deadLetterQueue,
  migration_logs: schema.migrationLogs,
  processing_locks: schema.processingLocks,
  empresas: schema.organizations, empresa: schema.organizations,
  clientes: schema.clientes, cliente: schema.clientes,
  cliente_relacionamentos: schema.clienteRelacionamentos, cliente_relacionamento: schema.clienteRelacionamentos,
  seguradoras: schema.seguradoras, seguradora: schema.seguradoras,
  whatsapp_sessions: schema.whatsappSessions, whatsapp_session: schema.whatsappSessions,
  whatsapp_conversations: schema.whatsappConversations, whatsapp_conversation: schema.whatsappConversations,
  whatsapp_messages: schema.whatsappMessages, whatsapp_message: schema.whatsappMessages,
  campaigns: schema.campaigns, campaign: schema.campaigns,
  campaign_log: schema.campaignLog,
  settings: schema.settings,
  config: schema.config,
};
```

> Lista replicada de `DataService.COLLECTION_MAP` (`src/services/DataService.ts:62-102`) — as ~15 entidades que passam pelo `DataService`. Entidades da Fase 3 (clientes/apolices/historico, templates, nfse) recebem suas próprias rotas dedicadas depois, não entram neste mapa genérico se tiverem lógica de negócio própria (ex.: `cliente_apolices` é subordinado a `clientes`, tratado na Fase 3).

- [ ] **Passo 2: Tradutor de constraints**

```ts
// _api/data/constraintsToSql.ts
import { and, asc, desc, eq, ne, gt, gte, lt, lte, inArray, sql } from 'drizzle-orm';
import type { QueryConstraint } from '../../src/lib/queryConstraints';

const OP_MAP: Record<string, (col: any, value: any) => any> = {
  '==': eq, '!=': ne, '<': lt, '<=': lte, '>': gt, '>=': gte,
  in: (col, value) => inArray(col, value as any[]),
  'array-contains': (col, value) => sql`${col} @> ${JSON.stringify([value])}::jsonb`,
};

// Só a tabela `leads` tem a coluna de cauda longa `data jsonb` (ADR-7 — schema híbrido é
// específico dela, ver SPEC.md §4.2). Em qualquer outra tabela, um campo que não é coluna
// promovida É UM ERRO DE CHAMADA (nome de campo errado ou faltando promover a coluna), não
// um caso a resolver silenciosamente — resolveField lança nesse caso em vez de gerar SQL inválido.
function resolveField(table: any, field: string) {
  if (table[field]) return table[field];
  if (table.data) return sql`${table.data}->>${field}`;
  throw new Error(`Campo "${field}" não é coluna de "${table}" e esta tabela não tem coluna "data" jsonb de fallback.`);
}

export function buildWhere(table: any, constraints: QueryConstraint[]) {
  const wheres = constraints
    .filter((c): c is QueryConstraint & { kind: 'where' } => c.kind === 'where')
    .map(c => OP_MAP[c.op](resolveField(table, c.field), c.value));
  return wheres.length ? and(...wheres) : undefined;
}

// Retorna a constraint raw (não só o SQL já montado) porque o router precisa do `field` e
// `direction` originais para também montar a comparação de cursor do startAfter (keyset
// pagination) — ver Passo 3.
export function getOrderByConstraint(constraints: QueryConstraint[]) {
  return constraints.find((c): c is QueryConstraint & { kind: 'orderBy' } => c.kind === 'orderBy');
}

export function buildOrderBy(table: any, constraints: QueryConstraint[]) {
  const ob = getOrderByConstraint(constraints);
  if (!ob) return undefined;
  const col = resolveField(table, ob.field);
  return ob.direction === 'desc' ? desc(col) : asc(col);
}

export function getLimit(constraints: QueryConstraint[]): number | undefined {
  return constraints.find((c): c is QueryConstraint & { kind: 'limit' } => c.kind === 'limit')?.n;
}

export function getStartAfter(constraints: QueryConstraint[]): unknown | undefined {
  return constraints.find((c): c is QueryConstraint & { kind: 'startAfter' } => c.kind === 'startAfter')?.cursor;
}

// Keyset pagination: "depois do cursor" na direção do orderBy ativo. Sem orderBy, startAfter
// não tem significado (paginação por cursor exige uma ordem estável) — o router ignora
// startAfter se não houver orderBy junto, em vez de falhar silenciosamente.
export function buildStartAfter(table: any, constraints: QueryConstraint[]) {
  const cursor = getStartAfter(constraints);
  const ob = getOrderByConstraint(constraints);
  if (cursor === undefined || !ob) return undefined;
  const col = resolveField(table, ob.field);
  return ob.direction === 'desc' ? lt(col, cursor) : gt(col, cursor);
}
```

- [ ] **Passo 3: Router genérico**

```ts
// _api/data/router.ts
import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { requireAuth } from '../lib/authMiddleware';
import { ENTITY_TABLE } from './entityMap';
import { buildWhere, buildOrderBy, buildStartAfter, getLimit } from './constraintsToSql';
import { emitDataChanged } from '../lib/realtimeBus'; // criado na Task 5

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
  // (Fase 2 ORG_SCOPED_ENTITIES) e o socket emite pro grupo 'global' em vez da room certa,
  // então quem estava com uma tela aberta daquela org não vê a exclusão em tempo real.
  const [deleted] = await getDb().delete(table).where(eq(table.id, req.params.id)).returning();
  await emitDataChanged(req.params.entity, req.params.id, deleted?.organizationId ?? null);
  res.status(204).end();
});
```

> Autorização por papel/organização (o que hoje `DataService.checkPermissions`/`applyVisibilityConstraints`/`TenantIsolationService` fazem no cliente) **não está neste router genérico ainda** — nesta fase o router só autentica (sabe quem é o usuário). A tarefa de portar as regras de permissão/isolamento por tenant para o servidor é o primeiro passo da Fase 2 (não pode ser adiada: hoje essas regras vivem só no browser, que deixa de ser a fronteira de confiança).

- [ ] **Passo 4: Montar o router em `server.ts`**

```ts
// server.ts — próximo ao bloco de rotas de webhook/campaigns existentes
const { dataRouter } = await import('./_api/data/router.js');
app.use('/api/data', dataRouter);
```

- [ ] **Passo 5: Smoke test manual completo**

```bash
TOKEN="<id-token-copiado-do-browser>"
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/data/_whoami
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"test-org-1","nomeRazaoSocial":"Teste","cnpj":"00000000000000","emailCorporativo":"a@a.com","slug":"teste-1","planoSaas":"basico","limiteUsuarios":1,"limiteLeadsMes":1,"limiteStorageMb":1,"status":"trial","timezone":"America/Sao_Paulo","idioma":"pt-BR"}' \
  http://localhost:3001/api/data/empresas
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/data/empresas/test-org-1
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/data/empresas/test-org-1
```
Expected: cada chamada retorna sucesso (200/201/204) e o `GET` final (antes do delete) retorna o registro criado.

- [ ] **Passo 6: Commit**

```bash
git add _api/data server.ts
git commit -m "feat: API HTTP genérica de dados (get/query/create/update/upsert/delete) sobre Postgres"
```

---

### Task 5: Barramento de tempo real (Socket.IO)

**Files:**
- Create: `_api/lib/realtimeBus.ts`

**Interfaces:**
- Produces: `export async function emitDataChanged(entity: string, id: string, organizationId: string | null): Promise<void>` — chamado pela Task 4 (já usado no Passo 3 acima) e, a partir da Fase 3, por todo serviço portado que grava em Postgres.
- Consumes: `getIo()` de `_api/lib/socketRegistry.ts` (infraestrutura já existente).

- [ ] **Passo 1: Implementar**

```ts
// _api/lib/realtimeBus.ts
import { getIo } from './socketRegistry';

export async function emitDataChanged(entity: string, id: string, organizationId: string | null): Promise<void> {
  const io = getIo();
  if (!io) return; // servidor de dev sem socket ativo — não é erro fatal
  const room = organizationId ? `org:${organizationId}` : 'global';
  io.to(room).emit('data:changed', { entity, id, organizationId });
}
```

- [ ] **Passo 2: Garantir que clientes entram na room da própria organização**

Verificar em `server.ts` o handler `io.on('connection', ...)` existente (usado hoje pelo WhatsApp) e adicionar, se ainda não existir, um evento de join:

```ts
// server.ts — dentro do handler de conexão Socket.IO existente
socket.on('join:org', (organizationId: string) => {
  socket.join(`org:${organizationId}`);
});
```

- [ ] **Passo 3: Verificação manual**

Com dois terminais: um rodando `npm run dev:server`, outro conectando via `socket.io-client` num script rápido (`node -e "..."` com `io('http://localhost:3001')`, emitindo `join:org` e escutando `data:changed`), disparar o `POST /api/data/empresas` do smoke test da Task 4 e confirmar que o evento chega no segundo terminal.

- [ ] **Passo 4: Commit**

```bash
git add _api/lib/realtimeBus.ts server.ts
git commit -m "feat: barramento de eventos data:changed via Socket.IO para substituir onSnapshot"
```

---

## Self-Review desta fase

- Cobertura da spec: schema (§4) → Task 1; tradução de semântica (§5, parcial — increment/merge ficam para quem escreve, tratados na Fase 2/3 caso a caso) → Task 4; tempo real (§6) → Task 5; autenticação (novo requisito descoberto, não estava na spec original mas é bloqueante) → Task 2.
- Risco identificado durante a escrita deste plano, não na spec original: o router genérico da Task 4 **não reimplementa isolamento multi-tenant/permissões** — isso é responsabilidade explícita da primeira tarefa da Fase 2, registrado para não ser esquecido.
- Próxima fase: `2026-09-10-pg-migration-02-dataservice-cutover.md`.
