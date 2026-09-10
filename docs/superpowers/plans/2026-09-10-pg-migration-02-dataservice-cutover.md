# Fase 2 — Cutover do `DataService` para Postgres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `DataService.ts` (o hub genérico usado por ~30 arquivos) parar de falar com o Firestore e passar a falar com a API criada na Fase 1 — sem mudar nenhuma assinatura pública, para que nenhum dos call-sites precise ser reescrito (só o import de `where/orderBy/limit/startAfter` muda, mecanicamente).

**Architecture:** `DataService` passa a usar um client HTTP fino (`src/lib/dataApiClient.ts`) em vez do SDK `firebase/firestore`. Isolamento multi-tenant e permissões, que hoje só existem no browser, ganham um espelho server-side (obrigatório — ver risco registrado na Fase 1). Tempo real via Socket.IO + polling de segurança (ADR-5 da spec).

**Tech Stack:** `fetch` nativo, `socket.io-client` (já é dependência do projeto).

**Spec:** `docs/db-migration/SPEC.md` (ADR-3, ADR-4, ADR-5, seção 6); `docs/db-migration/INVENTORY.md` seção A.

## Global Constraints

- `DataService.ts` mantém EXATAMENTE as mesmas assinaturas públicas listadas em `docs/db-migration/INVENTORY.md` seção A (`get/list/listPaginated/create/update/delete/save/subscribe/subscribeCollection/getFromServer/listFromServer`). Qualquer mudança de assinatura é bug, não refactor.
- Todo call-site que hoje importa `where/orderBy/limit/startAfter` de `firebase/firestore` passa a importar de `src/lib/queryConstraints.ts` — sem alterar a lógica de quem chama.
- Corte controlado por `USE_POSTGRES`/`VITE_USE_POSTGRES` (Fase 0, Task 5): enquanto `false`, `DataService` continua usando Firestore; quando `true`, usa a API nova. Isso permite testar em dev sem afetar produção.

---

### Task 1: Isolamento multi-tenant e permissões no servidor

**Files:**
- Create: `_api/data/tenantMiddleware.ts`
- Modify: `_api/data/router.ts` (Fase 1)

**Interfaces:**
- Consumes: `req.userId` (da Task 2 de auth da Fase 1), tabela `users` (Drizzle).
- Produces: `req.organizationId`, `req.userRole`, `req.userPermissions` — disponíveis em toda rota depois deste middleware; o router genérico usa `req.organizationId` para filtrar automaticamente entidades org-scoped, fechando o gap registrado no self-review da Fase 1.

- [ ] **Passo 1: Implementar o middleware**

```ts
// _api/data/tenantMiddleware.ts
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { users } from '../db/schema';

export async function loadTenantContext(req: any, res: any, next: any) {
  const [profile] = await getDb().select().from(users).where(eq(users.id, req.userId));
  if (!profile) return res.status(403).json({ error: 'Usuário sem perfil cadastrado' });
  req.organizationId = profile.organizationId;
  req.userRole = profile.role;
  req.userPermissions = profile.permissions;
  next();
}

// Mesma lista de DataService.ts:47-58 (ORG_SCOPED_ENTITIES) — mantida em paridade.
export const ORG_SCOPED_ENTITIES = new Set([
  'leads', 'lead', 'users', 'user', 'messages', 'message',
  'notifications', 'notification', 'flows', 'flow',
  'follow_ups', 'follow_up', 'empresas', 'empresa',
  'clientes', 'cliente',
  'whatsapp_sessions', 'whatsapp_session',
  'whatsapp_conversations', 'whatsapp_conversation',
  'whatsapp_messages', 'whatsapp_message',
  'cliente_relacionamentos', 'cliente_relacionamento',
]);
```

- [ ] **Passo 2: Aplicar o filtro automático no router genérico**

```diff
  // _api/data/router.ts
+ import { loadTenantContext, ORG_SCOPED_ENTITIES } from './tenantMiddleware';
+ dataRouter.use(loadTenantContext);

  dataRouter.post('/:entity/query', async (req: any, res) => {
    const table = resolveTable(req.params.entity, res); if (!table) return;
    const constraints = req.body.constraints ?? [];
-   let q = getDb().select().from(table).where(buildWhere(table, constraints));
+   const userWhere = buildWhere(table, constraints);
+   const orgWhere = ORG_SCOPED_ENTITIES.has(req.params.entity) && table.organizationId
+     ? eq(table.organizationId, req.organizationId) : undefined;
+   let q = getDb().select().from(table).where(orgWhere && userWhere ? and(orgWhere, userWhere) : (orgWhere ?? userWhere));
    ...
```

(Aplicar o mesmo padrão de combinar `orgWhere` em `GET /:entity/:id` — retornar 404 se o registro existe mas pertence a outra organização, não 403, para não revelar existência do dado.)

- [ ] **Passo 3: Bloquear escrita cross-tenant**

```ts
// _api/data/router.ts — POST/PATCH/PUT
dataRouter.post('/:entity', async (req: any, res) => {
  const table = resolveTable(req.params.entity, res); if (!table) return;
  if (ORG_SCOPED_ENTITIES.has(req.params.entity) && table.organizationId) {
    if (req.body.organizationId && req.body.organizationId !== req.organizationId) {
      return res.status(403).json({ error: 'organizationId do payload não corresponde ao usuário autenticado' });
    }
    req.body.organizationId = req.organizationId;
  }
  // ... resto igual à Fase 1
});
```

- [ ] **Passo 4: Verificação manual — dois usuários, duas orgs**

Criar (via smoke test da Fase 1) duas orgs e um usuário em cada uma (inserir direto via `db:studio` para o teste). Repetir os `curl` de leitura/escrita da Fase 1 Task 4 Passo 5 usando o token do usuário da org A tentando ler/escrever um registro da org B.
Expected: leitura retorna 404, escrita com `organizationId` da org B retorna 403.

- [ ] **Passo 5: Commit**

```bash
git add _api/data/tenantMiddleware.ts _api/data/router.ts
git commit -m "feat: isolamento multi-tenant obrigatório no servidor (antes só existia no browser)"
```

---

### Task 2: Client HTTP (`src/lib/dataApiClient.ts`)

**Files:**
- Create: `src/lib/dataApiClient.ts`

**Interfaces:**
- Consumes: `auth` de `src/lib/firebase.ts` (só para obter o ID token — Auth continua no Firebase).
- Produces: `get(entity, id)`, `query(entity, constraints)`, `create(entity, data)`, `update(entity, id, data)`, `save(entity, id, data)`, `remove(entity, id)` — usados exclusivamente por `DataService.ts` na Task 3.

- [ ] **Passo 1: Implementar**

```ts
// src/lib/dataApiClient.ts
import { auth } from './firebase';
import type { QueryConstraint } from './queryConstraints';

async function authHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Usuário não autenticado');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handle(res: Response) {
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`API /api/data respondeu ${res.status}: ${await res.text()}`);
  return res.json();
}

export const dataApiClient = {
  async get(entity: string, id: string) {
    const res = await fetch(`/api/data/${entity}/${id}`, { headers: await authHeader() });
    return handle(res);
  },
  async query(entity: string, constraints: QueryConstraint[] = []) {
    const res = await fetch(`/api/data/${entity}/query`, {
      method: 'POST', headers: await authHeader(), body: JSON.stringify({ constraints }),
    });
    return handle(res);
  },
  async create(entity: string, data: any) {
    const res = await fetch(`/api/data/${entity}`, {
      method: 'POST', headers: await authHeader(), body: JSON.stringify(data),
    });
    return handle(res);
  },
  async update(entity: string, id: string, data: any) {
    const res = await fetch(`/api/data/${entity}/${id}`, {
      method: 'PATCH', headers: await authHeader(), body: JSON.stringify(data),
    });
    return handle(res);
  },
  async save(entity: string, id: string, data: any) {
    const res = await fetch(`/api/data/${entity}/${id}`, {
      method: 'PUT', headers: await authHeader(), body: JSON.stringify(data),
    });
    return handle(res);
  },
  async remove(entity: string, id: string) {
    const res = await fetch(`/api/data/${entity}/${id}`, { method: 'DELETE', headers: await authHeader() });
    return handle(res);
  },
};
```

- [ ] **Passo 2: Commit**

```bash
git add src/lib/dataApiClient.ts
git commit -m "feat: client HTTP fino para a API genérica de dados"
```

---

### Task 3: Reescrever o núcleo CRUD de `DataService.ts`

**Files:**
- Modify: `src/services/DataService.ts:429-1090` (métodos `getFromServer`, `listFromServer`, `get`, `list`, `listPaginated`, `create`, `update`, `delete`, `save`)

**Interfaces:**
- Consumes: `dataApiClient` (Task 2), `USE_POSTGRES` (`src/lib/featureFlags.ts`, Fase 0).
- Produces: mesmas assinaturas já documentadas — nenhum consumidor externo muda.

- [ ] **Passo 1: `get`/`getFromServer`**

```diff
  static async get(entity: string, id: string): Promise<any | null> {
+   if (USE_POSTGRES) return dataApiClient.get(this.getCollectionName(entity), this.resolveDocId(entity, id));
    // ... implementação Firestore existente permanece como fallback abaixo do if
```

Repetir o mesmo padrão de guarda `if (USE_POSTGRES) { ...; return; }` no topo de cada um dos métodos listados em **Files**, preservando 100% da lógica Firestore existente abaixo (cache, permissões, auditoria) para o caso `USE_POSTGRES=false`. Isso é o mecanismo de rollback instantâneo da spec (seção 9) — não remover o código antigo nesta fase.

- [ ] **Passo 2: `list`/`listFromServer`/`listPaginated`**

```diff
  static async list(entity: string, constraints: QueryConstraint[] = []): Promise<any[]> {
+   if (USE_POSTGRES) return dataApiClient.query(this.getCollectionName(entity), constraints);
    // ... existente
```

`listPaginated` usa `constraints` + os parâmetros de paginação já existentes na assinatura atual (ver `DataService.ts:623`) — passar o cursor como um `startAfter` dentro do array de `constraints` (mesmo padrão que os call-sites já usam hoje, só que agora produzido por `src/lib/queryConstraints.ts`).

- [ ] **Passo 3: `create`/`update`/`delete`/`save`**

```diff
  static async create(entity: string, data: any, origin: AuditLog['origin'] = 'USUARIO'): Promise<string> {
    DataService.checkPermissions('CREATE', entity, data);
    const normalized = await DataService.normalizePayload(entity, data);
+   if (USE_POSTGRES) {
+     const created = await dataApiClient.create(this.getCollectionName(entity), normalized);
+     const log = DataService.generateAuditLog('CREATE', entity, created.id, null, created, origin);
+     if (log) await dataApiClient.create('audit_logs', log);
+     return created.id;
+   }
    // ... implementação Firestore existente
```

Aplicar o mesmo padrão (guarda `if (USE_POSTGRES)`, preservando `checkPermissions`/`normalizePayload`/`generateAuditLog` já existentes ANTES da guarda — essas validações continuam rodando no cliente independente do banco) em `update`, `delete` e `save`.

- [ ] **Passo 4: Verificação manual com `USE_POSTGRES=true`**

```bash
VITE_USE_POSTGRES=true npm run dev:only
```
No browser: criar um lead pela tela de cadastro existente, confirmar em `npm run db:studio` que a linha aparece na tabela `leads` do Neon com todos os campos esperados (promovidos + `data` jsonb com o resto). Editar o lead, confirmar `UPDATE`. Excluir, confirmar `DELETE`. Confirmar que uma linha correspondente aparece em `audit_logs` para cada operação.

- [ ] **Passo 5: Commit**

```bash
git add src/services/DataService.ts
git commit -m "feat: DataService fala com Postgres via feature flag USE_POSTGRES (get/list/create/update/delete/save)"
```

---

### Task 4: Tempo real — `subscribe`/`subscribeCollection`

**Files:**
- Modify: `src/services/DataService.ts:290-428` (`subscribe`, `subscribeCollection`)
- Create: `src/lib/realtimeSocket.ts`

**Interfaces:**
- Consumes: `socket.io-client`, `dataApiClient` (Task 2).
- Produces: mesmo contrato de retorno (`() => void` para cancelar a assinatura) que os ~19 call-sites do Inventory já esperam.

- [ ] **Passo 1: Cliente Socket.IO singleton**

```ts
// src/lib/realtimeSocket.ts
import { io, Socket } from 'socket.io-client';

let _socket: Socket | null = null;

export function getRealtimeSocket(organizationId: string): Socket {
  if (_socket) return _socket;
  _socket = io('/', { path: '/socket.io' }); // mesma infra já usada pelo WhatsApp
  _socket.on('connect', () => _socket!.emit('join:org', organizationId));
  return _socket;
}
```

- [ ] **Passo 2: `subscribe` (documento único)**

```diff
  static subscribe(entity: string, id: string, callback: (data: any) => void, forceRealtime = false, onError?: (err: any) => void): () => void {
+   if (USE_POSTGRES) {
+     let cancelled = false;
+     const orgId = DataService._lastOrgId;
+     const refetch = () => DataService.get(entity, id).then(d => !cancelled && callback(d)).catch(e => onError?.(e));
+     refetch();
+     const socket = orgId ? getRealtimeSocket(orgId) : null;
+     const handler = (evt: { entity: string; id: string }) => { if (evt.entity === DataService.getCollectionName(entity) && evt.id === id) refetch(); };
+     socket?.on('data:changed', handler);
+     const poll = setInterval(refetch, 45000);
+     return () => { cancelled = true; socket?.off('data:changed', handler); clearInterval(poll); };
+   }
    // ... implementação onSnapshot existente
```

- [ ] **Passo 3: `subscribeCollection` (query)**

Mesmo padrão do Passo 2, trocando `DataService.get(entity, id)` por `DataService.list(entity, constraints)` e o filtro do handler para `evt.entity === collectionName` (sem comparar `id`, já que é uma coleção).

- [ ] **Passo 4: Verificação manual — dois navegadores**

Abrir a mesma tela (ex.: Kanban de Leads) em duas janelas logadas na mesma organização. Editar um lead na janela A, confirmar que a janela B atualiza sem F5 dentro de 1-2 segundos (via socket) e, desligando o Socket.IO manualmente (DevTools → Network → offline), confirmar que ainda atualiza dentro de 45s (via polling de segurança).

- [ ] **Passo 5: Commit**

```bash
git add src/services/DataService.ts src/lib/realtimeSocket.ts
git commit -m "feat: subscribe/subscribeCollection via Socket.IO + polling de segurança (substitui onSnapshot)"
```

---

### Task 5: Agregados (`updateAggregates`) — endpoint de incremento dedicado

**Files:**
- Modify: `_api/data/router.ts`
- Modify: `src/services/DataService.ts:229-257`

**Interfaces:**
- Produces: `POST /api/data/_metrics/lead-status-count` (body `{ status: string; delta: number }`), `POST /api/data/_metrics/total-leads` (body `{ delta: number }`).

- [ ] **Passo 1: Rotas de incremento**

```ts
// _api/data/router.ts
import { sql, eq } from 'drizzle-orm';
import { leadStatusCounts, systemMetricsDashboard } from '../db/schema';

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
```

- [ ] **Passo 2: Adaptar `updateAggregates`**

```diff
  private static async updateAggregates(entity: string, before: any, after: any, isDelete = false) {
    if (entity !== 'lead') return;
+   if (USE_POSTGRES) {
+     const calls: Promise<any>[] = [];
+     if (!before && after) {
+       calls.push(dataApiClient.create('_metrics/lead-status-count' as any, { status: after.status || 'Novo Lead', delta: 1 }));
+       calls.push(dataApiClient.create('_metrics/total-leads' as any, { delta: 1 }));
+     } else if (before && !isDelete && after && before.status !== after.status) {
+       calls.push(dataApiClient.create('_metrics/lead-status-count' as any, { status: before.status || 'Novo Lead', delta: -1 }));
+       calls.push(dataApiClient.create('_metrics/lead-status-count' as any, { status: after.status || 'Novo Lead', delta: 1 }));
+     } else if (isDelete && before) {
+       calls.push(dataApiClient.create('_metrics/lead-status-count' as any, { status: before.status || 'Novo Lead', delta: -1 }));
+       calls.push(dataApiClient.create('_metrics/total-leads' as any, { delta: -1 }));
+     }
+     await Promise.all(calls).catch(e => console.warn('[DataService] Falha ao atualizar agregados:', e));
+     return;
+   }
    // ... implementação Firestore existente
```

> `dataApiClient.create` reaproveitado apenas como um `POST` genérico aqui (as rotas `_metrics/*` não passam pelo `resolveTable`/`ENTITY_TABLE` do router principal — confirmar na implementação real que a rota `_metrics/*` é registrada ANTES da rota `/:entity` no Express, senão `_metrics` é interpretado como valor de `:entity`).

- [ ] **Passo 3: Verificação manual**

Criar 3 leads com status diferentes, mudar o status de um deles, excluir outro. Confirmar em `db:studio` que `lead_status_counts` e `system_metrics_dashboard.total_leads` refletem os números corretos (equivalente ao dashboard atual).

- [ ] **Passo 4: Commit**

```bash
git add _api/data/router.ts src/services/DataService.ts
git commit -m "feat: agregados de métricas (total_leads/status_counts) via endpoints de incremento dedicados"
```

---

### Task 6: Troca mecânica de imports (`where`/`orderBy`/`limit`/`startAfter`)

**Files:** todos os listados em `docs/db-migration/INVENTORY.md` seção A (19 arquivos + `DataService.ts` + `TemplateService.ts`, este último só nesta troca de import — o resto de `TemplateService` é Fase 3).

**Interfaces:** nenhuma nova — troca de import puro.

- [ ] **Passo 1: Localizar todos os imports a trocar (estáticos, dinâmicos e type-only)**

```bash
grep -rn "from 'firebase/firestore'" src/contexts src/domains src/components src/services
grep -rn "await import('firebase/firestore')" src/domains   # pega o import dinâmico do LeadForm.tsx — a busca acima sozinha NÃO encontra esse padrão
```

Não filtrar só por `where|orderBy|limit|startAfter` — alguns arquivos (`QueryFingerprintService.ts`, `SubscriptionRegistry.ts`) importam apenas um **tipo** (`QueryConstraint`, `Unsubscribe`) sem usar nenhuma dessas funções, e ainda assim precisam trocar o import. Ver `docs/db-migration/INVENTORY.md` seção A para a lista completa já cross-checada, incluindo esses casos.

- [ ] **Passo 2: Para cada arquivo encontrado, trocar a linha de import (estático ou dinâmico)**

```diff
- import { where, orderBy, limit } from 'firebase/firestore';
+ import { where, orderBy, limit } from '../lib/queryConstraints'; // ajustar profundidade relativa por arquivo
```

```diff
  // src/domains/leads/LeadForm.tsx
- const { where } = await import('firebase/firestore');
+ const { where } = await import('../../lib/queryConstraints');
```

`SubscriptionRegistry.ts` é um caso diferente: importa só o tipo `Unsubscribe`, que `queryConstraints.ts` não define — trocar por um `type Unsubscribe = () => void;` local nesse arquivo, não por um import do módulo novo.

- [ ] **Passo 3: Confirmar que não sobrou nenhum import misto (ex.: arquivo que usa `where` E `getDoc` do Firestore direto — esses são candidatos à Fase 3, não desta tarefa)**

```bash
grep -rln "from 'firebase/firestore'" src/contexts src/domains src/components src/services
grep -rln "await import('firebase/firestore')" src/domains
```

(depois da troca, só devem aparecer os arquivos já mapeados na seção B do Inventory como "Firestore direto" — incluindo os 4 adicionados numa revisão de correção: `LoggerService.ts`, `MetricsService.ts`, `BatchCoordinatorService.ts`, `AdminTools.tsx`).

- [ ] **Passo 4: Build e typecheck**

Run: `npm run build`
Expected: build passa sem erro de tipo (as assinaturas de `queryConstraints.ts` são idênticas às do Firestore usadas antes).

- [ ] **Passo 5: Commit**

```bash
git add src/contexts src/domains src/components src/services
git commit -m "refactor: troca mecânica de imports where/orderBy/limit/startAfter para módulo neutro"
```

---

## Self-Review desta fase

- Toda a lista da seção A do Inventory tem uma tarefa correspondente (Task 6). Toda a lógica central do `DataService` (CRUD, realtime, agregados) tem tarefa própria (Tasks 3-5). O gap de isolamento multi-tenant identificado no self-review da Fase 1 é resolvido na Task 1 desta fase, antes de qualquer outra tarefa.
- Rollback: `USE_POSTGRES=false` a qualquer momento desta fase volta 100% para o comportamento Firestore, já que o código antigo nunca é removido aqui (só na Fase 6).
- Próxima fase: `2026-09-10-pg-migration-03-direct-services-port.md`.
