# Fase 3 — Porte dos serviços que ignoram o `DataService` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar os 9 serviços/componentes que hoje acessam o Firestore direto do browser sem passar pelo `DataService` (`docs/db-migration/INVENTORY.md` seção B), cada um virando consumidor da API HTTP da Fase 1 — reaproveitando o router genérico onde a entidade já é simples, e criando rotas dedicadas onde há lógica própria (subcoleções, locks, transações idempotentes).

**Architecture:** Entidades simples (empresas, clientes, templates, nfse, cliente_relacionamentos) entram no `ENTITY_TABLE` genérico da Fase 1 e os serviços passam a chamar `dataApiClient`/`DataService` em vez de `firebase/firestore` direto. Entidades com lógica própria (apólices/histórico como subcoleção, locks distribuídos, claim idempotente) ganham rotas dedicadas em `_api/data/`.

**Tech Stack:** mesmo stack das fases 1-2 (Drizzle, Express, `dataApiClient`).

**Spec:** `docs/db-migration/SPEC.md` §5 (tradução de `runTransaction`); `docs/db-migration/INVENTORY.md` seção B.

## Global Constraints

- Nenhum destes 9 serviços tem teste automatizado hoje — cada tarefa desta fase inclui um passo de verificação manual concreto (não "testar depois").
- `USE_POSTGRES` continua controlando o corte (mesma flag da Fase 2) para cada serviço, individualmente, até que todos estejam portados.

---

### Task 1: Registrar entidades simples no `ENTITY_TABLE` genérico

**Files:**
- Modify: `_api/data/entityMap.ts` (Fase 1)

**Interfaces:**
- Produces: as entidades abaixo passam a responder em `/api/data/:entity` como qualquer entidade do `DataService`, sem rota dedicada.

- [ ] **Passo 1: Adicionar ao mapa**

```diff
  export const ENTITY_TABLE: Record<string, any> = {
    // ... entidades da Fase 1
+   seguradoras: schema.seguradoras, seguradora: schema.seguradoras,
+   platform_agent_templates: schema.platformAgentTemplates,
+   platform_guardrails: schema.platformGuardrails,
+   tenant_agent_configs: schema.tenantAgentConfigs,
+   tenant_onboarding_wizard_state: schema.tenantOnboardingWizardState,
+   nfse_documents: schema.nfseDocuments,
+   nfse_logs: schema.nfseLogs,
  };
```

`clientes`/`cliente` e `cliente_relacionamentos` já estão no mapa desde a Fase 1 (Task 4) — confirmar que continuam lá.

- [ ] **Passo 2: Ajustar `ORG_SCOPED_ENTITIES` (`_api/data/tenantMiddleware.ts`, Fase 2 Task 1)**

```diff
  export const ORG_SCOPED_ENTITIES = new Set([
    // ... já existentes
+   'nfse_documents', 'nfse_logs',
  ]);
```

(`platform_agent_templates`, `platform_guardrails` são globais — não entram aqui, igual a `access_profiles`. `tenant_agent_configs`/`tenant_onboarding_wizard_state` já são chaveadas por `organization_id` como PK — o filtro de leitura usa `eq(table.organizationId, ...)` naturalmente, mas registrar em `ORG_SCOPED_ENTITIES` também para consistência.)

- [ ] **Passo 3: Verificação**

Run: `curl` de smoke test (mesmo padrão da Fase 1 Task 4 Passo 5) contra `/api/data/seguradoras` e `/api/data/nfse_documents` — criar, ler, deletar um registro de teste em cada.

- [ ] **Passo 4: Commit**

```bash
git add _api/data/entityMap.ts _api/data/tenantMiddleware.ts
git commit -m "feat: registra seguradoras/templates/guardrails/tenant-config/nfse na API genérica"
```

---

### Task 2: `EmpresaService.ts`

**Files:**
- Modify: `src/services/EmpresaService.ts`

**Interfaces:**
- Consumes: `DataService.get/create/update/subscribe` (já reescrito na Fase 2) para a entidade `empresas`.
- Produces: mesmas funções públicas de `EmpresaService` (CRUD de empresa + onboarding).

- [ ] **Passo 1: Localizar cada chamada Firestore direta**

Run: `grep -n "firebase/firestore\|doc(db\|collection(db\|onSnapshot" src/services/EmpresaService.ts`

- [ ] **Passo 2: Trocar leitura/escrita de documento único por `DataService`**

```diff
- import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
- import { db } from '../lib/firebase';
+ import { DataService } from './DataService';
  ...
- const snap = await getDoc(doc(db, 'empresas', id));
- return snap.exists() ? snap.data() : null;
+ return DataService.get('empresas', id);
  ...
- await setDoc(doc(db, 'empresas', id), data, { merge: true });
+ await DataService.save('empresas', id, data);
  ...
- return onSnapshot(doc(db, 'empresas', id), snap => callback(snap.data()));
+ return DataService.subscribe('empresas', id, callback);
```

- [ ] **Passo 3: Manter a criação do usuário no Firebase Auth (app secundário) intacta — só a escrita do perfil em `users` muda**

```diff
  const secondaryApp = initializeApp(firebaseConfig, 'secondary');
  const secondaryAuth = getAuth(secondaryApp);
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
- await setDoc(doc(db, 'users', cred.user.uid), userProfile);
+ await DataService.save('users', cred.user.uid, userProfile);
  await deleteApp(secondaryApp);
```

- [ ] **Passo 4: Verificação manual**

Fluxo completo de onboarding de uma nova empresa pela UI existente (tela de cadastro de empresa/onboarding). Confirmar em `db:studio`: linha em `organizations`, linha em `users` com o `id` = uid do Firebase Auth criado, `organization_id` preenchido corretamente.

- [ ] **Passo 5: Commit**

```bash
git add src/services/EmpresaService.ts
git commit -m "refactor: EmpresaService usa DataService (Postgres) em vez de Firestore direto"
```

---

### Task 3: `ClienteService.ts` — CRUD principal + subcoleções `apolices`/`historico`

**Files:**
- Modify: `src/services/ClienteService.ts`
- Create: `_api/data/clientesRouter.ts`
- Modify: `server.ts` (montar `clientesRouter`)

**Interfaces:**
- Produces rotas dedicadas: `GET/POST /api/data/clientes/:clienteId/apolices`, `PATCH/DELETE /api/data/clientes/:clienteId/apolices/:apoliceId`, mesmo padrão para `/historico`, e `GET /api/data/apolices` (equivalente ao `collectionGroup` — todas as apólices da organização do usuário autenticado, via join).

- [ ] **Passo 1: CRUD principal de `clientes` — trocar por `DataService` (mesmo padrão da Task 2)**

```diff
- import { doc, getDoc, setDoc, collection, addDoc, onSnapshot, collectionGroup, query, where, getDocs } from 'firebase/firestore';
+ import { DataService } from './DataService';
+ import { where } from '../lib/queryConstraints';
```

Repetir a troca `getDoc`→`DataService.get`, `setDoc`→`DataService.save`, `onSnapshot`→`DataService.subscribe` para o CRUD de `clientes` (não para apólices/histórico, que são subcoleção e ganham rota própria abaixo).

- [ ] **Passo 2: Rota dedicada de apólices**

```ts
// _api/data/clientesRouter.ts
import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { requireAuth } from '../lib/authMiddleware';
import { loadTenantContext } from './tenantMiddleware';
import { clienteApolices, clientes } from '../db/schema';
import { emitDataChanged } from '../lib/realtimeBus';

export const clientesRouter = Router();
clientesRouter.use(requireAuth, loadTenantContext);

async function assertClienteInOrg(clienteId: string, organizationId: string) {
  const [c] = await getDb().select().from(clientes).where(and(eq(clientes.id, clienteId), eq(clientes.organizationId, organizationId)));
  return !!c;
}

clientesRouter.get('/:clienteId/apolices', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req.organizationId)) return res.status(404).end();
  const rows = await getDb().select().from(clienteApolices).where(eq(clienteApolices.clienteId, req.params.clienteId));
  res.json(rows);
});

clientesRouter.post('/:clienteId/apolices', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req.organizationId)) return res.status(404).end();
  const [row] = await getDb().insert(clienteApolices).values({ ...req.body, clienteId: req.params.clienteId }).returning();
  await emitDataChanged('cliente_apolices', row.id, req.organizationId);
  res.status(201).json(row);
});

clientesRouter.patch('/:clienteId/apolices/:apoliceId', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req.organizationId)) return res.status(404).end();
  const [row] = await getDb().update(clienteApolices).set(req.body)
    .where(eq(clienteApolices.id, req.params.apoliceId)).returning();
  await emitDataChanged('cliente_apolices', req.params.apoliceId, req.organizationId);
  res.json(row);
});

clientesRouter.delete('/:clienteId/apolices/:apoliceId', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req.organizationId)) return res.status(404).end();
  await getDb().delete(clienteApolices).where(eq(clienteApolices.id, req.params.apoliceId));
  res.status(204).end();
});
```

Repetir Passos 2-4 (CRUD completo) para `cliente_historico` no mesmo arquivo, seguindo exatamente o mesmo padrão (sem equivalente a `collectionGroup`, pois `historico` nunca é consultado entre clientes — só a rota de apólices abaixo precisa disso).

- [ ] **Passo 2b: Rota top-level equivalente ao `collectionGroup(db, 'apolices')`**

Esta rota lê apólices de TODOS os clientes da organização — não é aninhada sob um `:clienteId`, então não pertence ao `clientesRouter` (que é montado em `/api/data/clientes`, então qualquer rota dentro dele sempre começa com um `clienteId`). Ela é montada direto em `server.ts`, com a mesma cadeia de middlewares aplicada manualmente (já que não está sob o `.use(requireAuth, loadTenantContext)` do `clientesRouter`):

```ts
// server.ts — próximo ao bloco de montagem do clientesRouter (Passo 3 abaixo)
import { requireAuth } from './_api/lib/authMiddleware.js';
import { loadTenantContext } from './_api/data/tenantMiddleware.js';
import { getDb } from './_api/lib/db.js';
import { eq } from 'drizzle-orm';
import { clienteApolices, clientes } from './_api/db/schema/index.js';

app.get('/api/data/apolices', requireAuth, loadTenantContext, async (req: any, res: any) => {
  const rows = await getDb().select().from(clienteApolices)
    .innerJoin(clientes, eq(clienteApolices.clienteId, clientes.id))
    .where(eq(clientes.organizationId, req.organizationId));
  res.json(rows.map(r => r.cliente_apolices));
});
```

- [ ] **Passo 3: Montar o router**

```ts
// server.ts
const { clientesRouter } = await import('./_api/data/clientesRouter.js');
app.use('/api/data/clientes', clientesRouter);
```

- [ ] **Passo 4: Atualizar `ClienteService.ts` para chamar as rotas novas**

```diff
- const apolicesSnap = await getDocs(collection(db, 'clientes', clienteId, 'apolices'));
+ const res = await fetch(`/api/data/clientes/${clienteId}/apolices`, { headers: await authHeader() });
+ const apolicesList = await res.json();
```

(Reaproveitar o helper `authHeader` — extrair de `dataApiClient.ts` da Fase 2 para um export separado se `ClienteService` precisar dele diretamente, em vez de duplicar a lógica de token.)

- [ ] **Passo 5: Verificação manual**

Pela UI de Clientes: criar cliente, adicionar apólice, editar apólice, adicionar item de histórico, confirmar tudo em `db:studio` nas tabelas `clientes`/`cliente_apolices`/`cliente_historico`. Confirmar que a tela de listagem geral de apólices (se existir, usando o equivalente ao `collectionGroup`) mostra apólices de todos os clientes da organização.

- [ ] **Passo 6: Commit**

```bash
git add src/services/ClienteService.ts _api/data/clientesRouter.ts server.ts
git commit -m "feat: ClienteService + rotas dedicadas de apólices/histórico sobre Postgres"
```

---

### Task 4: `TemplateService.ts`

**Files:**
- Modify: `src/services/TemplateService.ts`

**Interfaces:**
- Consumes: `DataService`/`dataApiClient` para `platform_agent_templates`, `platform_guardrails`, `tenant_agent_configs`, `tenant_onboarding_wizard_state` (registradas na Task 1).

- [ ] **Passo 1: Trocar cada chamada Firestore por `DataService`**

Mesmo padrão das Tasks 2-3: `doc(db,'platform_agent_templates', id)` + `getDoc`/`setDoc` → `DataService.get/save('platform_agent_templates', id, ...)`; `doc(db,'platform_guardrails','universal')` → `DataService.get/save('platform_guardrails', 'universal', ...)`; `doc(db,'tenants', orgId, 'config', 'agent_config')` → `DataService.get/save('tenant_agent_configs', orgId, ...)`; idem para `wizard_state` → `tenant_onboarding_wizard_state`.

- [ ] **Passo 2: Verificação manual**

Fluxo de wizard de onboarding de agente (tela existente que usa `TemplateService`), confirmar avanço/retomada de passos gravando em `tenant_onboarding_wizard_state` no Neon.

- [ ] **Passo 3: Commit**

```bash
git add src/services/TemplateService.ts
git commit -m "refactor: TemplateService usa DataService (Postgres) em vez de Firestore direto"
```

---

### Task 5: `NfseService.ts` + `useNfse.ts`

**Files:**
- Modify: `src/domains/nfse/services/NfseService.ts`
- Modify: `src/domains/nfse/hooks/useNfse.ts` (se tiver chamada Firestore direta — confirmar no Passo 1)

- [ ] **Passo 1: Confirmar se `useNfse.ts` chama Firestore direto ou só via `NfseService`**

Run: `grep -n "firebase/firestore" src/domains/nfse/hooks/useNfse.ts`
Se vazio, este arquivo não precisa de mudança (já abstrai via `NfseService`).

- [ ] **Passo 2: Trocar `NfseService.ts` para `DataService`**

Mesmo padrão: `organizations/{orgId}/nfse` → `DataService.list/create/update('nfse_documents', ..., [where('organizationId','==',orgId), ...])`, `organizations/{orgId}/nfse_logs` → `nfse_logs`.

- [ ] **Passo 3: Verificação manual**

Emitir uma NFS-e de teste em ambiente de homologação (campo `ambiente: 'homologacao'` já existe no domínio), confirmar `nfse_documents` e `nfse_logs` no Neon.

- [ ] **Passo 4: Commit**

```bash
git add src/domains/nfse
git commit -m "refactor: NfseService usa DataService (Postgres) em vez de Firestore direto"
```

---

### Task 6: `LockService.ts` — locks distribuídos

**Files:**
- Modify: `src/services/LockService.ts`
- Create: rota `POST /api/data/_locks/acquire`, `POST /api/data/_locks/release` em `_api/data/router.ts`

- [ ] **Passo 1: Rotas de lock**

```ts
// _api/data/router.ts
import { processingLocks } from '../db/schema';
import { and, eq, lt } from 'drizzle-orm';

dataRouter.post('/_locks/acquire', async (req: any, res) => {
  const { id, ownerId, instanceId, ttlMs } = req.body;
  const expiresAt = new Date(Date.now() + ttlMs);
  const result = await getDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(processingLocks).where(eq(processingLocks.id, id));
    const now = new Date();
    if (existing && existing.expiresAt > now) return { acquired: false };
    if (existing) {
      await tx.update(processingLocks).set({ ownerId, instanceId, expiresAt }).where(eq(processingLocks.id, id));
    } else {
      await tx.insert(processingLocks).values({ id, resourceId: id, ownerId, instanceId, expiresAt });
    }
    return { acquired: true };
  });
  res.json(result);
});

dataRouter.post('/_locks/release', async (req: any, res) => {
  const { id, ownerId } = req.body;
  await getDb().delete(processingLocks).where(and(eq(processingLocks.id, id), eq(processingLocks.ownerId, ownerId)));
  res.status(204).end();
});
```

> `tx.select()...FOR UPDATE` explícito não é necessário aqui porque o driver HTTP do Neon (`drizzle-orm/neon-http`) não suporta transações interativas com lock de linha da mesma forma que uma conexão TCP longa — se este comportamento se mostrar insuficiente sob concorrência real (dois processos disputando o mesmo lock ao mesmo tempo), trocar o driver desta rota específica para `drizzle-orm/neon-serverless` (WebSocket, suporta `FOR UPDATE` de verdade) só para o módulo de locks. Documentar essa troca como parte da verificação do Passo 3, não assumir que a versão HTTP é suficiente sem testar.

- [ ] **Passo 2: Atualizar `LockService.ts`**

```diff
- await runTransaction(db, async (tx) => { ... });
+ const { acquired } = await dataApiClient.create('_locks/acquire' as any, { id, ownerId, instanceId, ttlMs });
+ return acquired;
```

- [ ] **Passo 3: Verificação manual — concorrência**

Disparar duas chamadas simultâneas de `LockService.acquireLock` com o mesmo `resourceId` (script simples com `Promise.all`), confirmar que só uma retorna `acquired: true`.

- [ ] **Passo 4: Commit**

```bash
git add src/services/LockService.ts _api/data/router.ts
git commit -m "feat: locks distribuídos (processing_locks) via transação Postgres"
```

---

### Task 7: `leadAutomation.ts` — claim idempotente de mensagem

**Files:**
- Modify: `src/services/leadAutomation.ts:44`
- Reaproveita: rota `_locks/acquire` da Task 6 (mesma primitiva — um claim idempotente é um lock de curta duração com `ttlMs` alto o suficiente para cobrir o processamento)

- [ ] **Passo 1: Trocar `runTransaction` pela mesma primitiva de lock**

```diff
- await runTransaction(db, async (tx) => {
-   const ref = doc(db, 'processing_locks', messageId);
-   const snap = await tx.get(ref);
-   if (snap.exists()) throw new Error('já processado');
-   tx.set(ref, { claimedAt: serverTimestamp() });
- });
+ const { acquired } = await dataApiClient.create('_locks/acquire' as any, {
+   id: `claim:${messageId}`, ownerId: currentInstanceId, instanceId: currentInstanceId, ttlMs: 5 * 60_000,
+ });
+ if (!acquired) return; // já foi claimed por outra invocação
```

- [ ] **Passo 2: Verificação manual**

Simular webhook duplicado (reenviar o mesmo payload de mensagem duas vezes ao endpoint de webhook em rápida sucessão), confirmar que só uma automação de resposta é disparada.

- [ ] **Passo 3: Commit**

```bash
git add src/services/leadAutomation.ts
git commit -m "refactor: claim idempotente de mensagem via processing_locks (Postgres)"
```

---

### Task 8: `MigrationRunnerService.ts` e `TenantIsolationService.ts`

**Files:**
- Modify: `src/services/MigrationRunnerService.ts`
- Modify: `src/services/TenantIsolationService.ts`

- [ ] **Passo 1: Trocar leituras/escritas diretas por `DataService`**

Ambos são ferramentas internas de auditoria/migração de dados que já operam por coleção (`migration_logs`, leitura de `leads`/`users`/etc. para auditoria de `organizationId`) — mesmo padrão de troca mecânica das tasks anteriores: `getDocs(query(collection(db, X), ...))` → `DataService.list(X, [where(...)])`; `writeBatch` de `MigrationRunnerService` → laço de `DataService.update` (sem batch atômico — aceitável, é ferramenta interna de manutenção, não caminho crítico de usuário) ou, se atomicidade for necessária, uma rota dedicada `POST /api/data/_batch` que recebe uma lista de operações e roda numa única transação Drizzle.

- [ ] **Passo 2: Verificação manual**

Rodar `TenantIsolationService.runIsolationAudit()` (ferramenta existente, provavelmente exposta em alguma tela de admin) contra o Postgres e confirmar que o relatório de isolamento não aponta nenhum falso positivo introduzido pela migração.

- [ ] **Passo 3: Commit**

```bash
git add src/services/MigrationRunnerService.ts src/services/TenantIsolationService.ts
git commit -m "refactor: ferramentas internas de migração/auditoria usam DataService (Postgres)"
```

---

### Task 9: `SecurityService.generateId` — trocar gerador de ID

**Files:**
- Modify: `src/services/SecurityService.ts`

- [ ] **Passo 1: Instalar `nanoid`**

Run: `npm install nanoid`

- [ ] **Passo 2: Trocar implementação**

```diff
- static generateId(collectionName: string): string {
-   return doc(collection(db, collectionName)).id;
- }
+ import { nanoid } from 'nanoid';
+ static generateId(_collectionName: string): string {
+   return nanoid();
+ }
```

- [ ] **Passo 3: Verificação**

Run: `node -e "console.log(require('nanoid').nanoid())"` — confirma que gera string válida. Como este método é usado por `DataService.generateAuditLog` (já portado na Fase 2), basta reexecutar o smoke test de criação de lead da Fase 2 Task 3 Passo 4 e confirmar que `audit_logs.id` continua sendo preenchido.

- [ ] **Passo 4: Commit**

```bash
git add src/services/SecurityService.ts package.json
git commit -m "refactor: SecurityService.generateId usa nanoid em vez de Firestore como gerador de ID"
```

---

### Task 10: `RelacionamentosTab.tsx`

**Files:**
- Modify: `src/domains/clientes/RelacionamentosTab.tsx`

- [ ] **Passo 1: Trocar `writeBatch`/`onSnapshot` por `DataService`**

```diff
- const batch = writeBatch(db);
- batch.set(doc(collection(db, 'cliente_relacionamentos')), relacaoAB);
- batch.set(doc(collection(db, 'cliente_relacionamentos')), relacaoBA);
- await batch.commit();
+ await DataService.create('cliente_relacionamentos', relacaoAB);
+ await DataService.create('cliente_relacionamentos', relacaoBA);
```

(Perde a atomicidade das duas escritas — se isso for inaceitável, usar a rota `_batch` mencionada na Task 8 em vez de duas chamadas separadas. Decisão a confirmar durante a implementação, com base em quão crítico é o caso de falha parcial nesta tela específica.)

```diff
- const unsub = onSnapshot(query(collection(db, 'cliente_relacionamentos'), where('clienteId','==',clienteId)), snap => ...);
+ const unsub = DataService.subscribeCollection('cliente_relacionamentos', [where('clienteId','==',clienteId)], callback);
```

- [ ] **Passo 2: Verificação manual**

Criar um vínculo entre dois clientes na UI, confirmar 2 linhas em `cliente_relacionamentos` (uma para cada direção) e que ambas as telas de cliente (A e B) mostram o vínculo.

- [ ] **Passo 3: Commit**

```bash
git add src/domains/clientes/RelacionamentosTab.tsx
git commit -m "refactor: RelacionamentosTab usa DataService (Postgres) em vez de Firestore direto"
```

---

### Task 11: `LoggerService.ts`, `MetricsService.ts`, `BatchCoordinatorService.ts`, `AdminTools.tsx`

> **Adicionada numa revisão de correção** — estes 4 arquivos faziam acesso direto ao Firestore (`writeBatch`/`updateDoc`), bypassando o `DataService`, e não estavam no levantamento original nem no ADR-6 da spec. Confirmado por grep direto no código (`import { writeBatch, doc } from 'firebase/firestore'` em cada um). Ver `docs/db-migration/SPEC.md` ADR-6 e `docs/db-migration/INVENTORY.md` seção B.

**Files:**
- Modify: `src/services/LoggerService.ts`
- Modify: `src/services/MetricsService.ts`
- Modify: `src/services/BatchCoordinatorService.ts`
- Modify: `src/domains/admin/AdminTools.tsx`
- Create: rota `POST /api/data/_batch` em `_api/data/router.ts`

**Interfaces:**
- Produces: `POST /api/data/_batch` (body `{ operations: Array<{ type: 'set'|'update'|'delete'; entity: string; id: string; data?: any }> }`) — endpoint que `BatchCoordinatorService.ts` já espera existir conceitualmente (era referenciado como "rota `_batch`, se necessário" nas Tasks 8 e 10 deste plano, mas nunca tinha sido definido em código até agora).

- [ ] **Passo 1: Definir a rota `_batch` (transação real, ao contrário de `MigrationRunnerService`/`RelacionamentosTab` que aceitaram perder atomicidade nas Tasks 8/10)**

```ts
// _api/data/router.ts — registrar ANTES de qualquer rota /:entity genérica
import { emitDataChanged } from '../lib/realtimeBus';

type BatchOp = { type: 'set' | 'update' | 'delete'; entity: string; id: string; data?: Record<string, any> };

dataRouter.post('/_batch', async (req: any, res) => {
  const operations: BatchOp[] = req.body.operations ?? [];
  const results = await getDb().transaction(async (tx) => {
    const out: any[] = [];
    for (const op of operations) {
      const table = ENTITY_TABLE[op.entity];
      if (!table) throw new Error(`_batch: entidade desconhecida "${op.entity}"`);
      if (op.type === 'set') {
        const [row] = await tx.insert(table).values({ ...op.data, id: op.id })
          .onConflictDoUpdate({ target: table.id, set: op.data }).returning();
        out.push(row);
      } else if (op.type === 'update') {
        const [row] = await tx.update(table).set(op.data ?? {}).where(eq(table.id, op.id)).returning();
        out.push(row);
      } else {
        await tx.delete(table).where(eq(table.id, op.id));
        out.push({ id: op.id, deleted: true });
      }
    }
    return out;
  });
  for (const [i, op] of operations.entries()) {
    await emitDataChanged(op.entity, op.id, results[i]?.organizationId ?? null);
  }
  res.status(200).json(results);
});
```

- [ ] **Passo 2: Portar `BatchCoordinatorService.ts`**

```diff
- import { writeBatch, doc } from 'firebase/firestore';
- import { db } from '../lib/firebase';
+ import { dataApiClient } from '../lib/dataApiClient';
  ...
- const batch = writeBatch(db);
- for (const op of operations) {
-   const ref = doc(db, op.collection, op.id);
-   switch (op.type) { /* set/update/delete no batch */ }
- }
- await batch.commit();
+ const res = await fetch('/api/data/_batch', {
+   method: 'POST', headers: await authHeader(),
+   body: JSON.stringify({ operations: operations.map(op => ({ type: op.type, entity: op.collection, id: op.id, data: op.data })) }),
+ });
+ if (!res.ok) throw new Error(`_batch falhou: ${res.status}`);
```

- [ ] **Passo 3: Portar `LoggerService.ts`**

```diff
- import { collection, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
+ import { DataService } from './DataService';
  ...
- const batch = writeBatch(db);
- const logRef = doc(collection(db, this.collectionName), logId);
- batch.set(logRef, { ...logData, timestamp: serverTimestamp() });
- await batch.commit();
+ await DataService.create('system_logs', { id: logId, ...logData });
```

(Se `LoggerService` grava vários logs de uma vez num único `writeBatch`, usar a rota `_batch` da Task 1 em vez de várias chamadas `DataService.create` sequenciais, para preservar a atomicidade original.)

- [ ] **Passo 4: Portar `MetricsService.ts`**

```diff
- import { writeBatch, doc, increment, serverTimestamp, collection } from 'firebase/firestore';
+ import { DataService } from './DataService';
  ...
- const firestoreBatch = writeBatch(db);
- const userMetricsRef = doc(db, 'metrics_users', `${user.uid}_${today}`);
- const dailyMetricsRef = doc(db, 'metrics_daily', today);
- updateData[`values.${name}`] = increment(value);
- ...
+ await DataService.save('metrics_users', `${user.uid}_${today}`, updatedUserMetrics);
+ await DataService.save('metrics_daily', today, updatedDailyMetrics);
+ await DataService.create('metrics_raw', rawEvent);
```

(`increment()` some aqui porque `metrics_users`/`metrics_daily` guardam objetos `data jsonb` de granularidade diária — ler o valor atual via `DataService.get`, somar em memória, e `save` de volta é suficiente, já que a métrica é por usuário/dia e não sofre alta concorrência simultânea no mesmo dia.)

- [ ] **Passo 5: Portar `AdminTools.tsx`**

```diff
- import { doc, updateDoc } from 'firebase/firestore';
+ import { DataService } from '../../services/DataService';
  ...
- await updateDoc(doc(db, 'users', uid), { superadmin: true });
+ await DataService.update('users', uid, { superadmin: true });
```

- [ ] **Passo 6: Verificação manual**

Disparar uma ação que gera log (qualquer operação de CRUD já portada) e confirmar linha em `system_logs`. Navegar o app normalmente e confirmar `metrics_users`/`metrics_daily`/`metrics_raw` preenchidos. Rodar uma operação em lote de `BatchCoordinatorService` (ex.: uma tela que dispara múltiplas escritas relacionadas) e confirmar todas as linhas gravadas atomicamente. Promover um usuário a superadmin pela tela de `AdminTools` e confirmar `users.superadmin = true` no Neon.

- [ ] **Passo 7: Commit**

```bash
git add src/services/LoggerService.ts src/services/MetricsService.ts src/services/BatchCoordinatorService.ts src/domains/admin/AdminTools.tsx _api/data/router.ts
git commit -m "feat: porta LoggerService/MetricsService/BatchCoordinatorService/AdminTools + endpoint _batch"
```

---

## Self-Review desta fase

- Todos os 15 itens da seção B do Inventory (9 serviços + 1 componente + `useNfse.ts` de verificação + os 4 adicionados numa revisão de correção: `LoggerService`, `MetricsService`, `BatchCoordinatorService`, `AdminTools.tsx`) têm tarefa correspondente (Tasks 2-11, com a Task 1 cobrindo o registro de entidades simples usado por várias delas).
- Ponto de atenção explícito, não escondido: Task 10 troca atomicidade de `writeBatch` por duas chamadas sequenciais — documentado como decisão a confirmar, não assumido silenciosamente. A Task 11 já resolve o endpoint `_batch` que ficava só referenciado (nunca definido) nas Tasks 8 e 10 — se a atomicidade de `RelacionamentosTab`/`MigrationRunnerService` for considerada crítica ao implementar, usar essa rota em vez de aceitar a perda de atomicidade.
- Próxima fase: `2026-09-10-pg-migration-04-api-routes-port.md`.
