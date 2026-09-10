# Fase 4 — Porte das rotas de API/VPS (`_api/**`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar `_api/lib/adminFirebase.ts` (cliente REST caseiro do Firestore, usado por ~28 arquivos de rota) por um módulo Postgres com **as mesmas assinaturas de função** — troca mecânica de import na maioria dos arquivos — e decidir/executar o destino dos caches em memória que hoje escondem uma lacuna de persistência (`docs/db-migration/INVENTORY.md` seção C).

**Architecture:** Novo módulo `_api/lib/pgData.ts` replica `fsGet/fsSet/fsUpdate/fsDelete/fsQuery/fsQueryFull` sobre Drizzle. Como o parser de filtro original (`buildStructuredQuery` em `adminFirebase.ts:131-147`) só suporta igualdade (`EQUAL`), a versão Postgres também só precisa de `eq()` — paridade exata, sem ganhar nem perder capacidade de filtro.

**Tech Stack:** Drizzle (Fase 1), `ENTITY_TABLE` (Fase 1/3).

**Spec:** `docs/db-migration/SPEC.md` §8 (risco 2); `docs/db-migration/INVENTORY.md` seção C.

## Global Constraints

- Esta fase só é segura de iniciar depois que a Task 1 (verificação de `api/index.js`) estiver resolvida — senão qualquer mudança em `_api/**` corre o risco de não valer nada em produção porque uma cópia duplicada continua servindo Firestore.
- `fsGet/fsSet/fsUpdate/fsDelete/fsQuery/fsQueryFull` do novo módulo têm **assinatura idêntica** à antiga — nenhum call-site desta fase muda lógica, só o import.

---

### Task 1: Verificar e resolver a duplicação `api/index.js`

**Files:**
- Investigar: `api/index.js`, `build-server.mjs`, `_api/server.ts`
- Possível ação: deletar `api/index.js` do controle de versão (se for só artefato de build) ou reconciliar (se editado manualmente)

- [ ] **Passo 1: Comparar `api/index.js` com uma rebuild fresca**

Run: `node build-server.mjs` (gera `api/index.js` de novo a partir de `_api/server.ts`) seguido de `git diff api/index.js`.
- Se `git diff` não mostra nenhuma diferença: `api/index.js` é 100% artefato de build, confirmado.
- Se mostra diferenças: alguém editou `api/index.js` manualmente em algum commit — usar `git log -p -- api/index.js` para achar o que foi adicionado manualmente e decidir se essa lógica precisa ser portada para `_api/server.ts` antes de continuar (senão a próxima rebuild apaga uma mudança que estava em produção).

- [ ] **Passo 2: Confirmar se `api/index.js`/`_api/server.ts` são efetivamente usados em produção**

Ler `_api/server.ts` por completo e comparar suas rotas contra `server.ts` (raiz) — são a mesma coisa ou `_api/server.ts` é um caminho alternativo/abandonado? Cruzar com `vercel.json` (rewrites `/api/*` para a VPS, não para uma function Vercel) — se `_api/server.ts`/`api/index.js` não são apontados por nenhuma configuração ativa de deploy, são código morto.

- [ ] **Passo 3: Decidir e agir**

- Se código morto confirmado: remover `api/index.js`, `_api/server.ts`, `build-server.mjs`, e o script `"build:server"` do `package.json`. Isso elimina de vez o risco do item 2 do registro de riscos da spec.
- Se ainda em uso por algum caminho de deploy não documentado aqui: **parar esta fase** e esclarecer com o usuário antes de prosseguir — migrar `_api/**` sem migrar esse caminho deixaria Firestore ativo em paralelo sem ninguém notar.

- [ ] **Passo 4: Commit (caso remoção confirmada)**

```bash
git rm api/index.js _api/server.ts build-server.mjs
git add package.json
git commit -m "chore: remove bundle Vercel Functions morto (backend real roda na VPS via server.ts)"
```

---

### Task 2: Módulo Postgres drop-in (`pgData.ts`) + troca mecânica de import

**Files:**
- Create: `_api/lib/pgData.ts`
- Modify: todos os 28 arquivos listados em `docs/db-migration/INVENTORY.md` seção C que importam `adminFirebase.ts`

**Interfaces:**
- Produces: `fsGet(collection, id)`, `fsSet(collection, id, data)`, `fsUpdate(collection, id, data)`, `fsDelete(collection, id)`, `fsQuery(collection, filters)`, `fsQueryFull(collection, filters, limitN?)` — assinaturas idênticas a `_api/lib/adminFirebase.ts` original.

- [ ] **Passo 1: Implementar `pgData.ts`**

```ts
// _api/lib/pgData.ts
import { eq, and } from 'drizzle-orm';
import { getDb } from './db';
import { ENTITY_TABLE } from '../data/entityMap';

function resolveTable(collection: string) {
  const table = ENTITY_TABLE[collection];
  if (!table) throw new Error(`pgData: entidade desconhecida "${collection}" — adicione em _api/data/entityMap.ts`);
  return table;
}

export async function fsGet(collection: string, id: string): Promise<Record<string, any> | null> {
  const table = resolveTable(collection);
  const [row] = await getDb().select().from(table).where(eq(table.id, id));
  return row ?? null;
}

export async function fsSet(collection: string, id: string, data: Record<string, any>): Promise<void> {
  const table = resolveTable(collection);
  await getDb().insert(table).values({ ...data, id })
    .onConflictDoUpdate({ target: table.id, set: data });
}

export async function fsUpdate(collection: string, id: string, data: Record<string, any>): Promise<void> {
  const table = resolveTable(collection);
  await getDb().update(table).set(data).where(eq(table.id, id));
}

export async function fsDelete(collection: string, id: string): Promise<void> {
  const table = resolveTable(collection);
  await getDb().delete(table).where(eq(table.id, id));
}

// Paridade exata com adminFirebase.ts: o parser original (buildStructuredQuery) só suporta
// filtros de igualdade — esta versão também só implementa eq(), de propósito.
function buildEqFilters(table: any, filters: Array<{ field: string; value: string }>) {
  const clauses = filters.map(f => eq(table[f.field], f.value));
  return clauses.length > 1 ? and(...clauses) : clauses[0];
}

export async function fsQuery(collection: string, filters: Array<{ field: string; value: string }>): Promise<Array<{ id: string }>> {
  const table = resolveTable(collection);
  const rows = await getDb().select({ id: table.id }).from(table).where(buildEqFilters(table, filters)).limit(1);
  return rows;
}

export async function fsQueryFull(
  collection: string,
  filters: Array<{ field: string; value: string }>,
  limitN = 500,
): Promise<Array<Record<string, any> & { id: string }>> {
  const table = resolveTable(collection);
  return getDb().select().from(table).where(buildEqFilters(table, filters)).limit(limitN);
}
```

- [ ] **Passo 2: Localizar todos os arquivos a trocar**

Run: `grep -rln "from '.*adminFirebase" _api`
Expected: os 28 arquivos já listados em `docs/db-migration/INVENTORY.md` seção C (mais `_api/lib/emailSync.ts`, `gmailClient.ts`, `microsoftClient.ts` se não estiverem contados separadamente).

- [ ] **Passo 3: Trocar o import em cada um (mecânico)**

```diff
- import { fsGet, fsSet, fsUpdate, fsDelete, fsQuery, fsQueryFull } from '../lib/adminFirebase';
+ import { fsGet, fsSet, fsUpdate, fsDelete, fsQuery, fsQueryFull } from '../lib/pgData';
```

(Ajustar quais das 6 funções cada arquivo de fato importa — nem todos usam as 6; trocar só as que aparecem.)

- [ ] **Passo 4: Confirmar que nenhum arquivo ficou órfão do import antigo**

Run: `grep -rln "adminFirebase" _api`
Expected: vazio (ou só `_api/lib/adminFirebase.ts` em si, que pode ser deletado depois da Fase 6, não agora — mantido por rollback via `USE_POSTGRES` nas rotas que ainda tiverem um `if` explícito, ver Passo 5).

- [ ] **Passo 5: Build e typecheck**

Run: `npm run build` (frontend) e `npx tsc --noEmit -p .` para os arquivos `_api/**` (ou `tsx --check` se não houver `tsconfig` dedicado ao backend — confirmar qual comando de typecheck o projeto já usa para `_api/**`, se algum, antes de assumir `tsc`).
Expected: sem erro de tipo — assinaturas idênticas devem compilar sem ajuste adicional em cada call-site.

- [ ] **Passo 6: Verificação manual — um fluxo por domínio**

- Webhook Evolution: disparar um evento de teste (mensagem recebida) contra `_api/webhook/evolution.ts` local, confirmar gravação em `whatsapp_sessions`/`leads` no Neon.
- Campanha: `_api/campaigns/start.ts` com uma lista de teste pequena, confirmar `campaigns`/`campaign_log`.
- E-mail: `_api/email/accounts.ts` listando contas de um usuário de teste, confirmar leitura de `email_accounts`.

- [ ] **Passo 7: Commit**

```bash
git add _api/lib/pgData.ts _api
git commit -m "feat: substitui cliente REST do Firestore por Drizzle/Postgres em todas as rotas _api/**"
```

---

### Task 3: Decisão e execução — estado efêmero em memória (ADR-9)

**Files:**
- Modify (se decisão = promover): `_api/lib/conversationCache.ts`, `_api/webhook/evolution.ts`, `_api/evolution/{conversation,conversations,messages}.ts`
- Sem alteração de schema (se decisão = manter em memória)

> **Checkpoint de decisão explícito — não prosseguir sem confirmar com o usuário.** A spec (ADR-9) já projetou o schema de `whatsapp_conversations`/`whatsapp_messages` como tabelas reais para esta eventualidade. As duas opções abaixo são igualmente válidas tecnicamente; a escolha é do usuário porque envolve trade-off de comportamento, não só de banco.

- [ ] **Passo 1: Confirmar a decisão com o usuário** — "promover para tabelas Postgres reais (corrige o bug de estado por instância já visto nos commits recentes) ou manter em `Map` de memória (comportamento atual preservado, risco conhecido permanece)?"

- [ ] **Passo 2a (se "promover"): reescrever `conversationCache.ts` para write-through**

```diff
  // _api/lib/conversationCache.ts
- const conversations = new Map<string, WhatsAppConversation>();
- export function upsertConversation(c: WhatsAppConversation) { conversations.set(c.id, c); }
- export function getConversation(id: string) { return conversations.get(id); }
+ import { fsGet, fsSet } from './pgData';
+ export async function upsertConversation(c: WhatsAppConversation) { await fsSet('whatsapp_conversations', c.id, c); }
+ export async function getConversation(id: string) { return fsGet('whatsapp_conversations', id); }
```

Repetir para as funções de mensagens (`whatsapp_messages`), tornando todas as funções deste módulo `async` — propagar `await` nos ~6 call-sites em `_api/webhook/evolution.ts` e `_api/evolution/*.ts` que hoje chamam essas funções de forma síncrona.

- [ ] **Passo 2b (se "manter em memória"): nenhuma mudança de código nesta tarefa** — registrar em `docs/db-migration/SPEC.md` seção 8 (risco 3) que a decisão foi mantida como está, para não ser reaberta sem contexto numa fase futura.

- [ ] **Passo 3: Verificação manual (se 2a)**

Reiniciar o processo do servidor (`npm run dev:server`) no meio de uma conversa de WhatsApp de teste e confirmar que o histórico de conversa/mensagens sobrevive ao restart (lendo do Postgres em vez do `Map` que seria zerado).

- [ ] **Passo 4: Commit**

```bash
git add _api/lib/conversationCache.ts _api/webhook/evolution.ts _api/evolution
git commit -m "feat: conversationCache passa a persistir em Postgres (corrige perda de estado entre instâncias)"
```
(ou, se decisão 2b, nenhum commit de código — só a atualização da spec.)

---

## Self-Review desta fase

- Todos os 28+ arquivos da seção C do Inventory são cobertos pela troca mecânica da Task 2 (verificável por grep, não por lista manual sujeita a esquecimento).
- O risco 2 da spec (duplicação `api/index.js`) é resolvido ANTES de qualquer outra mudança nesta fase (Task 1), não depois.
- A mudança de comportamento do ADR-9 é um checkpoint explícito de decisão do usuário, não uma suposição silenciosa.
- Próxima fase: `2026-09-10-pg-migration-05-data-migration.md`.
