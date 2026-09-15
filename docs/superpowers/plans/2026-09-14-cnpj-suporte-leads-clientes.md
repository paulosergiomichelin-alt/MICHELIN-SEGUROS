# Suporte a CNPJ em Leads e Clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar suporte a cadastro de pessoa jurídica (CNPJ) em Leads e Clientes — campo único CPF/CNPJ com detecção automática, busca e preenchimento automático dos dados da empresa via BrasilAPI, e telas de exibição adaptadas.

**Architecture:** `tipoPessoa` + `cpf` opcional nas tabelas principais (`leads`/`clientes`); dados de pessoa jurídica em tabelas satélite 1:1 (`lead_pessoa_juridica`/`cliente_pessoa_juridica`, chave primária = `leadId`/`clienteId`) acessadas pelo mecanismo genérico de coleções já usado por `cliente_relacionamentos` (registro em `entityMap.ts`/`tenantMiddleware.ts`, chamadas via `dataApiClient` direto — sem `DataService`, que assume PK `id`). Busca de CNPJ via rota nova no backend (`GET /api/cnpj/:cnpj`, `requireAuth`) proxeando a BrasilAPI.

**Tech Stack:** React + TypeScript (frontend), Express + Drizzle/Postgres (backend), Vitest.

**Spec:** `docs/cnpj-suporte/SPEC.md`

## Global Constraints

- CPF deixa de ser `NOT NULL` em `leads`/`clientes` — migração aditiva, sem backfill (todo registro existente já é `tipoPessoa: 'fisica'` por definição).
- Nenhum comportamento de pessoa física existente pode mudar visivelmente — todo o código novo é condicional em `tipoPessoa === 'juridica'`.
- Aplicar mudanças de schema com `npm run db:push` (não `drizzle-kit generate` — este projeto não gera arquivos de migração versionados desde a migração inicial; `db:push` é o mecanismo já usado nas fases anteriores, incluindo a Agenda).
- Tabelas satélite (`cliente_pessoa_juridica`/`lead_pessoa_juridica`) são acessadas via `dataApiClient` (import de `src/lib/dataApiClient.ts`) diretamente — **não** via `DataService.create/update`, que assume que a chave primária do payload se chama `id` (não é o caso aqui: a PK é `clienteId`/`leadId`).
- CNPJ da BrasilAPI **não inclui inscrição estadual de forma confiável** — o campo `inscricaoEstadual` existe no schema e no formulário para preenchimento manual, mas não é preenchido automaticamente pela busca.
- Endereço da empresa: em `cliente_pessoa_juridica` não existe coluna de endereço própria — reaproveita `clientes.cep/rua/numero/complemento/bairro/cidade/estado`. Em `lead_pessoa_juridica` existe coluna de endereço própria, porque `leads` não tem colunas de endereço promovidas.
- Convenção de armazenamento do documento (CPF/CNPJ) **difere por entidade** e deve ser preservada tal como já é hoje: `clientes.cpf` guarda dígitos limpos (sem pontuação); `leads.cpf` guarda o valor formatado (com pontuação) — o novo `cnpj` segue a mesma convenção da tabela em que vive.
- `ContactImport.tsx` (Leads) **não precisa de mudança** — contatos importados de agenda de telefone nunca têm CNPJ; a coluna `tipoPessoa` cai no default `'fisica'` do banco automaticamente.

---

### Task 1: Schema — `tipoPessoa`, CPF opcional, tabelas satélite

**Files:**
- Modify: `_api/db/schema/clientes.ts`
- Modify: `_api/db/schema/leads.ts`
- Modify: `_api/data/entityMap.ts`
- Modify: `_api/data/tenantMiddleware.ts`

**Interfaces:**
- Produces: tabelas Drizzle `clientePessoaJuridica` (PK `clienteId`) e `leadPessoaJuridica` (PK `leadId`), exportadas de `_api/db/schema/index.ts` via `export *` já existente (nenhuma mudança necessária nesse arquivo). Ambas registradas em `ENTITY_TABLE`/`PK_COLUMN` (chaves: `cliente_pessoa_juridica`/`lead_pessoa_juridica`) e em `ORG_SCOPED_ENTITIES`.

- [ ] **Step 1: Editar `_api/db/schema/clientes.ts`**

Adicionar `tipoPessoa`, tornar `cpf` opcional, e adicionar a tabela `clientePessoaJuridica` no fim do arquivo:

```ts
// Na definição de `clientes`, trocar a linha:
//   cpf: text('cpf').notNull(),
// por:
  cpf: text('cpf'), // opcional — nulo quando tipoPessoa === 'juridica'
  tipoPessoa: text('tipo_pessoa').notNull().default('fisica'), // 'fisica' | 'juridica'
```

(Adicionar `tipoPessoa` logo após `cpf` na definição de `clientes`.)

No fim do arquivo, depois de `clienteRelacionamentos`:

```ts
export const clientePessoaJuridica = pgTable('cliente_pessoa_juridica', {
  clienteId: text('cliente_id').primaryKey().references(() => clientes.id),
  organizationId: text('organization_id').references(() => organizations.id),
  cnpj: text('cnpj').notNull(),
  razaoSocial: text('razao_social').notNull(),
  nomeFantasia: text('nome_fantasia'),
  inscricaoEstadual: text('inscricao_estadual'),
  situacaoCadastral: text('situacao_cadastral'),
  porte: text('porte'),
  cnae: text('cnae'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_cliente_pj_cnpj').on(t.cnpj),
]);
```

- [ ] **Step 2: Editar `_api/db/schema/leads.ts`**

Na definição de `leads`, trocar:
```ts
  cpf: text('cpf').notNull(),
```
por:
```ts
  cpf: text('cpf'), // opcional — nulo quando tipoPessoa === 'juridica'
  tipoPessoa: text('tipo_pessoa').notNull().default('fisica'), // 'fisica' | 'juridica'
```

No fim do arquivo (depois de `learningMemory`), adicionar (precisa importar `index` de `drizzle-orm/pg-core`, já importado no topo do arquivo):

```ts
export const leadPessoaJuridica = pgTable('lead_pessoa_juridica', {
  leadId: text('lead_id').primaryKey().references(() => leads.id),
  organizationId: text('organization_id').references(() => organizations.id),
  cnpj: text('cnpj').notNull(),
  razaoSocial: text('razao_social').notNull(),
  nomeFantasia: text('nome_fantasia'),
  inscricaoEstadual: text('inscricao_estadual'),
  situacaoCadastral: text('situacao_cadastral'),
  porte: text('porte'),
  cnae: text('cnae'),
  cep: text('cep'),
  rua: text('rua'),
  numero: text('numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  estado: text('estado'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_pj_cnpj').on(t.cnpj),
]);
```

- [ ] **Step 3: Registrar as duas tabelas em `_api/data/entityMap.ts`**

Adicionar em `ENTITY_TABLE` (depois da linha de `cliente_relacionamentos`):
```ts
  cliente_pessoa_juridica: schema.clientePessoaJuridica,
  lead_pessoa_juridica: schema.leadPessoaJuridica,
```

Adicionar em `PK_COLUMN`:
```ts
  cliente_pessoa_juridica: 'clienteId',
  lead_pessoa_juridica: 'leadId',
```

- [ ] **Step 4: Registrar em `_api/data/tenantMiddleware.ts`**

Adicionar ao `Set` de `ORG_SCOPED_ENTITIES`:
```ts
  'cliente_pessoa_juridica', 'lead_pessoa_juridica',
```

- [ ] **Step 5: Aplicar o schema no banco**

Run: `npm run db:push`
Expected: confirma a criação das duas tabelas novas e a alteração de `cpf`/`tipo_pessoa` em `leads`/`clientes`, sem erro. Responder "yes"/confirmar quando o drizzle-kit perguntar sobre a coluna `cpf` deixar de ser NOT NULL (é uma mudança segura, aditiva).

- [ ] **Step 6: Commit**

```bash
git add _api/db/schema/clientes.ts _api/db/schema/leads.ts _api/data/entityMap.ts _api/data/tenantMiddleware.ts
git commit -m "feat: schema de pessoa jurídica (tipoPessoa, cpf opcional, tabelas satélite cliente/lead_pessoa_juridica)"
```

---

### Task 2: Utilitários de CNPJ (`src/lib/utils.ts`)

**Files:**
- Modify: `src/lib/utils.ts`
- Test: `src/lib/__tests__/utils.cnpj.test.ts`

**Interfaces:**
- Produces: `formatCNPJ(cnpj: string): string`, `validateCNPJ(cnpj: string): boolean`, `maskCNPJ(cnpj: string): string`, `formatCpfCnpjProgressive(value: string): string`, `detectTipoPessoa(value: string): 'fisica' | 'juridica'` — todos exportados de `src/lib/utils.ts`, ao lado de `formatCPF`/`validateCPF`/`maskCPF` já existentes.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/lib/__tests__/utils.cnpj.test.ts
import { describe, it, expect } from 'vitest';
import { formatCNPJ, validateCNPJ, maskCNPJ, formatCpfCnpjProgressive, detectTipoPessoa } from '../utils';

describe('formatCNPJ', () => {
  it('formata 14 dígitos', () => {
    expect(formatCNPJ('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('retorna o valor original se não tiver 14 dígitos', () => {
    expect(formatCNPJ('123')).toBe('123');
  });
});

describe('validateCNPJ', () => {
  it('aceita um CNPJ válido conhecido', () => {
    expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
  });
  it('rejeita dígito verificador errado', () => {
    expect(validateCNPJ('11.222.333/0001-80')).toBe(false);
  });
  it('rejeita todos os dígitos iguais', () => {
    expect(validateCNPJ('11111111111111')).toBe(false);
  });
  it('rejeita tamanho errado', () => {
    expect(validateCNPJ('123')).toBe(false);
  });
});

describe('maskCNPJ', () => {
  it('mascara os dígitos do meio', () => {
    expect(maskCNPJ('11222333000181')).toBe('11.***.***/****-81');
  });
  it('retorna --- para valor vazio', () => {
    expect(maskCNPJ('')).toBe('---');
  });
});

describe('detectTipoPessoa', () => {
  it('até 11 dígitos é pessoa física', () => {
    expect(detectTipoPessoa('12345678901')).toBe('fisica');
    expect(detectTipoPessoa('123')).toBe('fisica');
    expect(detectTipoPessoa('')).toBe('fisica');
  });
  it('a partir de 12 dígitos é pessoa jurídica', () => {
    expect(detectTipoPessoa('123456789012')).toBe('juridica');
    expect(detectTipoPessoa('11222333000181')).toBe('juridica');
  });
});

describe('formatCpfCnpjProgressive', () => {
  it('formata como CPF progressivamente até 11 dígitos', () => {
    expect(formatCpfCnpjProgressive('123')).toBe('123');
    expect(formatCpfCnpjProgressive('123456789')).toBe('123.456.789');
    expect(formatCpfCnpjProgressive('12345678901')).toBe('123.456.789-01');
  });
  it('formata como CNPJ progressivamente a partir do 12º dígito', () => {
    expect(formatCpfCnpjProgressive('123456789012')).toBe('12.345.678/9012');
    expect(formatCpfCnpjProgressive('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('ignora caracteres não numéricos e limita a 14 dígitos', () => {
    expect(formatCpfCnpjProgressive('11.222.333/0001-8199')).toBe('11.222.333/0001-81');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/lib/__tests__/utils.cnpj.test.ts`
Expected: FAIL — `formatCNPJ`/`validateCNPJ`/etc. não existem ainda em `utils.ts`.

- [ ] **Step 3: Implementar em `src/lib/utils.ts`**

Adicionar depois de `maskCPF` (que já existe no arquivo):

```ts
export function formatCNPJ(cnpj: string) {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12)}`;
}

export function validateCNPJ(cnpj: string) {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return false;
  if (/^(\d)\1+$/.test(clean)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((acc, digit, i) => acc + parseInt(digit, 10) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const digit1 = calcDigit(clean.substring(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (digit1 !== parseInt(clean.charAt(12), 10)) return false;

  const digit2 = calcDigit(clean.substring(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (digit2 !== parseInt(clean.charAt(13), 10)) return false;

  return true;
}

export function maskCNPJ(cnpj: string) {
  if (!cnpj) return '---';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return `${clean.slice(0, 2)}.***.***/****-${clean.slice(12)}`;
}

// Documento único CPF/CNPJ que se detecta pelo tamanho: até 11 dígitos é tratado
// como CPF em digitação (mesmo que ainda incompleto), a partir do 12º dígito já é
// CNPJ — não existe ambiguidade real porque nenhum CPF tem mais de 11 dígitos.
export function detectTipoPessoa(value: string): 'fisica' | 'juridica' {
  const clean = value.replace(/\D/g, '');
  return clean.length > 11 ? 'juridica' : 'fisica';
}

// Máscara progressiva (formata a cada tecla) do campo único CPF/CNPJ — troca de
// máscara em tempo real assim que o tamanho ultrapassa o de um CPF, sem esperar
// completar os 14 dígitos.
export function formatCpfCnpjProgressive(value: string): string {
  const clean = value.replace(/\D/g, '').slice(0, 14);
  if (clean.length <= 11) {
    let r = '';
    for (let i = 0; i < clean.length; i++) {
      if (i === 3 || i === 6) r += '.';
      if (i === 9) r += '-';
      r += clean[i];
    }
    return r;
  }
  let r = '';
  for (let i = 0; i < clean.length; i++) {
    if (i === 2 || i === 5) r += '.';
    if (i === 8) r += '/';
    if (i === 12) r += '-';
    r += clean[i];
  }
  return r;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/lib/__tests__/utils.cnpj.test.ts`
Expected: PASS — todos os testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/lib/__tests__/utils.cnpj.test.ts
git commit -m "feat: utilitários de CNPJ (formatar, validar, mascarar, detectar tipo de pessoa)"
```

---

### Task 3: Rota de busca de CNPJ (backend)

**Files:**
- Create: `_api/cnpj/lookup.ts`
- Test: `_api/cnpj/__tests__/lookup.test.ts`
- Modify: `server.ts`

**Interfaces:**
- Produces: `GET /api/cnpj/:cnpj` (protegida por `requireAuth`) → `200 { cnpj, razaoSocial, nomeFantasia, situacaoCadastral, porte, cnae, cep, rua, numero, complemento, bairro, cidade, estado }` | `400` (CNPJ mal formatado) | `404` (não encontrado) | `502` (BrasilAPI indisponível).

- [ ] **Step 1: Escrever os testes que falham**

```ts
// _api/cnpj/__tests__/lookup.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from '../lookup.js';

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('_api/cnpj/lookup handler', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('rejeita CNPJ com menos de 14 dígitos antes de chamar a API', async () => {
    global.fetch = vi.fn();
    const req = { method: 'GET', params: { cnpj: '123' } };
    const res = makeRes();

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('busca na BrasilAPI e mapeia os campos pro formato interno', async () => {
    global.fetch = vi.fn(async (url: any) => {
      expect(String(url)).toBe('https://brasilapi.com.br/api/cnpj/v1/11222333000181');
      return {
        ok: true, status: 200,
        json: async () => ({
          cnpj: '11222333000181',
          razao_social: 'Empresa Exemplo LTDA',
          nome_fantasia: 'Exemplo',
          descricao_situacao_cadastral: 'ATIVA',
          descricao_porte: 'DEMAIS',
          cnae_fiscal_descricao: 'Desenvolvimento de programas de computador sob encomenda',
          cep: '01310100',
          logradouro: 'Avenida Paulista',
          numero: '1000',
          complemento: 'Sala 1',
          bairro: 'Bela Vista',
          municipio: 'São Paulo',
          uf: 'SP',
        }),
      };
    }) as any;

    const req = { method: 'GET', params: { cnpj: '11.222.333/0001-81' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      cnpj: '11222333000181',
      razaoSocial: 'Empresa Exemplo LTDA',
      nomeFantasia: 'Exemplo',
      situacaoCadastral: 'ATIVA',
      porte: 'DEMAIS',
      cnae: 'Desenvolvimento de programas de computador sob encomenda',
      cep: '01310100',
      rua: 'Avenida Paulista',
      numero: '1000',
      complemento: 'Sala 1',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      estado: 'SP',
    });
  });

  it('devolve 404 quando a BrasilAPI não encontra o CNPJ', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, text: async () => 'not found' })) as any;
    const req = { method: 'GET', params: { cnpj: '11222333000181' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('devolve 502 quando a BrasilAPI responde outro erro', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' })) as any;
    const req = { method: 'GET', params: { cnpj: '11222333000181' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run _api/cnpj/__tests__/lookup.test.ts`
Expected: FAIL — `_api/cnpj/lookup.ts` não existe.

- [ ] **Step 3: Implementar `_api/cnpj/lookup.ts`**

```ts
const BRASIL_API_BASE = 'https://brasilapi.com.br/api/cnpj/v1';

interface BrasilApiCnpjResponse {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  descricao_porte?: string;
  cnae_fiscal_descricao?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const digits = String(req.params?.cnpj ?? '').replace(/\D/g, '');
  if (digits.length !== 14) {
    return res.status(400).json({ error: 'CNPJ precisa ter 14 dígitos' });
  }

  try {
    const apiRes = await fetch(`${BRASIL_API_BASE}/${digits}`);

    if (!apiRes.ok) {
      if (apiRes.status === 404) {
        return res.status(404).json({ error: 'CNPJ não encontrado' });
      }
      const detail = await apiRes.text();
      console.error('[cnpj/lookup] BrasilAPI error:', apiRes.status, detail);
      return res.status(502).json({ error: 'Falha ao consultar a BrasilAPI', detail });
    }

    const data = await apiRes.json() as BrasilApiCnpjResponse;

    return res.status(200).json({
      cnpj: data.cnpj,
      razaoSocial: data.razao_social,
      nomeFantasia: data.nome_fantasia ?? null,
      situacaoCadastral: data.descricao_situacao_cadastral ?? null,
      porte: data.descricao_porte ?? null,
      cnae: data.cnae_fiscal_descricao ?? null,
      cep: data.cep ?? null,
      rua: data.logradouro ?? null,
      numero: data.numero ?? null,
      complemento: data.complemento ?? null,
      bairro: data.bairro ?? null,
      cidade: data.municipio ?? null,
      estado: data.uf ?? null,
    });
  } catch (err: any) {
    console.error('[cnpj/lookup] error:', err);
    return res.status(502).json({ error: 'Erro ao consultar CNPJ', detail: err?.message });
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run _api/cnpj/__tests__/lookup.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Registrar a rota em `server.ts`, com `requireAuth`**

Seguir o padrão já usado em `/api/data/apolices` (linhas ~156-166 de `server.ts`, import dinâmico de `requireAuth` inline na própria seção de registro), adicionar depois do bloco "Calendar Module routes":

```ts
  // ── CNPJ lookup (BrasilAPI) ───────────────────────────────────────────────────
  const { requireAuth: requireAuthForCnpj } = await import('./_api/lib/authMiddleware.js');
  const { default: cnpjLookupHandler } = await import('./_api/cnpj/lookup.js');
  app.get('/api/cnpj/:cnpj', requireAuthForCnpj, cnpjLookupHandler);
  log.info('Rota de busca de CNPJ registrada');
```

- [ ] **Step 6: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add _api/cnpj/lookup.ts _api/cnpj/__tests__/lookup.test.ts server.ts
git commit -m "feat: rota de busca de CNPJ via BrasilAPI (GET /api/cnpj/:cnpj)"
```

---

### Task 4: Tipos e serviço de CNPJ (frontend)

**Files:**
- Modify: `src/types.ts`
- Create: `src/services/CnpjService.ts`
- Test: `src/services/__tests__/CnpjService.test.ts`

**Interfaces:**
- Consumes: `GET /api/cnpj/:cnpj` (Task 3).
- Produces: `CnpjService.lookup(cnpj: string): Promise<DadosEmpresa>` (lança erro em falha, com a mensagem do backend quando disponível); tipos `TipoPessoa`, `ClientePessoaJuridica`, `LeadPessoaJuridica` exportados de `src/types.ts`; `Lead.tipoPessoa`/`Lead.cnpj` e `Cliente.tipoPessoa` adicionados às interfaces existentes.

- [ ] **Step 1: Adicionar tipos em `src/types.ts`**

Adicionar antes da interface `Lead` (linha ~99):

```ts
export type TipoPessoa = 'fisica' | 'juridica';
```

Dentro da interface `Lead`, trocar `cpf: string;` (linha ~122) por `cpf?: string;` (a coluna do banco deixou de ser `NOT NULL` no Task 1 — o tipo TS precisa acompanhar) e adicionar logo abaixo:
```ts
  tipoPessoa?: TipoPessoa;
  cnpj?: string;
```

Dentro da interface `Cliente`, trocar `cpf: string;` (linha ~411) por `cpf?: string;` pelo mesmo motivo, e adicionar logo abaixo:
```ts
  tipoPessoa?: TipoPessoa;
```

Depois da interface `Cliente` (depois da linha 440, antes de `ClienteRelacionamento`), adicionar:

```ts
export interface DadosEmpresa {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  situacaoCadastral?: string | null;
  porte?: string | null;
  cnae?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

export interface ClientePessoaJuridica extends DadosEmpresa {
  clienteId: string;
  organizationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeadPessoaJuridica extends DadosEmpresa {
  leadId: string;
  organizationId?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

- [ ] **Step 2: Escrever o teste que falha pro `CnpjService`**

```ts
// src/services/__tests__/CnpjService.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CnpjService } from '../CnpjService';

describe('CnpjService.lookup', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('chama a rota certa e devolve os dados da empresa', async () => {
    global.fetch = vi.fn(async (url: any) => {
      expect(String(url)).toBe('/api/cnpj/11222333000181');
      return { ok: true, status: 200, json: async () => ({ cnpj: '11222333000181', razaoSocial: 'Empresa Exemplo LTDA' }) };
    }) as any;

    const result = await CnpjService.lookup('11.222.333/0001-81');
    expect(result).toEqual({ cnpj: '11222333000181', razaoSocial: 'Empresa Exemplo LTDA' });
  });

  it('lança erro com a mensagem do backend quando a resposta não é ok', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'CNPJ não encontrado' }) })) as any;

    await expect(CnpjService.lookup('11222333000181')).rejects.toThrow('CNPJ não encontrado');
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/services/__tests__/CnpjService.test.ts`
Expected: FAIL — `CnpjService.ts` não existe.

- [ ] **Step 4: Implementar `src/services/CnpjService.ts`**

```ts
import type { DadosEmpresa } from '../types';

export const CnpjService = {
  async lookup(cnpj: string): Promise<DadosEmpresa> {
    const digits = cnpj.replace(/\D/g, '');
    const res = await fetch(`/api/cnpj/${digits}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `Falha ao buscar CNPJ (${res.status})`);
    }
    return res.json();
  },
};
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/services/__tests__/CnpjService.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/services/CnpjService.ts src/services/__tests__/CnpjService.test.ts
git commit -m "feat: tipos de pessoa jurídica e serviço de busca de CNPJ no frontend"
```

---

### Task 5: `ClienteForm.tsx` — campo único CPF/CNPJ e seção de empresa

**Files:**
- Modify: `src/domains/clientes/ClienteForm.tsx`

**Interfaces:**
- Consumes: `CnpjService.lookup` (Task 4), `formatCpfCnpjProgressive`/`detectTipoPessoa`/`formatCNPJ` (Task 2), `dataApiClient` (`src/lib/dataApiClient.ts`, já existe), `ClientePessoaJuridica`/`DadosEmpresa` (Task 4).
- Produces: ao salvar um cliente PJ, grava `tipoPessoa: 'juridica'`, `cpf: undefined` na linha principal, e faz upsert de `cliente_pessoa_juridica` via `dataApiClient.save('cliente_pessoa_juridica', clienteId, {...})`.

- [ ] **Step 1: Importar o necessário**

No topo de `src/domains/clientes/ClienteForm.tsx`, adicionar aos imports existentes de `../../lib/utils`:
```ts
import { cn, formatCPF, generateId, formatCpfCnpjProgressive, detectTipoPessoa, formatCNPJ, validateCNPJ } from '../../lib/utils';
```
Adicionar novos imports:
```ts
import { CnpjService } from '../../services/CnpjService';
import { dataApiClient } from '../../lib/dataApiClient';
import type { DadosEmpresa, TipoPessoa } from '../../types';
```

- [ ] **Step 2: Adicionar estado de pessoa jurídica**

Depois de `const [sexo, setSexo] = useState<'M' | 'F' | ''>('');` (linha 90), adicionar:

```ts
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa>('fisica');
  const [pj, setPj] = useState({
    cnpj: '', razaoSocial: '', nomeFantasia: '', inscricaoEstadual: '', situacaoCadastral: '', porte: '', cnae: '',
  });
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [cnpjError, setCnpjError] = useState('');
```

- [ ] **Step 3: Carregar dados de PJ ao abrir o formulário pra edição**

No `useEffect` que popula o `form` a partir de `cliente` (linha ~98-135), adicionar a leitura do tipo de pessoa e, se for PJ, buscar a linha satélite. Trocar:

```ts
  useEffect(() => {
    if (cliente) {
      setForm({
```

por:

```ts
  useEffect(() => {
    if (cliente) {
      setTipoPessoa(cliente.tipoPessoa ?? 'fisica');
      if (cliente.tipoPessoa === 'juridica') {
        dataApiClient.get('cliente_pessoa_juridica', cliente.id).then((row: any) => {
          if (row) {
            setPj({
              cnpj: formatCNPJ(row.cnpj ?? ''),
              razaoSocial: row.razaoSocial ?? '',
              nomeFantasia: row.nomeFantasia ?? '',
              inscricaoEstadual: row.inscricaoEstadual ?? '',
              situacaoCadastral: row.situacaoCadastral ?? '',
              porte: row.porte ?? '',
              cnae: row.cnae ?? '',
            });
          }
        }).catch(() => {});
      } else {
        setPj({ cnpj: '', razaoSocial: '', nomeFantasia: '', inscricaoEstadual: '', situacaoCadastral: '', porte: '', cnae: '' });
      }
      setForm({
```

(o resto do bloco `setForm({...})` continua idêntico — só a chamada em si ganhou esse código antes dela). No branch `else` do mesmo `useEffect` (quando `!cliente`, formulário de criação), adicionar logo no início desse branch:
```ts
      setTipoPessoa('fisica');
      setPj({ cnpj: '', razaoSocial: '', nomeFantasia: '', inscricaoEstadual: '', situacaoCadastral: '', porte: '', cnae: '' });
```

- [ ] **Step 4: Implementar `buscarCnpj`**

Adicionar depois de `fetchCep` (linha ~173):

```ts
  const buscarCnpj = async (digits: string) => {
    setLoadingCnpj(true);
    setCnpjError('');
    try {
      const data: DadosEmpresa = await CnpjService.lookup(digits);
      setPj(p => ({
        ...p,
        razaoSocial: data.razaoSocial ?? p.razaoSocial,
        nomeFantasia: data.nomeFantasia ?? p.nomeFantasia,
        situacaoCadastral: data.situacaoCadastral ?? p.situacaoCadastral,
        porte: data.porte ?? p.porte,
        cnae: data.cnae ?? p.cnae,
      }));
      setForm(f => ({
        ...f,
        cep: data.cep ? `${data.cep.slice(0, 5)}-${data.cep.slice(5)}` : f.cep,
        rua: data.rua || f.rua,
        numero: data.numero || f.numero,
        complemento: data.complemento || f.complemento,
        bairro: data.bairro || f.bairro,
        cidade: data.cidade || f.cidade,
        estado: data.estado || f.estado,
      }));
    } catch (err: any) {
      setCnpjError(err?.message || 'Não foi possível buscar os dados do CNPJ. Preencha manualmente.');
    } finally {
      setLoadingCnpj(false);
    }
  };
```

- [ ] **Step 5: Trocar o campo CPF por um campo único CPF/CNPJ, esconder os campos exclusivos de pessoa física quando for PJ, e mostrar a seção de empresa**

No bloco "Dados pessoais" (linhas 333-374), envolver os campos exclusivos de PF (RG, data de expedição, órgão emissor, data de nascimento, estado civil, profissão, sexo — tudo exceto Nome) numa condição. Trocar o `<div className="grid grid-cols-1 md:grid-cols-2 gap-3">` interno (linha 336) para conter só Nome + CPF/CNPJ sempre visíveis, e o resto condicional:

```tsx
        {/* Dados pessoais */}
        <div>
          <SECTION label="Dados Pessoais" icon={User} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Field label={tipoPessoa === 'juridica' ? 'Nome do responsável' : 'Nome completo'} required>
                <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" required />
              </Field>
            </div>
            <Field label={tipoPessoa === 'juridica' ? 'CNPJ' : 'CPF'} required>
              <div className="relative">
                <input
                  className={inputCls}
                  value={tipoPessoa === 'juridica' ? pj.cnpj : form.cpf}
                  onChange={e => {
                    const formatted = formatCpfCnpjProgressive(e.target.value);
                    const digits = formatted.replace(/\D/g, '');
                    const novoTipo = detectTipoPessoa(formatted);
                    setTipoPessoa(novoTipo);
                    if (novoTipo === 'juridica') {
                      setPj(p => ({ ...p, cnpj: formatted }));
                      if (digits.length === 14) buscarCnpj(digits);
                    } else {
                      set('cpf', formatted);
                    }
                  }}
                  placeholder={tipoPessoa === 'juridica' ? '00.000.000/0000-00' : '000.000.000-00'}
                  maxLength={18}
                  required
                />
                {loadingCnpj && <Loader2 className="absolute right-2 top-2 w-4 h-4 text-gold-deep animate-spin" />}
              </div>
              {cnpjError && <p className="text-[9px] text-red-400 mt-1">{cnpjError}</p>}
            </Field>
            {tipoPessoa === 'fisica' && (<>
              <Field label="RG">
                <input className={inputCls} value={form.rg} onChange={e => set('rg', e.target.value)} placeholder="RG" />
              </Field>
              <Field label="Data de expedição (RG)">
                <input type="date" className={inputCls} value={form.rgDataExpedicao} onChange={e => set('rgDataExpedicao', e.target.value)} />
              </Field>
              <Field label="Órgão emissor (RG)">
                <input className={inputCls} value={form.rgOrgaoEmissor} onChange={e => set('rgOrgaoEmissor', e.target.value)} placeholder="Ex: SSP/SP" />
              </Field>
              <Field label="Data de nascimento">
                <input type="date" className={inputCls} value={form.dataNascimento} onChange={e => set('dataNascimento', e.target.value)} />
              </Field>
              <Field label="Estado civil">
                <select className={inputCls} value={form.estadoCivil} onChange={e => set('estadoCivil', e.target.value)}>
                  <option value="">Selecionar...</option>
                  {ESTADO_CIVIL.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </Field>
              <Field label="Profissão">
                <input className={inputCls} value={form.profissao} onChange={e => set('profissao', e.target.value)} placeholder="Profissão" />
              </Field>
              <Field label="Sexo">
                <select className={inputCls} value={sexo} onChange={e => setSexo(e.target.value as 'M' | 'F' | '')}>
                  <option value="">Não informado</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </Field>
            </>)}
          </div>
        </div>

        {tipoPessoa === 'juridica' && (
          <div>
            <SECTION label="Dados da Empresa" icon={Briefcase} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Field label="Razão Social" required>
                  <input className={inputCls} value={pj.razaoSocial} onChange={e => setPj(p => ({ ...p, razaoSocial: e.target.value }))} placeholder="Razão Social" required />
                </Field>
              </div>
              <Field label="Nome Fantasia">
                <input className={inputCls} value={pj.nomeFantasia} onChange={e => setPj(p => ({ ...p, nomeFantasia: e.target.value }))} placeholder="Nome Fantasia" />
              </Field>
              <Field label="Inscrição Estadual">
                <input className={inputCls} value={pj.inscricaoEstadual} onChange={e => setPj(p => ({ ...p, inscricaoEstadual: e.target.value }))} placeholder="Inscrição Estadual" />
              </Field>
              <Field label="Situação Cadastral">
                <input className={inputCls} value={pj.situacaoCadastral} onChange={e => setPj(p => ({ ...p, situacaoCadastral: e.target.value }))} placeholder="Ex: ATIVA" />
              </Field>
              <Field label="Porte">
                <input className={inputCls} value={pj.porte} onChange={e => setPj(p => ({ ...p, porte: e.target.value }))} placeholder="Ex: ME, EPP" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Atividade Principal (CNAE)">
                  <input className={inputCls} value={pj.cnae} onChange={e => setPj(p => ({ ...p, cnae: e.target.value }))} placeholder="Atividade principal" />
                </Field>
              </div>
            </div>
          </div>
        )}
```


- [ ] **Step 6: Salvar — incluir `tipoPessoa`, tornar `cpf` condicional, e fazer upsert/delete da linha satélite**

O `handleSubmit` (linha 247-285) precisa de 3 mudanças: (a) validação de obrigatoriedade diferente pra PJ (razão social obrigatória em vez de CPF), (b) `cpf`/`tipoPessoa` corretos no payload principal, (c) upsert (ou delete, se voltou pra PF) da linha satélite depois que o `onSave` principal retornar o id do cliente.

`onSave` (prop do componente) já resolve pro cliente salvo — mas hoje `handleSubmit` não captura o retorno. Verificar a assinatura de `onSave` no arquivo que usa `<ClienteForm onSave={...} />` (`ClienteDetailPage.tsx`, `ClientesPage.tsx`) antes de mudar — se `onSave` não devolve o id, use `cliente?.id` (edição) e, pra criação, o `id` já é conhecido: `Cliente` sempre grava com um `id` gerado ANTES do POST (confirmar em `ClienteService`/onde o `onSave` de fato chama `DataService.create`) — se for esse o caso, gere o id aqui mesmo com `generateId()` (já importado) pra criação, e passe explicitamente:

```ts
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.telefone.trim()) return;
    if (tipoPessoa === 'fisica' && !form.cpf.trim()) return;
    if (tipoPessoa === 'juridica' && !pj.razaoSocial.trim()) return;
    setSaving(true);
    const clienteId = cliente?.id ?? generateId();
    try {
      await onSave({
        nome: form.nome.trim(),
        cpf: tipoPessoa === 'fisica' ? form.cpf.replace(/\D/g, '') : undefined,
        tipoPessoa,
        rg: tipoPessoa === 'fisica' ? (form.rg || undefined) : undefined,
        rgDataExpedicao: tipoPessoa === 'fisica' ? (form.rgDataExpedicao || undefined) : undefined,
        rgOrgaoEmissor: tipoPessoa === 'fisica' ? (form.rgOrgaoEmissor || undefined) : undefined,
        dataNascimento: tipoPessoa === 'fisica' ? (form.dataNascimento || undefined) : undefined,
        estadoCivil: tipoPessoa === 'fisica' ? (form.estadoCivil || undefined) : undefined,
        profissao: tipoPessoa === 'fisica' ? (form.profissao || undefined) : undefined,
        sexo: tipoPessoa === 'fisica' ? (sexo || undefined) : undefined,
        telefone: form.telefone.replace(/\D/g, ''),
        whatsapp: form.whatsapp ? form.whatsapp.replace(/\D/g, '') : undefined,
        email: form.email || undefined,
        cep: form.cep.replace(/\D/g, '') || undefined,
        rua: form.rua || undefined,
        numero: form.numero || undefined,
        complemento: form.complemento || undefined,
        bairro: form.bairro || undefined,
        cidade: form.cidade || undefined,
        estado: form.estado || undefined,
        responsavelId: form.responsavelId || undefined,
        observacoes: form.observacoes || undefined,
        status: (cliente?.status as any) ?? 'ativo',
        leadOrigemId: cliente?.leadOrigemId,
        seguradoraAtualId: cliente?.seguradoraAtualId,
        produtoAtual: cliente?.produtoAtual,
        dataRenovacao: cliente?.dataRenovacao,
        documentos: documentos.length > 0 ? documentos : undefined,
      } as any);

      if (tipoPessoa === 'juridica') {
        await dataApiClient.save('cliente_pessoa_juridica', clienteId, {
          cnpj: pj.cnpj.replace(/\D/g, ''),
          razaoSocial: pj.razaoSocial.trim(),
          nomeFantasia: pj.nomeFantasia || undefined,
          inscricaoEstadual: pj.inscricaoEstadual || undefined,
          situacaoCadastral: pj.situacaoCadastral || undefined,
          porte: pj.porte || undefined,
          cnae: pj.cnae || undefined,
        });
      } else if (cliente?.tipoPessoa === 'juridica') {
        // Estava PJ e voltou pra PF nesta edição — remove a linha satélite órfã.
        await dataApiClient.remove('cliente_pessoa_juridica', clienteId).catch(() => {});
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 7: Ajustar o botão de salvar (desabilitar corretamente)**

Trocar (linha 578):
```tsx
            disabled={saving || !form.nome || !form.cpf || !form.telefone}
```
por:
```tsx
            disabled={saving || !form.nome || !form.telefone || (tipoPessoa === 'fisica' ? !form.cpf : !pj.razaoSocial)}
```

- [ ] **Step 8: Typecheck e build**

Run: `npx tsc --noEmit`
Expected: sem erros (`Cliente.cpf` já é `cpf?: string` desde o Task 4 — `cpf: undefined` no payload já é um valor válido pro tipo).

- [ ] **Step 9: Commit**

```bash
git add src/domains/clientes/ClienteForm.tsx src/types.ts
git commit -m "feat: ClienteForm.tsx — campo único CPF/CNPJ com detecção automática e dados de empresa"
```

---

### Task 6: Exibição de PJ em `ClienteDetailPage.tsx` e `RelacionamentosTab.tsx`

**Files:**
- Modify: `src/domains/clientes/ClienteDetailPage.tsx`
- Modify: `src/domains/clientes/RelacionamentosTab.tsx`

**Interfaces:**
- Consumes: `dataApiClient.get('cliente_pessoa_juridica', clienteId)` (Task 1/registro genérico), `formatCNPJ`/`maskCNPJ` (Task 2).

- [ ] **Step 1: `ClienteDetailPage.tsx` — carregar a linha satélite quando for PJ**

Localizar onde o componente carrega `cliente` (estado/hook já existente) e adicionar um estado irmão:
```ts
const [clientePJ, setClientePJ] = useState<any>(null);
```
E um `useEffect` que busca quando `cliente.tipoPessoa === 'juridica'`:
```ts
useEffect(() => {
  if (cliente?.tipoPessoa === 'juridica') {
    dataApiClient.get('cliente_pessoa_juridica', cliente.id).then(setClientePJ).catch(() => setClientePJ(null));
  } else {
    setClientePJ(null);
  }
}, [cliente?.id, cliente?.tipoPessoa]);
```
(Adicionar `import { dataApiClient } from '../../lib/dataApiClient';` e `import { formatCNPJ } from '../../lib/utils';` no topo do arquivo, se ainda não importados.)

- [ ] **Step 2: Trocar o cabeçalho (linha 203-208)**

```tsx
            <h1 className="text-sm font-black text-white">{cliente.nome}</h1>
```
```tsx
            <h1 className="text-sm font-black text-white">
              {cliente.tipoPessoa === 'juridica' ? (clientePJ?.razaoSocial ?? cliente.nome) : cliente.nome}
            </h1>
```
E:
```tsx
          <p className="text-[10px] text-white/30 font-mono mt-0.5">{fmtCPF(cliente.cpf)}</p>
```
```tsx
          <p className="text-[10px] text-white/30 font-mono mt-0.5">
            {cliente.tipoPessoa === 'juridica' ? (clientePJ ? formatCNPJ(clientePJ.cnpj) : '') : fmtCPF(cliente.cpf)}
          </p>
```

- [ ] **Step 3: Trocar o card "Dados Pessoais" (linhas 272-278)**

```tsx
              {[
                ['Nome', cliente.nome],
                ['CPF', fmtCPF(cliente.cpf)],
                ['RG', cliente.rg],
                ['Nascimento', fmtDate(cliente.dataNascimento)],
                ['Estado civil', cliente.estadoCivil],
                ['Profissão', cliente.profissao],
              ].map(([k,v]) => v ? (
```
```tsx
              {(cliente.tipoPessoa === 'juridica' ? [
                ['Razão Social', clientePJ?.razaoSocial],
                ['Nome Fantasia', clientePJ?.nomeFantasia],
                ['CNPJ', clientePJ ? formatCNPJ(clientePJ.cnpj) : ''],
                ['Inscrição Estadual', clientePJ?.inscricaoEstadual],
                ['Situação Cadastral', clientePJ?.situacaoCadastral],
                ['Porte', clientePJ?.porte],
                ['CNAE', clientePJ?.cnae],
                ['Contato responsável', cliente.nome],
              ] : [
                ['Nome', cliente.nome],
                ['CPF', fmtCPF(cliente.cpf)],
                ['RG', cliente.rg],
                ['Nascimento', fmtDate(cliente.dataNascimento)],
                ['Estado civil', cliente.estadoCivil],
                ['Profissão', cliente.profissao],
              ]).map(([k,v]) => v ? (
```
(O fechamento do `.map` continua igual — só a fonte do array virou condicional.)

- [ ] **Step 4: `RelacionamentosTab.tsx` — exibir CNPJ quando o relacionado for PJ**

A tabela `cliente_relacionamentos` guarda o documento do relacionado em `relatedClienteCPF` (nome de coluna legado, mas é um campo de texto livre — reaproveitado aqui pra também guardar dígitos de CNPJ quando o relacionado é PJ, sem precisar de coluna nova). Nas linhas onde o objeto `Cliente` completo já está disponível (`c`/`selected`/`cliente` — variáveis já existentes no arquivo), trocar as 3 ocorrências de exibição de CPF:

```tsx
<p className="text-[9px] text-white/30 font-mono">{fmtCPFMasked(c.cpf)}</p>
```
```tsx
<p className="text-[9px] text-white/30 font-mono">
  {c.tipoPessoa === 'juridica' ? maskCNPJ(c.cpfOuCnpjParaExibicao) : fmtCPFMasked(c.cpf)}
</p>
```

Como `Cliente` não carrega o CNPJ diretamente (vive na tabela satélite, e esta lista não faz join por linha — custo desproporcional pro que essa tela pede), a exibição de CNPJ aqui fica **fora do escopo desta tarefa**: se `c.tipoPessoa === 'juridica'`, mostrar apenas o nome do contato (já funciona, sem mudança) e omitir a linha de documento em vez de mostrar um CPF vazio/quebrado. Trocar as 3 ocorrências de `fmtCPFMasked(c.cpf)`/`fmtCPFMasked(selected.cpf)` por uma função local:

```ts
function documentoOuVazio(c: { tipoPessoa?: string; cpf?: string }): string {
  if (c.tipoPessoa === 'juridica') return '';
  return fmtCPFMasked(c.cpf);
}
```
(Definir essa função perto de `fmtCPFMasked` já existente no arquivo.) E usar `documentoOuVazio(c)` / `documentoOuVazio(selected)` no lugar de cada `fmtCPFMasked(...)`. Isso evita mostrar "---" ou um CPF em branco pra um relacionado PJ, sem tentar buscar o CNPJ nesta lista (documentado como limitação conhecida, não um requisito quebrado).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/domains/clientes/ClienteDetailPage.tsx src/domains/clientes/RelacionamentosTab.tsx
git commit -m "feat: exibição de razão social/CNPJ em ClienteDetailPage e RelacionamentosTab"
```

---

### Task 7: `LeadForm.tsx` — campo único CPF/CNPJ e dados de empresa

**Files:**
- Modify: `src/domains/leads/LeadForm.tsx`

**Interfaces:**
- Consumes: `CnpjService.lookup` (Task 4), `formatCpfCnpjProgressive`/`detectTipoPessoa`/`validateCNPJ`/`formatCNPJ` (Task 2), `dataApiClient` (Task 1 registro), `LeadPessoaJuridica`/`DadosEmpresa` (Task 4).
- Produces: ao salvar um lead PJ, `formData.tipoPessoa = 'juridica'`, `formData.cpf` vazio, e upsert de `lead_pessoa_juridica` via `dataApiClient.save`.

- [ ] **Step 1: Importar o necessário**

No topo do arquivo, adicionar aos imports já existentes:
```ts
import { cn, formatCPF, validateCPF, generateId, formatCpfCnpjProgressive, detectTipoPessoa, formatCNPJ, validateCNPJ } from '../../lib/utils';
import { CnpjService } from '../../services/CnpjService';
import { dataApiClient } from '../../lib/dataApiClient';
import type { DadosEmpresa, LeadPessoaJuridica } from '../../types';
```

- [ ] **Step 2: Adicionar estado de pessoa jurídica**

Depois de `const [isSaving, setIsSaving] = useState(false);` (linha 652), adicionar:
```ts
  const [pj, setPj] = useState({
    razaoSocial: '', nomeFantasia: '', inscricaoEstadual: '', situacaoCadastral: '', porte: '', cnae: '',
    cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  });
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [cnpjError, setCnpjError] = useState('');
```

`formData.tipoPessoa` (do tipo `Lead`, já estendido no Task 4) É o discriminador — não precisa de state React separado, já vem de dentro de `formData`/`setFormData` como qualquer outro campo do lead.

- [ ] **Step 3: Carregar a linha satélite ao editar um lead PJ existente**

Adicionar um `useEffect` (perto dos outros `useEffect` de carregamento, ex.: perto da definição de `formData`, linha ~646):
```ts
  useEffect(() => {
    if (lead?.id && lead.tipoPessoa === 'juridica') {
      dataApiClient.get('lead_pessoa_juridica', lead.id).then((row: any) => {
        if (row) {
          setPj({
            razaoSocial: row.razaoSocial ?? '', nomeFantasia: row.nomeFantasia ?? '',
            inscricaoEstadual: row.inscricaoEstadual ?? '', situacaoCadastral: row.situacaoCadastral ?? '',
            porte: row.porte ?? '', cnae: row.cnae ?? '',
            cep: row.cep ?? '', rua: row.rua ?? '', numero: row.numero ?? '', complemento: row.complemento ?? '',
            bairro: row.bairro ?? '', cidade: row.cidade ?? '', estado: row.estado ?? '',
          });
        }
      }).catch(() => {});
    }
  }, [lead?.id, lead?.tipoPessoa]);
```

- [ ] **Step 4: Implementar `buscarCnpj`**

Perto de `handleCepLookup` (função já existente pro CEP), adicionar:
```ts
  const buscarCnpjLead = useCallback(async (digits: string) => {
    setLoadingCnpj(true);
    setCnpjError('');
    try {
      const data: DadosEmpresa = await CnpjService.lookup(digits);
      setPj(p => ({
        ...p,
        razaoSocial: data.razaoSocial ?? p.razaoSocial,
        nomeFantasia: data.nomeFantasia ?? p.nomeFantasia,
        situacaoCadastral: data.situacaoCadastral ?? p.situacaoCadastral,
        porte: data.porte ?? p.porte,
        cnae: data.cnae ?? p.cnae,
        cep: data.cep ?? p.cep,
        rua: data.rua ?? p.rua,
        numero: data.numero ?? p.numero,
        complemento: data.complemento ?? p.complemento,
        bairro: data.bairro ?? p.bairro,
        cidade: data.cidade ?? p.cidade,
        estado: data.estado ?? p.estado,
      }));
    } catch (err: any) {
      setCnpjError(err?.message || 'Não foi possível buscar os dados do CNPJ. Preencha manualmente.');
    } finally {
      setLoadingCnpj(false);
    }
  }, []);
```

- [ ] **Step 5: Estender `handleChange` pra detectar CNPJ no campo `cpf`**

Trocar (linhas 971-987):
```ts
  const handleChange = useCallback((e: any) => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;

    if (name === 'phone') val = formatPhone(value);
    if (name === 'cpf' || name === 'cpfProprietario') val = formatCpf(value);
    if (name === 'name' || name === 'nomeProprietario' || name === 'plate' || name === 'chassi') {
      val = typeof val === 'string' ? val.toUpperCase() : val;
    }

    setFormData(prev => ({ ...prev, [name]: val }));
    setIsDirty(true);

    if (name === 'cepPernoite' && typeof value === 'string' && value.replace(/\D/g, '').length === 8) {
      handleCepLookup(value);
    }
  }, [handleCepLookup]);
```
por (o campo `cpf` — e só ele, `cpfProprietario` continua com a máscara de CPF pura, sem detecção, porque é outro conceito — ganha a máscara combinada e a detecção de tipo de pessoa):
```ts
  const handleChange = useCallback((e: any) => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;

    if (name === 'phone') val = formatPhone(value);
    if (name === 'cpfProprietario') val = formatCpf(value);
    if (name === 'cpf') {
      val = formatCpfCnpjProgressive(value);
      const novoTipo = detectTipoPessoa(val);
      const digits = String(val).replace(/\D/g, '');
      setFormData(prev => ({ ...prev, cpf: val, tipoPessoa: novoTipo }));
      setIsDirty(true);
      if (novoTipo === 'juridica' && digits.length === 14) buscarCnpjLead(digits);
      return;
    }
    if (name === 'name' || name === 'nomeProprietario' || name === 'plate' || name === 'chassi') {
      val = typeof val === 'string' ? val.toUpperCase() : val;
    }

    setFormData(prev => ({ ...prev, [name]: val }));
    setIsDirty(true);

    if (name === 'cepPernoite' && typeof value === 'string' && value.replace(/\D/g, '').length === 8) {
      handleCepLookup(value);
    }
  }, [handleCepLookup, buscarCnpjLead]);
```

- [ ] **Step 6: Adaptar o `PremiumCpfInput` (linhas 231-280) pra aceitar CNPJ também**

Renomear pra `PremiumCpfCnpjInput` e trocar a lógica de status/validação/máscara pra ramificar por tamanho:

```tsx
const PremiumCpfCnpjInput = React.memo(({ label, name, value, onChange, onBlur, required, placeholder }: any) => {
  const digits = (value || '').replace(/\D/g, '');
  const tipoPessoa = digits.length > 11 ? 'juridica' : 'fisica';
  const hasContent = digits.length > 0;
  const isComplete = tipoPessoa === 'juridica' ? digits.length === 14 : digits.length === 11;
  const isValidDoc = isComplete && (tipoPessoa === 'juridica' ? validateCNPJ(digits) : validateCPF(digits));
  const status: 'idle' | 'partial' | 'invalid' | 'valid' = !hasContent
    ? 'idle'
    : !isComplete
      ? 'partial'
      : isValidDoc
        ? 'valid'
        : 'invalid';
```

(o resto do componente — badges de status, classes CSS — continua idêntico; só a linha `maxLength={14}` do `<input>` (linha ~269) precisa virar `maxLength={18}`, e o `placeholder` default precisa virar dinâmico: `placeholder || (tipoPessoa === 'juridica' ? '00.000.000/0000-00' : '000.000.000-00')`; e o `label` recebido de fora já vem correto do call site, que muda no Step 7). Atualizar a chamada em (linha 1316) de `<PremiumCpfInput` pra `<PremiumCpfCnpjInput`.

- [ ] **Step 7: Atualizar o call site do campo (linhas 1314-1323) e mostrar seção de empresa**

```tsx
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <PremiumCpfCnpjInput
                  label={formData.tipoPessoa === 'juridica' ? 'CNPJ' : 'CPF'}
                  name="cpf"
                  value={formData.cpf || ''}
                  onChange={handleChange}
                  onBlur={handleCpfBlur}
                  placeholder={formData.tipoPessoa === 'juridica' ? '00.000.000/0000-00' : '000.000.000-00'}
                />
                {loadingCnpj && <Loader2 className="w-4 h-4 text-gold-deep animate-spin self-center" />}
```
(mantendo os outros campos dessa linha — Data de Nascimento/Idade/Aniversário — como já estavam; eles continuam existindo no state mesmo quando ocultos na tela, tratado no próximo passo). Trocar `formData.name === 'Nome Completo'` (o label estático de nome, linha 1310) por dinâmico:
```tsx
<PremiumInput label={formData.tipoPessoa === 'juridica' ? 'Nome do Responsável' : 'Nome Completo'} name="name" value={formData.name || ''} onChange={handleChange} required placeholder="Digite o nome completo" icon={UserIcon} />
```

Envolver os campos exclusivos de PF que aparecem NA MESMA seção "Informações de Contato e Condutor" (Data de Nascimento, Idade, Aniversário, e qualquer outro campo de RG/estado civil mais abaixo nessa mesma `PremiumSection`) numa condição `{formData.tipoPessoa !== 'juridica' && (...)}"`, e adicionar logo depois dessa seção uma nova, só visível em PJ:

```tsx
          {formData.tipoPessoa === 'juridica' && (
            <PremiumSection title="Dados da Empresa" icon={Briefcase} subtitle="Preenchido automaticamente a partir do CNPJ — revise e complete se necessário">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PremiumInput label="Razão Social" name="pjRazaoSocial" value={pj.razaoSocial} onChange={e => setPj(p => ({ ...p, razaoSocial: e.target.value }))} required icon={Briefcase} />
                <PremiumInput label="Nome Fantasia" name="pjNomeFantasia" value={pj.nomeFantasia} onChange={e => setPj(p => ({ ...p, nomeFantasia: e.target.value }))} icon={Briefcase} />
                <PremiumInput label="Inscrição Estadual" name="pjInscricaoEstadual" value={pj.inscricaoEstadual} onChange={e => setPj(p => ({ ...p, inscricaoEstadual: e.target.value }))} icon={Briefcase} />
                <PremiumInput label="Situação Cadastral" name="pjSituacaoCadastral" value={pj.situacaoCadastral} onChange={e => setPj(p => ({ ...p, situacaoCadastral: e.target.value }))} icon={Briefcase} />
                <PremiumInput label="Porte" name="pjPorte" value={pj.porte} onChange={e => setPj(p => ({ ...p, porte: e.target.value }))} icon={Briefcase} />
                <PremiumInput label="CNAE" name="pjCnae" value={pj.cnae} onChange={e => setPj(p => ({ ...p, cnae: e.target.value }))} icon={Briefcase} />
                <PremiumInput label="CEP" name="pjCep" value={pj.cep} onChange={e => setPj(p => ({ ...p, cep: e.target.value }))} icon={MapPin} />
                <PremiumInput label="Rua" name="pjRua" value={pj.rua} onChange={e => setPj(p => ({ ...p, rua: e.target.value }))} icon={MapPin} />
                <PremiumInput label="Número" name="pjNumero" value={pj.numero} onChange={e => setPj(p => ({ ...p, numero: e.target.value }))} icon={MapPin} />
                <PremiumInput label="Bairro" name="pjBairro" value={pj.bairro} onChange={e => setPj(p => ({ ...p, bairro: e.target.value }))} icon={MapPin} />
                <PremiumInput label="Cidade" name="pjCidade" value={pj.cidade} onChange={e => setPj(p => ({ ...p, cidade: e.target.value }))} icon={MapPin} />
                <PremiumInput label="Estado" name="pjEstado" value={pj.estado} onChange={e => setPj(p => ({ ...p, estado: e.target.value }))} icon={MapPin} />
              </div>
              {cnpjError && <p className="text-[10px] text-red-400 mt-2">{cnpjError}</p>}
            </PremiumSection>
          )}
```

(`Briefcase`/`MapPin` precisam estar entre os ícones já importados de `lucide-react` no topo do arquivo — se não estiverem, adicionar ao import existente.)

- [ ] **Step 8: Estender `checkDuplicate` pra também checar CNPJ**

Trocar (linhas 951-961):
```ts
  const checkDuplicate = useCallback(async (field: 'cpf' | 'phone', rawValue: string) => {
    if (!rawValue) { setDuplicateAlert(null); return; }
    const clean = rawValue.replace(/\D/g, '');
    if (field === 'phone' && clean.length < 10) { setDuplicateAlert(null); return; }
    if (field === 'cpf' && clean.length !== 11) { setDuplicateAlert(null); return; }
    // Query only leads matching the exact formatted value — avoids full-collection scan
    const { where } = await import('../../lib/queryConstraints');
    const matches = await DataService.list('leads', [where(field, '==', rawValue)]) as Lead[];
    const duplicate = matches.find(l => l.id !== formData.id);
    setDuplicateAlert(duplicate ? { lead: duplicate, field } : null);
  }, [formData.id]);
```
por:
```ts
  const checkDuplicate = useCallback(async (field: 'cpf' | 'phone', rawValue: string) => {
    if (!rawValue) { setDuplicateAlert(null); return; }
    const clean = rawValue.replace(/\D/g, '');
    if (field === 'phone' && clean.length < 10) { setDuplicateAlert(null); return; }
    if (field === 'cpf' && clean.length !== 11 && clean.length !== 14) { setDuplicateAlert(null); return; }
    const { where } = await import('../../lib/queryConstraints');
    if (field === 'cpf' && clean.length === 14) {
      // CNPJ mora na tabela satélite lead_pessoa_juridica, não em leads.cpf.
      const pjMatches = await DataService.list('lead_pessoa_juridica', [where('cnpj', '==', clean)]) as LeadPessoaJuridica[];
      const dup = pjMatches.find(m => m.leadId !== formData.id);
      if (!dup) { setDuplicateAlert(null); return; }
      const duplicateLead = await DataService.get('lead', dup.leadId) as Lead | null;
      setDuplicateAlert(duplicateLead ? { lead: duplicateLead, field } : null);
      return;
    }
    const matches = await DataService.list('leads', [where(field, '==', rawValue)]) as Lead[];
    const duplicate = matches.find(l => l.id !== formData.id);
    setDuplicateAlert(duplicate ? { lead: duplicate, field } : null);
  }, [formData.id]);
```

- [ ] **Step 9: Ajustar `canQuote` (linha 1914) pra aceitar CNPJ**

```ts
  const canQuote = !!formData.name && !!formData.cpf && !!formData.plate;
```
Essa linha já funciona sem alteração — `formData.cpf` continua preenchido (agora com o CNPJ formatado) quando é PJ, então `!!formData.cpf` continua `true`. Nenhuma mudança necessária aqui; deixado documentado pra quem revisar não "corrigir" à toa.

- [ ] **Step 10: Salvar — upsert/delete da linha satélite**

Localizar `handleSaveInternal`/o ponto onde o formulário efetivamente chama `onSave(data)` com o objeto `Lead` final pronto pra salvar (a função que envolve `onSave` na linha 698, `handleSaveInternal`). Envolver essa chamada pra também sincronizar a tabela satélite depois que o save principal for bem-sucedido:

```ts
  const handleSaveInternal = useCallback(async (data: Lead, options?: any) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      await onSave(data, options);
      if (data.tipoPessoa === 'juridica') {
        await dataApiClient.save('lead_pessoa_juridica', data.id, {
          cnpj: (data.cpf || '').replace(/\D/g, ''),
          razaoSocial: pj.razaoSocial.trim(),
          nomeFantasia: pj.nomeFantasia || undefined,
          inscricaoEstadual: pj.inscricaoEstadual || undefined,
          situacaoCadastral: pj.situacaoCadastral || undefined,
          porte: pj.porte || undefined,
          cnae: pj.cnae || undefined,
          cep: pj.cep || undefined,
          rua: pj.rua || undefined,
          numero: pj.numero || undefined,
          complemento: pj.complemento || undefined,
          bairro: pj.bairro || undefined,
          cidade: pj.cidade || undefined,
          estado: pj.estado || undefined,
        }).catch(() => {});
      } else if (lead?.tipoPessoa === 'juridica') {
        await dataApiClient.remove('lead_pessoa_juridica', data.id).catch(() => {});
      }
    } finally {
      setTimeout(() => { isSavingRef.current = false; }, 1000);
    }
  }, [onSave, pj, lead?.tipoPessoa]);
```

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 12: Commit**

```bash
git add src/domains/leads/LeadForm.tsx
git commit -m "feat: LeadForm.tsx — campo único CPF/CNPJ, dados de empresa e checagem de duplicidade de CNPJ"
```

---

### Task 8: Exibição de PJ em `LeadDetailsSidebar.tsx` e `LeadsView.tsx`

**Files:**
- Modify: `src/domains/leads/LeadDetailsSidebar.tsx`
- Modify: `src/domains/leads/LeadsView.tsx`

**Interfaces:**
- Consumes: `maskCNPJ` (Task 2).

- [ ] **Step 1: `LeadDetailsSidebar.tsx` (linhas ~203-215)**

```tsx
               <div>
                  <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Nome Completo</p>
                  <p className="text-sm font-black text-white">{selectedLeadForChat.name}</p>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <p className="text-[10px] font-bold text-white/30 uppercase mb-1">CPF</p>
                     <div className="text-sm font-black text-white">
                       <SensitiveContent 
                         value={selectedLeadForChat.cpf} 
                         maskFn={maskCPF} 
                         canView={permissions.canReadAllLeads} 
                       />
                     </div>
                  </div>
```
```tsx
               <div>
                  <p className="text-[10px] font-bold text-white/30 uppercase mb-1">
                    {selectedLeadForChat.tipoPessoa === 'juridica' ? 'Nome do Responsável' : 'Nome Completo'}
                  </p>
                  <p className="text-sm font-black text-white">{selectedLeadForChat.name}</p>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <p className="text-[10px] font-bold text-white/30 uppercase mb-1">
                       {selectedLeadForChat.tipoPessoa === 'juridica' ? 'CNPJ' : 'CPF'}
                     </p>
                     <div className="text-sm font-black text-white">
                       <SensitiveContent 
                         value={selectedLeadForChat.cpf} 
                         maskFn={selectedLeadForChat.tipoPessoa === 'juridica' ? maskCNPJ : maskCPF} 
                         canView={permissions.canReadAllLeads} 
                       />
                     </div>
                  </div>
```

Adicionar `maskCNPJ` ao import já existente de `maskCPF` no topo do arquivo (mesmo módulo, `../../lib/utils`).

- [ ] **Step 2: `LeadsView.tsx` (linhas ~217-220)**

```tsx
                          <p className="text-[11px] font-bold truncate group-hover:text-gold-deep transition-colors">{lead.name}</p>
                          <div className="text-[8.5px] text-white/20 font-bold mt-0 flex items-center gap-1">
                            <span className="hidden sm:inline">CPF:</span> 
                            <SensitiveContent value={lead.cpf} maskFn={maskCPF} canView={permissions.canReadAllLeads} />
                          </div>
```
```tsx
                          <p className="text-[11px] font-bold truncate group-hover:text-gold-deep transition-colors">{lead.name}</p>
                          <div className="text-[8.5px] text-white/20 font-bold mt-0 flex items-center gap-1">
                            <span className="hidden sm:inline">{lead.tipoPessoa === 'juridica' ? 'CNPJ:' : 'CPF:'}</span> 
                            <SensitiveContent value={lead.cpf} maskFn={lead.tipoPessoa === 'juridica' ? maskCNPJ : maskCPF} canView={permissions.canReadAllLeads} />
                          </div>
```

Adicionar `maskCNPJ` ao import de `maskCPF` já existente nesse arquivo.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/domains/leads/LeadDetailsSidebar.tsx src/domains/leads/LeadsView.tsx
git commit -m "feat: exibição de CNPJ em LeadDetailsSidebar e LeadsView"
```

---

### Task 9: Conversão Lead → Cliente preserva dados de PJ

**Files:**
- Modify: `src/services/ClienteService.ts`

**Interfaces:**
- Consumes: `dataApiClient.get/save('lead_pessoa_juridica'/'cliente_pessoa_juridica', ...)`.
- Produces: `convertLeadToCliente` passa a copiar `tipoPessoa` e a linha satélite quando o lead de origem é PJ.

- [ ] **Step 1: Ler o `convertLeadToCliente` atual e confirmar a assinatura antes de editar**

(Já lido durante o planejamento — está em `src/services/ClienteService.ts`, recebe `(lead: Lead, responsavelId?, organizationId?)`, monta `clienteData`, chama `DataService.create('cliente', clienteData)`, depois `DataService.update('lead', lead.id, {...})`.)

- [ ] **Step 2: Adicionar `tipoPessoa` ao `clienteData` e copiar a linha satélite depois de criar o cliente**

No topo do arquivo, adicionar import:
```ts
import { dataApiClient } from '../lib/dataApiClient';
```

Na função `convertLeadToCliente`, adicionar `tipoPessoa: lead.tipoPessoa ?? 'fisica'` ao objeto `clienteData` (junto de `cpf: lead.cpf`):
```ts
    const clienteData: Omit<Cliente, 'id'> = {
      nome: lead.name,
      cpf: lead.tipoPessoa === 'juridica' ? undefined : lead.cpf,
      tipoPessoa: lead.tipoPessoa ?? 'fisica',
      rg: lead.rg,
```

Depois de `const clienteId = await DataService.create('cliente', clienteData);`, adicionar:
```ts
    if (lead.tipoPessoa === 'juridica') {
      const leadPJ = await dataApiClient.get('lead_pessoa_juridica', lead.id).catch(() => null);
      if (leadPJ) {
        await dataApiClient.save('cliente_pessoa_juridica', clienteId, {
          cnpj: leadPJ.cnpj,
          razaoSocial: leadPJ.razaoSocial,
          nomeFantasia: leadPJ.nomeFantasia,
          inscricaoEstadual: leadPJ.inscricaoEstadual,
          situacaoCadastral: leadPJ.situacaoCadastral,
          porte: leadPJ.porte,
          cnae: leadPJ.cnae,
        }).catch(() => {});
        // lead_pessoa_juridica não tem colunas de endereço promovidas em `clientes`
        // separadas da PJ — o endereço do lead PJ vira o endereço do cliente.
        await DataService.update('cliente', clienteId, {
          cep: leadPJ.cep, rua: leadPJ.rua, numero: leadPJ.numero, complemento: leadPJ.complemento,
          bairro: leadPJ.bairro, cidade: leadPJ.cidade, estado: leadPJ.estado,
        });
      }
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/services/ClienteService.ts
git commit -m "feat: convertLeadToCliente preserva dados de pessoa jurídica"
```

---

### Task 10: Verificação final + deploy

**Files:** nenhum arquivo novo — só verificação e publicação.

- [ ] **Step 1: Rodar a suíte completa e o typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tudo passa (contando as novas suítes das Tasks 2/3/4).

- [ ] **Step 2: Build local**

```bash
npm run build
git checkout -- dist/ && git clean -fd dist/
git status --porcelain
```
Expected: build sem erros; só arquivos de `_api/**`/`src/**`/`server.ts`/`docs/**` das tarefas anteriores aparecem staged — nada em `dist/`.

- [ ] **Step 3: Push e deploy**

```bash
git push origin main
railway up --detach
```
Depois, deploy do frontend:
```bash
export VERCEL_TOKEN=$(grep "^VERCEL_TOKEN=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
vercel deploy --prod --token "$VERCEL_TOKEN" --yes
```

- [ ] **Step 4: Verificação manual com um CNPJ real**

1. Abrir "Novo Cliente" → digitar um CNPJ real e válido (ex.: o de uma empresa pública qualquer) → confirmar que a partir do 12º dígito a tela já vira Pessoa Jurídica, e que ao completar os 14 dígitos a Razão Social/endereço aparecem preenchidos automaticamente.
2. Confirmar que os campos de RG/data de nascimento/estado civil/profissão/sexo sumiram da tela.
3. Salvar e reabrir pra edição → confirmar que abre direto em modo Pessoa Jurídica com tudo preenchido.
4. Repetir o mesmo teste em "Novo Lead".
5. Criar um segundo lead PJ com o MESMO CNPJ do primeiro → confirmar que aparece o aviso de duplicidade.
6. Converter um lead PJ em cliente → confirmar que o cliente resultante já vem com a Razão Social/CNPJ certos, sem precisar redigitar.
7. Conferir a tela de detalhe do cliente PJ e a lista de leads — devem mostrar Razão Social/CNPJ, não nome/CPF em branco.
8. Confirmar que um cliente/lead de pessoa física já existente (criado antes desta mudança) continua abrindo e salvando normalmente, sem nenhuma diferença visual.

- [ ] **Step 5: Limpeza**

Se o passo 4 criou um cliente/lead de teste real, excluí-lo antes de encerrar — não deixar dado de teste na base de produção.
