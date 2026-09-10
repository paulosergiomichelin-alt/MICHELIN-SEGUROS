# Fase 5 — Migração dos dados existentes (Firestore → Postgres) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escrever e executar o script único que lê todo o Firestore de produção e grava no Neon, preservando IDs (ADR-8), respeitando a ordem de dependência das FKs, com um modo dry-run e uma contagem de verificação antes de qualquer confirmação de sucesso.

**Architecture:** Script Node standalone (`scripts/migrate-firestore-to-postgres.ts`), reaproveita `fsQueryFull` de `_api/lib/adminFirebase.ts` (ainda não removido nesta fase — só na Fase 6) para leitura paginada por coleção, e `getDb()`/schema Drizzle (Fase 1) para escrita. Roda **fora** do `server.ts`, via `tsx`, com flags de linha de comando.

**Tech Stack:** `tsx`, `_api/lib/adminFirebase.ts` (leitura), Drizzle (escrita).

**Spec:** `docs/db-migration/SPEC.md` §7, §8 (riscos 4-5).

## Global Constraints

- **Não é destrutivo**: o script só lê do Firestore e só escreve no Postgres. Nunca apaga nem modifica nada no Firestore.
- Roda em modo `--dry-run` por padrão; só grava de fato com `--write` explícito.
- Idempotente: pode ser executado várias vezes sem duplicar dados (usa `ON CONFLICT (id) DO UPDATE`, já que os IDs são preservados).
- Ordem de execução respeita FKs: `organizations` → `seguradoras` → `users` → `clientes` → `leads` → `cliente_apolices`/`cliente_historico`/`cliente_relacionamentos` → `messages`/`notifications`/`follow_ups`/`flows`/`learning_memory` → `audit_logs`/`system_logs` → `campaigns`/`campaign_log` → `email_accounts`/`email_settings` → `platform_agent_templates`/`platform_guardrails`/`tenant_agent_configs`/`tenant_onboarding_wizard_state` → `nfse_documents`/`nfse_logs` → `whatsapp_sessions` → `settings`/`config` (sem FK, podem entrar em qualquer ponto — colocados por último por conveniência). Nota: `leads` e `clientes` têm uma FK circular entre si (SPEC.md §4.2) — inserir os dois SEM validar a FK ainda (a migration do schema, Fase 1, só adiciona essas duas constraints depois que ambas as tabelas têm dados, então isso não bloqueia o script).
- **Não migra** (por não terem dado existente no Firestore, ver ADR-9 e SPEC §4.8/4.10): `whatsapp_conversations`, `whatsapp_messages`, e-mails/threads em si, `processing_locks` (é estado transitório, não dado de negócio a preservar).

---

### Task 1: Esqueleto do script + modo dry-run com contagem

**Files:**
- Create: `scripts/migrate-firestore-to-postgres.ts`

**Interfaces:**
- Produces: `npx tsx scripts/migrate-firestore-to-postgres.ts --dry-run` (padrão) e `--write` (grava de fato), aceita `--collection=<nome>` para rodar uma coleção isolada (útil para depurar).

- [ ] **Passo 1: Estrutura base**

```ts
// scripts/migrate-firestore-to-postgres.ts
import 'dotenv/config';
import { sql, getTableColumns } from 'drizzle-orm';
import { fsQueryFull } from '../_api/lib/adminFirebase';
import { getDb } from '../_api/lib/db';
import * as schema from '../_api/db/schema';

const WRITE = process.argv.includes('--write');
const ONLY = process.argv.find(a => a.startsWith('--collection='))?.split('=')[1];

type Migration = {
  firestoreCollection: string;
  table: any;
  transform: (doc: any) => Record<string, any>;
};

// Padrão oficial do Drizzle para upsert em lote: "set" precisa referenciar a pseudo-tabela
// `excluded` (o valor que SERIA inserido), não a própria coluna — `set: { col: table.col }`
// (como um rascunho anterior deste script tinha) é um bug real: isso faria UPDATE col = col,
// ou seja, um no-op. Sem isso, reexecutar o script depois de editar um documento no Firestore
// NUNCA atualizaria a linha já migrada no Postgres — quebra a garantia de idempotência dos
// Global Constraints desta fase.
function buildConflictUpdateColumns(table: any, columnKeys: string[]) {
  const cols = getTableColumns(table);
  return columnKeys.reduce((acc: Record<string, any>, key) => {
    acc[key] = sql.raw(`excluded.${cols[key].name}`);
    return acc;
  }, {});
}

async function migrateOne(m: Migration) {
  console.log(`[migrate] Lendo Firestore/${m.firestoreCollection}...`);
  const docs = await fsQueryFull(m.firestoreCollection, [], 100000); // limite alto — coleções deste projeto são pequenas (CRM, não big data)
  console.log(`[migrate] ${docs.length} documentos encontrados em ${m.firestoreCollection}`);
  if (!WRITE) { console.log(`[dry-run] Nenhuma escrita realizada.`); return docs.length; }

  const rows = docs.map(m.transform);
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const updateColumns = Object.keys(chunk[0]).filter(k => k !== 'id');
    await getDb().insert(m.table).values(chunk).onConflictDoUpdate({
      target: m.table.id,
      set: buildConflictUpdateColumns(m.table, updateColumns),
    });
    console.log(`[migrate] ${m.firestoreCollection}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  return rows.length;
}

async function verifyCounts(m: Migration, expectedCount: number) {
  const [{ count }] = await getDb().select({ count: sql<number>`count(*)` }).from(m.table);
  if (Number(count) < expectedCount) {
    console.error(`[VERIFY-FAIL] ${m.firestoreCollection}: Firestore=${expectedCount} Postgres=${count}`);
    return false;
  }
  console.log(`[VERIFY-OK] ${m.firestoreCollection}: Firestore=${expectedCount} Postgres=${count}`);
  return true;
}
```

- [ ] **Passo 2: Verificação manual do esqueleto**

Run: `npx tsx scripts/migrate-firestore-to-postgres.ts --dry-run --collection=empresas`
Expected: imprime a contagem de documentos em `empresas` sem gravar nada.

- [ ] **Passo 3: Commit**

```bash
git add scripts/migrate-firestore-to-postgres.ts
git commit -m "feat: esqueleto do script de migração de dados Firestore→Postgres (dry-run + contagem)"
```

---

### Task 2: Transforms — organizations, users, seguradoras (1:1 diretas)

**Files:**
- Modify: `scripts/migrate-firestore-to-postgres.ts`

- [ ] **Passo 1: Implementar os transforms simples (camelCase → snake_case, datas ISO → `Date`)**

```ts
function isoToDate(v?: string | null): Date | null { return v ? new Date(v) : null; }

const MIGRATIONS: Migration[] = [
  {
    firestoreCollection: 'empresas', table: schema.organizations,
    transform: (d) => ({
      id: d.id, nomeRazaoSocial: d.nomeRazaoSocial, nomeFantasia: d.nomeFantasia, cnpj: d.cnpj,
      emailCorporativo: d.emailCorporativo, telefone: d.telefone, slug: d.slug, logoUrl: d.logoUrl,
      planoSaas: d.planoSaas, limiteUsuarios: d.limiteUsuarios, limiteLeadsMes: d.limiteLeadsMes,
      limiteStorageMb: d.limiteStorageMb, status: d.status, trialExpiraEm: isoToDate(d.trialExpiraEm),
      timezone: d.timezone, idioma: d.idioma, ownerUserId: d.ownerUserId,
      configuracoes: d.configuracoes ?? {}, fiscalSettings: d.fiscalSettings, certificate: d.certificate,
      fiscalServices: d.fiscalServices, createdAt: isoToDate(d.criadoEm), updatedAt: isoToDate(d.atualizadoEm),
    }),
  },
  {
    firestoreCollection: 'users', table: schema.users,
    transform: (d) => ({
      id: d.id ?? d.uid, organizationId: d.organizationId, email: d.email, name: d.name, phone: d.phone,
      role: d.role, userType: d.userType, profileId: d.profileId, permissions: d.permissions, cargo: d.cargo,
      photoUrl: d.photoURL, status: d.status, onboardingCompleted: d.onboardingCompleted, metrics: d.metrics,
      activity: d.activity, theme: d.theme, chatPreferences: d.chatPreferences, superadmin: !!d.superadmin,
      lastAccess: isoToDate(d.lastAccess), createdAt: isoToDate(d.createdAt), updatedAt: isoToDate(d.updatedAt),
    }),
  },
  {
    firestoreCollection: 'seguradoras', table: schema.seguradoras,
    transform: (d) => ({ id: d.id, nome: d.nome ?? d.name ?? d.id }),
  },
];
```

- [ ] **Passo 2: Rodar dry-run das 3 coleções**

Run: `npx tsx scripts/migrate-firestore-to-postgres.ts --dry-run --collection=users` (repetir para `empresas`, `seguradoras`)
Expected: contagens plausíveis (comparar contra o que aparece na UI atual de administração de empresas/usuários, se houver uma tela com esses números).

- [ ] **Passo 3: Commit**

```bash
git add scripts/migrate-firestore-to-postgres.ts
git commit -m "feat: transforms de migração para organizations/users/seguradoras"
```

---

### Task 3: Transform `leads` (schema híbrido — o caso mais complexo)

**Files:**
- Modify: `scripts/migrate-firestore-to-postgres.ts`

- [ ] **Passo 1: Implementar**

```ts
const LEAD_PROMOTED_FIELDS = new Set([
  'id', 'organizationId', 'status', 'temperature', 'score', 'vendedorId', 'ownerId',
  'responsibleAgentId', 'responsibleAgentType', 'clienteId', 'origin', 'isTest', 'iaActive',
  'name', 'phone', 'email', 'cpf', 'plate', 'chassis', 'insurer', 'insuranceType',
  'closedAt', 'lastInteraction', 'nextReturnAt', 'stuckSince', 'version', 'createdAt', 'updatedAt',
]);

function transformLead(d: any) {
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(d)) if (!LEAD_PROMOTED_FIELDS.has(k)) data[k] = v;
  return {
    id: d.id, organizationId: d.organizationId, status: d.status, temperature: d.temperature,
    score: d.score, vendedorId: d.vendedorId, ownerId: d.ownerId,
    responsibleAgentId: d.responsibleAgentId, responsibleAgentType: d.responsibleAgentType,
    clienteId: d.clienteId, origin: d.origin, isTest: !!d.isTest, iaActive: d.iaActive,
    name: d.name, phone: d.phone, email: d.email, cpf: d.cpf, plate: d.plate, chassis: d.chassis,
    insurer: d.insurer, insuranceType: d.insuranceType, closedAt: isoToDate(d.closedAt),
    lastInteraction: isoToDate(d.lastInteraction), nextReturnAt: isoToDate(d.nextReturnAt ?? d.proximoRetorno),
    stuckSince: isoToDate(d.stuckSince), version: d.version ?? 1, data,
    createdAt: isoToDate(d.createdAt) ?? new Date(), updatedAt: isoToDate(d.updatedAt) ?? isoToDate(d.createdAt) ?? new Date(),
  };
}
// adicionar ao array MIGRATIONS: { firestoreCollection: 'leads', table: schema.leads, transform: transformLead }
```

> **FK circular com `clientes`**: `leads.clienteId` e `clientes.leadOrigemId` se referenciam mutuamente (SPEC.md §4.2), e dados reais provavelmente têm ciclos (lead convertido em cliente, cliente apontando de volta pro lead de origem). As duas FKs foram criadas como `DEFERRABLE INITIALLY DEFERRED` (Fase 1 Task 1 Passo 6b) exatamente para isto — mas isso só funciona se as duas inserções (`leads` e `clientes`) rodarem **dentro da mesma transação**, senão cada `migrateOne` isolado ainda commita e valida a FK sozinho. Chamar as duas assim, não separadamente:
>
> ```ts
> await getDb().transaction(async (tx) => {
>   await migrateOne({ ...leadsMigration, db: tx });   // ajustar migrateOne para aceitar um db/tx opcional em vez de sempre chamar getDb()
>   await migrateOne({ ...clientesMigration, db: tx });
> });
> ```
>
> (Isso implica ajustar a assinatura de `migrateOne` do Passo 1 da Task 1 para receber o executor de query — `tx` ou `getDb()` — como parâmetro, em vez de chamar `getDb()` fixo internamente. Fazer esse ajuste ao implementar a Task 1, antes de chegar nesta task.)

- [ ] **Passo 2: Rodar dry-run e inspecionar amostra**

Run: `npx tsx scripts/migrate-firestore-to-postgres.ts --write --collection=leads` **em ambiente de dev/staging** (nunca direto em produção nesta tarefa), depois:

```bash
npm run db:studio
```

Abrir a tabela `leads`, escolher 5 leads aleatórios, comparar campo a campo contra o documento Firestore original (via console do Firebase) — confirmar que todo campo promovido bateu e que `data` contém o restante sem perda.

- [ ] **Passo 3: Commit**

```bash
git add scripts/migrate-firestore-to-postgres.ts
git commit -m "feat: transform de migração para leads (schema híbrido colunas promovidas + data jsonb)"
```

---

### Task 4: Transforms — demais coleções (mensagens, notificações, clientes, apólices, campanhas, e-mail, templates, NFS-e)

**Files:**
- Modify: `scripts/migrate-firestore-to-postgres.ts`

- [ ] **Passo 1: Implementar cada transform seguindo o padrão da Task 2 (1:1 direto) — uma entrada no array `MIGRATIONS` por coleção**

Lista completa a implementar, cada uma mapeando os campos exatos já documentados em `SPEC.md` §4 para a tabela correspondente (nenhum campo novo a inventar — copiar da spec):

- `messages`, `notifications`, `follow_ups`, `flows`, `learning_memory` (direto, snake_case + `isoToDate` nos campos de data)
- `clientes` (atenção a `dataNascimento`/`dataRenovacao` → `date`, não `timestamptz` — usar só a parte de data da string ISO)
- `clientes/{id}/apolices` → `cliente_apolices`: **iterar clientes primeiro, depois a subcoleção de cada um** (`fsQueryFull` não lê subcoleções — precisa de uma chamada REST adicional por cliente; usar `fetch` direto contra `https://firestore.googleapis.com/v1/.../clientes/{clienteId}/apolices` com o mesmo token de `adminFirebase.ts`, ou expor uma função `fsQueryFullSubcollection(parentPath, sub, filters)` nova em `adminFirebase.ts` reaproveitando `getToken()`/`fromFirestoreFields` já existentes). Valores monetários **já em centavos** — copiar como `integer`, não multiplicar/dividir.
- `clientes/{id}/historico` → `cliente_historico` (mesma abordagem de subcoleção acima)
- `cliente_relacionamentos`, `campaigns`, `campaign_log`, `email_accounts`, `email_settings` (direto)
- `platform_agent_templates`, `platform_guardrails` (direto, globais — sem `organizationId`)
- `tenants/{orgId}/config/agent_config` → `tenant_agent_configs`, `tenants/{orgId}/onboarding/wizard_state` → `tenant_onboarding_wizard_state` (mesma abordagem de subcoleção, iterando `organizations` primeiro)
- `organizations/{orgId}/nfse` → `nfse_documents`, `organizations/{orgId}/nfse_logs` → `nfse_logs` (idem, valores em centavos preservados)
- `whatsapp_sessions` (direto)
- `audit_logs`, `system_logs`, `dead_letter_queue`, `migration_logs` (direto — dados históricos, não críticos para o funcionamento do app, mas preservados por completude/auditoria)
- `system_metrics/dashboard` (doc único) → `system_metrics_dashboard` (1 linha) + `lead_status_counts` (expandir o mapa `statusCounts` do doc em N linhas, uma por status)
- `metrics_raw`, `metrics_users`, `metrics_daily` (direto)
- `settings`, `config` → tabelas `settings`/`config` (SPEC.md §4.13, adicionadas numa revisão de correção — **não estavam nesta lista originalmente**). Transform trivial: `{ id: d.id, data: d, createdAt: ..., updatedAt: ... }` (guarda o documento inteiro em `data jsonb`, já que não há campos promovidos — o `id` já é a string composta `{orgId}::{id}` e vem direto do Firestore sem transformação).

- [ ] **Passo 2: Adicionar `fsQueryFullSubcollection` em `_api/lib/adminFirebase.ts`**

```ts
// _api/lib/adminFirebase.ts — nova função, reaproveitando getToken()/fromFirestoreFields já existentes
export async function fsQueryFullSubcollection(
  parentCollection: string, parentId: string, subcollection: string,
): Promise<Array<Record<string, any> & { id: string }>> {
  const token = await getToken();
  const res = await fetch(`${FS_BASE}/documents/${parentCollection}/${parentId}/${subcollection}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`fsQueryFullSubcollection ${parentCollection}/${parentId}/${subcollection}: ${await res.text()}`);
  const body: any = await res.json();
  return (body.documents ?? []).map((doc: any) => ({
    id: doc.name.split('/').pop(),
    ...fromFirestoreFields(doc.fields ?? {}),
  }));
}
```

- [ ] **Passo 3: Rodar dry-run de cada coleção listada no Passo 1, uma por vez**

Run: `npx tsx scripts/migrate-firestore-to-postgres.ts --dry-run --collection=<nome>` para cada uma, revisando a contagem impressa contra uma expectativa razoável (nº de clientes, campanhas, etc. que o time já conhece do sistema atual).

- [ ] **Passo 4: Commit**

```bash
git add scripts/migrate-firestore-to-postgres.ts _api/lib/adminFirebase.ts
git commit -m "feat: transforms de migração para as coleções restantes (mensagens, clientes/apólices, campanhas, e-mail, templates, NFS-e, métricas)"
```

---

### Task 5: Execução completa em staging + verificação de contagem

**Files:** nenhum arquivo novo — execução do script já completo

- [ ] **Passo 1: Dry-run completo**

Run: `npx tsx scripts/migrate-firestore-to-postgres.ts --dry-run`
Expected: imprime a contagem de TODAS as coleções, sem erro, sem escrever nada. Revisar a lista completa manualmente uma vez — qualquer contagem "0" inesperada é sinal de bug no `firestoreCollection` informado (nome errado) e deve ser corrigido antes do Passo 2.

- [ ] **Passo 2: Execução real contra um banco Neon de staging (branch separada do Neon, não a de produção)**

Run: `npx tsx scripts/migrate-firestore-to-postgres.ts --write` com `DATABASE_URL` apontando para uma **branch de staging do Neon** (`neonctl branches create --name staging` — recurso de branching mencionado na spec §ADR-Neon).

- [ ] **Passo 3: Verificação de contagem final**

Para cada coleção, comparar contagem Firestore (impressa no dry-run do Passo 1) contra `SELECT count(*) FROM <tabela>` no Postgres de staging via `db:studio` ou `psql`.
Expected: números idênticos (ou Postgres ≥ Firestore se o script já rodou mais de uma vez de forma idempotente — nunca menor).

- [ ] **Passo 4: Nenhum commit nesta tarefa** — é execução, não mudança de código.

---

## Self-Review desta fase

- Cobertura: todas as 29 coleções/subcoleções com dado existente real (32 do inventário total, excluindo as 2 tabelas do ADR-9 que nunca tiveram dado no Firestore e `processing_locks`, estado transitório) têm um transform na Task 2, 3 ou 4 — incluindo `settings`/`config`, adicionadas numa revisão de correção.
- Rollback (spec §9): nenhuma escrita no Firestore ocorre nesta fase — o Firestore permanece integralmente intacto e utilizável até a decisão manual de decomissionamento na Fase 6.
- Próxima fase: `2026-09-10-pg-migration-06-cutover-decommission.md`.
