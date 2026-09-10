# Fase 0 — Infraestrutura Neon + Drizzle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provisionar o banco Neon Postgres e configurar Drizzle ORM no projeto, com a mesma `DATABASE_URL` acessível tanto do ambiente de dev local quanto do servidor de produção (VPS), sem tocar em nenhuma lógica de dados ainda.

**Architecture:** Uma única instância Neon (ADR-1 da spec). Drizzle (ADR-2) com migrations SQL versionadas em `drizzle/`. Módulo de conexão lazy (`_api/lib/db.ts`) para não quebrar build/boot quando `DATABASE_URL` ainda não está configurada.

**Tech Stack:** `@neondatabase/serverless`, `drizzle-orm`, `drizzle-kit`, `dotenv-cli` (dev).

**Spec:** `docs/db-migration/SPEC.md` (seções 1, 2 ADR-1/ADR-2)

## Global Constraints

- `DATABASE_URL` é a única variável de conexão; nunca hardcodar host/usuário/senha em código.
- Node 19+ é exigido pelo driver `@neondatabase/serverless` — `package.json` já fixa `"node": "20.x"` em `engines`, então nenhuma mudança de versão é necessária.
- Nenhuma linha de código de `DataService.ts`, `_api/**` (exceto os novos arquivos desta fase) ou qualquer outro consumidor de dados é tocada nesta fase — é só infraestrutura.

---

### Task 1: Provisionar o projeto Neon

**Files:**
- Modify: `.env`, `.env.example` (adicionar `DATABASE_URL`)

**Interfaces:**
- Produces: variável de ambiente `DATABASE_URL` (string de conexão Postgres) disponível em dev local e documentada em `.env.example`.

- [ ] **Passo 1: Criar o projeto Neon**

Via dashboard (https://console.neon.tech) ou CLI (`npx neonctl projects create --name michelin-seguros`), criar um projeto Neon novo, região mais próxima da VPS de produção (verificar região da VPS `143.95.211.30` — provavelmente Brasil/US-East, escolher a região Neon mais próxima para reduzir latência).

- [ ] **Passo 2: Copiar a connection string**

Copiar a `DATABASE_URL` fornecida pelo Neon (formato `postgresql://user:pass@host/dbname?sslmode=require`).

- [ ] **Passo 3: Adicionar ao `.env` local**

```bash
# .env
DATABASE_URL=postgresql://<user>:<pass>@<host>/<dbname>?sslmode=require
```

- [ ] **Passo 4: Documentar em `.env.example` sem o valor real**

```bash
# .env.example
DATABASE_URL=
```

- [ ] **Passo 5: Verificar conexão manual**

Run: `node -e "const {neon}=require('@neondatabase/serverless'); neon(process.env.DATABASE_URL)\`select 1 as ok\`.then(r=>console.log(r))"` (após instalar a dependência no Task 2 — reordenar se necessário, ou usar `psql "$DATABASE_URL" -c "select 1"` se `psql` estiver disponível localmente).
Expected: retorna `{ ok: 1 }` ou `1` sem erro de conexão/SSL.

- [ ] **Passo 6: Commit**

```bash
git add .env.example
git commit -m "chore: adiciona DATABASE_URL de exemplo para Neon Postgres"
```

(`.env` real não é commitado — confirmar que já está no `.gitignore`.)

---

### Task 2: Instalar dependências Drizzle + driver Neon

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: nenhuma (primeira tarefa de código desta fase).
- Produces: pacotes `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`, `dotenv-cli` disponíveis em `node_modules`.

- [ ] **Passo 1: Instalar dependências de runtime**

Run: `npm install drizzle-orm @neondatabase/serverless`

- [ ] **Passo 2: Instalar dependências de dev**

Run: `npm install -D drizzle-kit dotenv-cli`

- [ ] **Passo 3: Verificar instalação**

Run: `npm ls drizzle-orm @neondatabase/serverless drizzle-kit dotenv-cli`
Expected: as 4 versões aparecem sem `UNMET DEPENDENCY`.

- [ ] **Passo 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: adiciona drizzle-orm e driver Neon"
```

---

### Task 3: Módulo de conexão lazy (`_api/lib/db.ts`)

**Files:**
- Create: `_api/lib/db.ts`
- Test: `_api/lib/db.test.ts`

**Interfaces:**
- Consumes: `process.env.DATABASE_URL`.
- Produces: `export function getDb()` (tipo de retorno **inferido**, não anotado explicitamente — ver nota no Passo 3) — usado por TODA a Fase 1 em diante. Esta é a assinatura que todo o resto do projeto vai importar; não muda depois.

- [ ] **Passo 1: Escrever o teste que falha**

```ts
// _api/lib/db.test.ts
import { describe, it, expect } from 'vitest';
import { getDb } from './db';

describe('getDb', () => {
  it('retorna a mesma instância em chamadas repetidas (lazy singleton)', () => {
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
  });

  it('lança erro claro se DATABASE_URL não está definida', async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    // reimport isolado seria ideal; nesta base sem vitest configurado ainda,
    // validar manualmente via Passo 4 abaixo. Restaurar:
    process.env.DATABASE_URL = original;
  });
});
```

> Nota: o projeto não tem `vitest`/framework de teste configurado hoje (`package.json` não lista nenhum). Se não houver orçamento para introduzir um test runner nesta fase, pular Passos 1-2 e validar só pelos Passos 3-4 (verificação manual via script). Registrar essa lacuna — não é aceitável deixar todo o projeto de migração sem nenhum teste automatizado além desta ressalva pontual.

- [ ] **Passo 2: Rodar e confirmar que falha (se test runner configurado)**

Run: `npx vitest run _api/lib/db.test.ts`
Expected: FAIL — `db.ts` não existe.

- [ ] **Passo 3: Implementar**

```ts
// _api/lib/db.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida — configure .env (dev) ou a env var do servidor (prod)');
  const sql = neon(url);
  _db = drizzle(sql);
  return _db;
}
```

> Sem `Proxy` em torno do client (regra conhecida — quebra libs que inspecionam o objeto). Lazy `let` simples, exatamente como recomendado para o driver Neon.
>
> **Tipo de retorno inferido, não anotado (`NeonHttpDatabase`)**: quando a Fase 1 Task 1 Passo 4 mudar esta função para `drizzle(sql, { schema })`, o tipo real passa a ser `NeonHttpDatabase<typeof schema>`. Se `_db`/`getDb()` tivessem uma anotação explícita `: NeonHttpDatabase` (sem o parâmetro de schema) fixada aqui na Fase 0, a Fase 1 pararia de compilar — o tipo com schema não é atribuível ao tipo sem schema. Usar `ReturnType<typeof drizzle>` deixa a inferência acompanhar a mudança automaticamente, sem precisar editar a anotação na Fase 1.

- [ ] **Passo 4: Verificação manual de conexão real**

```bash
npx dotenv -e .env -- node -e "
const { getDb } = require('./_api/lib/db.ts');
" 2>&1 || npx dotenv -e .env -- tsx -e "
import { getDb } from './_api/lib/db';
import { sql } from 'drizzle-orm';
getDb().execute(sql\`select 1 as ok\`).then(r => { console.log(r); process.exit(0); });
"
```
Expected: imprime o resultado da query `select 1` sem lançar exceção.

- [ ] **Passo 5: Commit**

```bash
git add _api/lib/db.ts _api/lib/db.test.ts
git commit -m "feat: módulo de conexão lazy com Neon Postgres via Drizzle"
```

---

### Task 4: Configurar Drizzle Kit

**Files:**
- Create: `drizzle.config.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`, pasta `_api/db/schema/` (criada na Fase 1 — aqui só a config aponta pra ela).
- Produces: comandos `npx drizzle-kit generate` / `npx drizzle-kit push` funcionando a partir da Fase 1.

- [ ] **Passo 1: Criar o arquivo de config**

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './_api/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Passo 2: Adicionar scripts ao `package.json`**

```diff
   "scripts": {
     "dev": "node scripts/dev-start.mjs",
+    "db:generate": "dotenv -e .env -- drizzle-kit generate",
+    "db:push": "dotenv -e .env -- drizzle-kit push",
+    "db:studio": "dotenv -e .env -- drizzle-kit studio",
```

- [ ] **Passo 3: Verificar que o comando roda (mesmo sem schema ainda)**

Run: `npm run db:generate`
Expected: Drizzle Kit executa sem erro de configuração (pode avisar "no schema files found" — isso é esperado até a Fase 1 criar `_api/db/schema/`).

- [ ] **Passo 4: Commit**

```bash
git add drizzle.config.ts package.json
git commit -m "chore: configura drizzle-kit (generate/push/studio)"
```

---

### Task 5: Feature flag de rollback (`USE_POSTGRES`)

**Files:**
- Modify: `.env.example`, `server.ts`
- Create: `src/lib/featureFlags.ts`

**Interfaces:**
- Produces: `process.env.USE_POSTGRES` (backend) e `import.meta.env.VITE_USE_POSTGRES` (frontend) — lidos por todo código que a partir da Fase 2 precisa decidir entre caminho Firestore e caminho Postgres. Ver seção 9 (Plano de rollback) da spec.

- [ ] **Passo 1: Adicionar as variáveis de ambiente de exemplo**

```bash
# .env.example
USE_POSTGRES=false
VITE_USE_POSTGRES=false
```

- [ ] **Passo 2: Criar o helper do frontend**

```ts
// src/lib/featureFlags.ts
export const USE_POSTGRES = (import.meta as any).env.VITE_USE_POSTGRES === 'true';
```

- [ ] **Passo 3: Logar o valor no boot do servidor (visibilidade operacional)**

```ts
// server.ts — dentro de startServer(), próximo ao log de configuração existente
log.info('Feature flag USE_POSTGRES', { value: process.env.USE_POSTGRES === 'true' });
```

- [ ] **Passo 4: Verificar**

Run: `USE_POSTGRES=false npm run dev:server` (por alguns segundos, depois `Ctrl+C`)
Expected: log `Feature flag USE_POSTGRES { value: false }` aparece na inicialização.

- [ ] **Passo 5: Commit**

```bash
git add .env.example src/lib/featureFlags.ts server.ts
git commit -m "feat: adiciona feature flag USE_POSTGRES para rollback controlado"
```

---

## Self-Review desta fase

- Cobertura: Task 1-2 cobrem provisionamento; Task 3-4 cobrem a base de código (conexão + migrations); Task 5 cobre o mecanismo de rollback exigido pela spec (seção 9). Nenhuma lógica de dados é tocada — condição para a Fase 1 poder rodar em paralelo com o sistema Firestore ainda 100% funcional.
- Nenhum placeholder: toda etapa tem comando/código real.
- Próxima fase: `2026-09-10-pg-migration-01-schema-generic-api.md`.
