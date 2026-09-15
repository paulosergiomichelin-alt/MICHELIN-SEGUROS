# Multicálculo Tokio Marine (Fase 1: só cotação) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a integração de cotação (multicálculo) com a API da Tokio Marine — credenciais gerenciadas pela interface, cliente SOAP/REST, e uma tela nova `/multicalculo` que calcula e mostra o resultado, com PDF.

**Architecture:** Backend `_api/insurers/` com um `InsurerProvider` por seguradora (hoje só `tokioMarine`) por trás de um endpoint genérico `POST /api/insurers/cotar`; credenciais cifradas na tabela `settings` já existente; cliente SOAP manual (fetch + `fast-xml-parser`, sem lib de introspecção de WSDL); cotações persistidas em tabela nova `cotacoes` vinculada ao lead. Frontend: tela `Configurações → Seguradoras` (credenciais) + tela nova `/multicalculo` (formulário em cards + resultado).

**Tech Stack:** TypeScript, Express, Drizzle ORM (Postgres/Neon), React + React Router, `fast-xml-parser` (nova dependência), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-multicalculo-tokio-marine-design.md`

## Global Constraints

- Nenhuma chamada à Tokio Marine sem `requireAuth` (Bearer token Firebase) — mesmo padrão da rota de CNPJ (`server.ts:360`).
- Credenciais da Tokio Marine nunca em texto puro no banco nem na resposta ao navegador — sempre cifradas com `_api/lib/emailEncryption.ts` (`encrypt`/`decrypt`, AES-256-CBC via `EMAIL_ENCRYPTION_KEY`), e sempre removidas do payload de resposta (padrão `stripTokens` de `_api/email/accounts.ts:15-18`).
- Rotas de escrita/leitura de credencial exigem também `req.userRole === 'admin'`.
- `leadId` na tabela `cotacoes` nasce com `onDelete: 'cascade'` — nunca repetir o bug de FK sem cascade encontrado nesta sessão em `lead_pessoa_juridica`/`campaign_log`.
- Toda integração externa server-side usa `fetch()` direto + um `fetchWithTimeout` local — nenhuma lib de cliente HTTP genérica.
- Toda nova entidade Postgres acessada pelo mecanismo genérico de coleções precisa ser registrada em **4 lugares**: `_api/data/entityMap.ts` (`ENTITY_TABLE`), `_api/data/tenantMiddleware.ts` (`ORG_SCOPED_ENTITIES`), `src/services/DataService.ts` (`COLLECTION_MAP` e `ORG_SCOPED_ENTITIES`) — esquecer qualquer um quebra isolamento de tenant ou a rota genérica.
- Imports relativos dentro de `_api/` usam extensão `.js` (ESM), mesmo em arquivos `.ts` — ex.: `import { getDb } from '../lib/db.js'`.
- Domínios confirmados (usar como está, não pedir de novo): `TipoSeguro` (1 Novo, 6 Renovação Congênere, 7 Renovação Tokio), `TipoAssistencia` (N/C/V), `IsencaoFiscal` (24747 Não / 24748 Sim-PCD / 24749 Sim-exceto PCD), `CodigoCobertura` (1 Compreensiva / 2 Incêndio e Roubo / 3 RCF-V / 4 Colisão e Incêndio / 5 Indenização Integral / 6 Assistência Exclusiva), `TipoModalidade` (A Ajustável / D Determinado), `CodigoFranquia` parcial (1 Básica / 2 150% / 3 200% / 4 50% / 6 25% / 7 75%, não aplicável quando `CodigoCobertura` é 3 ou 5).

---

## File Structure

```
_api/db/schema/insurers.ts          # NOVO — tabela cotacoes
_api/insurers/
  types.ts                          # NOVO — CotacaoInput/CotacaoResultado/InsurerProvider
  credentials.ts                    # NOVO — get/save credenciais cifradas
  registry.ts                       # NOVO — lista de providers habilitados
  router.ts                         # NOVO — todas as rotas /api/insurers/*
  tokioMarine/
    config.ts                       # NOVO — URL base por ambiente + credenciais resolvidas
    soapClient.ts                   # NOVO — chamada SOAP genérica (fetch + fast-xml-parser)
    restClient.ts                   # NOVO — chamadas REST de consulta + impressão
    mapper.ts                       # NOVO — CotacaoInput <-> XML do cotar
    provider.ts                     # NOVO — implementa InsurerProvider
  __tests__/
    credentials.test.ts             # NOVO
  tokioMarine/__tests__/
    soapClient.test.ts              # NOVO
    restClient.test.ts              # NOVO
    mapper.test.ts                  # NOVO

server.ts                           # MODIFICAR — registrar rota /api/insurers
_api/data/entityMap.ts              # MODIFICAR — registrar `cotacoes`
_api/data/tenantMiddleware.ts       # MODIFICAR — registrar `cotacoes` em ORG_SCOPED_ENTITIES
src/services/DataService.ts         # MODIFICAR — registrar `cotacoes` (COLLECTION_MAP + ORG_SCOPED_ENTITIES)

src/services/InsurerCredentialsService.ts   # NOVO — fetch wrapper das rotas de credencial
src/services/InsurerService.ts              # NOVO — fetch wrapper de cotar/veiculos/pdf
src/domains/settings/InsurerSettings.tsx    # NOVO — card de credenciais (estilo AggerToolSettings)
src/domains/settings/SettingsPage.tsx       # MODIFICAR — nova aba "Seguradoras"
src/domains/multicalculo/MulticalculoPage.tsx  # NOVO — tela /multicalculo
src/components/AppContentManager.tsx        # MODIFICAR — rota /multicalculo
src/components/Sidebar.tsx                  # MODIFICAR — link de navegação

package.json                        # MODIFICAR — dependência fast-xml-parser
```

---

### Task 1: Dependência + tipos genéricos

**Files:**
- Modify: `package.json`
- Create: `_api/insurers/types.ts`

**Interfaces:**
- Produces: `CotacaoInput`, `CotacaoResultadoItem`, `CotacaoResultado`, `InsurerProvider` — usados por todas as tasks seguintes.

- [ ] **Step 1: Instalar a dependência**

```bash
npm install fast-xml-parser
```

- [ ] **Step 2: Criar `_api/insurers/types.ts`**

```ts
// _api/insurers/types.ts
export interface CotacaoInput {
  leadId?: string;
  segurado: {
    nome: string;
    cpfCnpj: string;
    tipoPessoa: 'fisica' | 'juridica';
    telefone?: string;
    email?: string;
  };
  veiculo: {
    idVeiculoTokio?: number;
    anoModelo: number;
    zeroKm: boolean;
    valorVeiculo: number;
    cep: string;
    placa?: string;
    chassi?: string;
  };
  cobertura: {
    classeBonus?: number;
    tipoSeguro: '1' | '6' | '7';
    tipoAssistencia: 'N' | 'C' | 'V';
    isencaoFiscal?: '24747' | '24748' | '24749';
    codigoCobertura: '1' | '2' | '3' | '4' | '5' | '6';
    tipoModalidade?: 'A' | 'D';
    codigoFranquia?: string;
    codigoFranquiaIndenizacaoIntegral?: string;
    principalCondutor?: string;
    garagemPrincipalCondutor?: string;
    coberturaPessoasResidentes1825Anos?: string;
  };
  vigencia: {
    inicio: string; // DD/MM/AAAA
    fim: string;    // DD/MM/AAAA
  };
}

export interface CotacaoResultadoItem {
  providerId: string;
  numeroCalculo: string;
  modalidades: Array<{
    codigoModalidade: string;
    descricaoModalidade: string;
    premioLiquido: number;
    custoApolice: number;
    coberturas: Array<{ codigo: string; descricao: string; valor?: number; premio?: number; franquia?: string }>;
    parcelas: Array<{ numero: number; valor: number }>;
  }>;
  avisos: string[];
}

export interface CotacaoResultado {
  providerId: string;
  ok: boolean;
  itens?: CotacaoResultadoItem[];
  erro?: string;
}

export interface InsurerProvider {
  id: string;
  cotar(input: CotacaoInput): Promise<CotacaoResultado>;
}
```

- [ ] **Step 3: Checar tipos**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: sem erros (arquivo novo não é usado ainda em lugar nenhum, só precisa compilar sozinho).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json _api/insurers/types.ts
git commit -m "feat: dependência fast-xml-parser + tipos genéricos de cotação (_api/insurers)"
```

---

### Task 2: Tabela `cotacoes` + registro nos 4 lugares

**Files:**
- Create: `_api/db/schema/insurers.ts`
- Modify: `_api/db/schema/index.ts`
- Modify: `_api/data/entityMap.ts`
- Modify: `_api/data/tenantMiddleware.ts`
- Modify: `src/services/DataService.ts`

**Interfaces:**
- Produces: `cotacoes` (tabela Drizzle), entidade `'cotacoes'` utilizável via `DataService.list/create/get` (frontend) e `dataRouter` genérico (backend).

- [ ] **Step 1: Criar o schema da tabela**

```ts
// _api/db/schema/insurers.ts
import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';
import { leads } from './leads';

export const cotacoes = pgTable('cotacoes', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  // onDelete cascade desde o início — esta mesma sessão encontrou dois bugs em produção
  // (lead_pessoa_juridica, campaign_log) causados por FK pra leads.id sem essa configuração.
  leadId: text('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  numeroCalculo: text('numero_calculo'),
  status: text('status').notNull(), // 'ok' | 'erro'
  resultado: jsonb('resultado'),
  erro: text('erro'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_cotacoes_lead').on(t.leadId),
]);
```

- [ ] **Step 2: Exportar no barrel de schema**

Em `_api/db/schema/index.ts`, adicionar ao final:

```ts
export * from './insurers';
```

- [ ] **Step 3: Registrar em `entityMap.ts` (backend)**

Em `_api/data/entityMap.ts`, dentro de `ENTITY_TABLE`, adicionar (perto de `campaign_log`):

```ts
  cotacoes: schema.cotacoes, cotacao: schema.cotacoes,
```

- [ ] **Step 4: Registrar em `ORG_SCOPED_ENTITIES` (backend)**

Em `_api/data/tenantMiddleware.ts`, dentro do `Set` `ORG_SCOPED_ENTITIES`, adicionar `'cotacoes', 'cotacao',` (sem isso, a rota genérica `/api/data/cotacoes/query` NÃO filtra por organização, mesmo a tabela tendo a coluna — vazamento entre tenants).

- [ ] **Step 5: Registrar em `DataService.ts` (frontend) — dois lugares**

Em `src/services/DataService.ts`, dentro de `ORG_SCOPED_ENTITIES` (linha ~47-57), adicionar `'cotacoes', 'cotacao',`.

Dentro de `COLLECTION_MAP` (linha ~62-117), adicionar:

```ts
    'cotacoes': 'cotacoes',
    'cotacao': 'cotacoes',
```

- [ ] **Step 6: Aplicar no banco de produção**

```bash
npx dotenv -e .env -- drizzle-kit push --verbose
```

Confirmar no output que aparece `CREATE TABLE "cotacoes"` com `FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade`. Se aparecerem outras mudanças não relacionadas (renomeação de constraint em outra tabela), são drift cosmético já conhecido — não bloqueiam.

- [ ] **Step 7: Verificar a cascade direto no banco**

```bash
cat > ./_tmp_verify_cotacoes.mjs << 'EOF'
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT conname, confdeltype FROM pg_constraint
  WHERE conrelid = 'cotacoes'::regclass AND contype = 'f'
`;
console.log(rows);
EOF
npx dotenv -e .env -- node ./_tmp_verify_cotacoes.mjs
rm ./_tmp_verify_cotacoes.mjs
```

Expected: uma linha com `conname` contendo `lead_id` e `confdeltype: 'c'`.

- [ ] **Step 8: Checar tipos e commitar**

```bash
npx tsc --noEmit -p tsconfig.json
git add _api/db/schema/insurers.ts _api/db/schema/index.ts _api/data/entityMap.ts _api/data/tenantMiddleware.ts src/services/DataService.ts
git commit -m "feat: tabela cotacoes (histórico de multicálculo por lead, FK com cascade)"
```

---

### Task 3: Credenciais cifradas (`credentials.ts`)

**Files:**
- Create: `_api/insurers/credentials.ts`
- Test: `_api/insurers/__tests__/credentials.test.ts`

**Interfaces:**
- Consumes: `encrypt`/`decrypt` de `_api/lib/emailEncryption.ts`; `getDb()` de `_api/lib/db.ts`; tabela `settings` de `_api/db/schema/settings.ts`.
- Produces: `getInsurerCredentials(organizationId, providerId): Promise<TokioMarineCredentials | null>` (com senha em texto puro, só uso interno server-side), `getInsurerCredentialsSafe(organizationId): Promise<Record<string, InsurerCredentialsSafe>>` (sem segredo, pro frontend), `saveInsurerCredentials(organizationId, providerId, data): Promise<void>`.

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
// _api/insurers/__tests__/credentials.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/db.js', () => ({ getDb: vi.fn() }));
vi.mock('../../lib/emailEncryption.js', () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => s.replace(/^enc\(/, '').replace(/\)$/, '')),
}));
vi.mock('../../db/schema/settings.js', () => ({ settings: { id: 'id', data: 'data' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((a, b) => ({ op: 'eq', a, b })) }));

import { getDb } from '../../lib/db.js';
import { encrypt, decrypt } from '../../lib/emailEncryption.js';
import { getInsurerCredentials, getInsurerCredentialsSafe, saveInsurerCredentials } from '../credentials.js';

function makeSelectChain(rows: any[]) {
  return { select: vi.fn().mockReturnThis(), from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(rows) };
}
function makeInsertChain() {
  const chain: any = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  return chain;
}

describe('_api/insurers/credentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getInsurerCredentials devolve null quando não há documento salvo', async () => {
    (getDb as any).mockReturnValue(makeSelectChain([]));
    const result = await getInsurerCredentials('org1', 'tokio');
    expect(result).toBeNull();
  });

  it('getInsurerCredentials decifra a senha antes de devolver', async () => {
    (getDb as any).mockReturnValue(makeSelectChain([{
      id: 'org1::insurers',
      data: { tokio: { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadoraEnc: 'enc(SENHA123)', cpfEmissor: '11122233344' } },
    }]));
    const result = await getInsurerCredentials('org1', 'tokio');
    expect(decrypt).toHaveBeenCalledWith('enc(SENHA123)');
    expect(result).toEqual({ ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA123', cpfEmissor: '11122233344' });
  });

  it('getInsurerCredentialsSafe nunca inclui a senha, nem cifrada', async () => {
    (getDb as any).mockReturnValue(makeSelectChain([{
      id: 'org1::insurers',
      data: { tokio: { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadoraEnc: 'enc(SENHA123)', cpfEmissor: '11122233344' } },
    }]));
    const result = await getInsurerCredentialsSafe('org1');
    expect(result.tokio).toEqual({ ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', cpfEmissor: '11122233344', temCredencial: true });
    expect(JSON.stringify(result)).not.toContain('SENHA123');
    expect(JSON.stringify(result)).not.toContain('codigoOperadoraEnc');
  });

  it('saveInsurerCredentials cifra a senha antes de gravar', async () => {
    const insertChain = makeInsertChain();
    (getDb as any).mockReturnValue({ ...makeSelectChain([]), ...insertChain });
    await saveInsurerCredentials('org1', 'tokio', { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA123', cpfEmissor: '11122233344' });
    expect(encrypt).toHaveBeenCalledWith('SENHA123');
    expect(insertChain.values).toHaveBeenCalled();
  });

  it('saveInsurerCredentials com senha vazia mantém a senha cifrada já salva', async () => {
    const selectChain = makeSelectChain([{
      id: 'org1::insurers',
      data: { tokio: { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadoraEnc: 'enc(SENHA_ANTIGA)', cpfEmissor: '11122233344' } },
    }]);
    const insertChain = makeInsertChain();
    (getDb as any).mockReturnValue({ ...selectChain, ...insertChain });
    await saveInsurerCredentials('org1', 'tokio', { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: '', cpfEmissor: '11122233344' });
    expect(encrypt).not.toHaveBeenCalled();
    const savedValues = insertChain.values.mock.calls[0][0];
    expect(savedValues.data.tokio.codigoOperadoraEnc).toBe('enc(SENHA_ANTIGA)');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run _api/insurers/__tests__/credentials.test.ts
```

Expected: FAIL — `Cannot find module '../credentials.js'`.

- [ ] **Step 3: Implementar `credentials.ts`**

```ts
// _api/insurers/credentials.ts
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { encrypt, decrypt } from '../lib/emailEncryption.js';
import { settings } from '../db/schema/settings.js';

export interface TokioMarineCredentials {
  ativa: boolean;
  ambiente: 'aceite-w' | 'aceite-y' | 'producao';
  codigoCorretor: string;
  codigoUsuario: string;
  codigoOperadora: string; // texto puro — só uso interno server-side
  cpfEmissor: string;
}

export interface InsurerCredentialsSafe {
  ativa: boolean;
  ambiente: string;
  codigoCorretor: string;
  codigoUsuario: string;
  cpfEmissor: string;
  temCredencial: boolean;
}

function docId(organizationId: string): string {
  return `${organizationId}::insurers`;
}

async function loadDoc(organizationId: string): Promise<Record<string, any>> {
  const [row] = await getDb().select().from(settings).where(eq(settings.id, docId(organizationId)));
  return (row?.data as Record<string, any>) ?? {};
}

export async function getInsurerCredentials(organizationId: string, providerId: string): Promise<TokioMarineCredentials | null> {
  const doc = await loadDoc(organizationId);
  const raw = doc[providerId];
  if (!raw) return null;
  const { codigoOperadoraEnc, ...rest } = raw;
  return { ...rest, codigoOperadora: decrypt(codigoOperadoraEnc) } as TokioMarineCredentials;
}

export async function getInsurerCredentialsSafe(organizationId: string): Promise<Record<string, InsurerCredentialsSafe>> {
  const doc = await loadDoc(organizationId);
  const result: Record<string, InsurerCredentialsSafe> = {};
  for (const [providerId, raw] of Object.entries(doc)) {
    const { codigoOperadoraEnc, ...rest } = raw as any;
    result[providerId] = { ...rest, temCredencial: !!codigoOperadoraEnc };
  }
  return result;
}

export async function saveInsurerCredentials(
  organizationId: string,
  providerId: string,
  data: { ativa: boolean; ambiente: string; codigoCorretor: string; codigoUsuario: string; codigoOperadora: string; cpfEmissor: string },
): Promise<void> {
  const doc = await loadDoc(organizationId);
  const existing = doc[providerId] ?? {};
  const codigoOperadoraEnc = data.codigoOperadora ? encrypt(data.codigoOperadora) : existing.codigoOperadoraEnc;
  const { codigoOperadora, ...rest } = data;
  const nextDoc = { ...doc, [providerId]: { ...rest, codigoOperadoraEnc } };
  await getDb().insert(settings)
    .values({ id: docId(organizationId), data: nextDoc })
    .onConflictDoUpdate({ target: settings.id, set: { data: nextDoc, updatedAt: new Date().toISOString() } });
}
```

- [ ] **Step 4: Rodar os testes de novo**

```bash
npx vitest run _api/insurers/__tests__/credentials.test.ts
```

Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add _api/insurers/credentials.ts _api/insurers/__tests__/credentials.test.ts
git commit -m "feat: credenciais de seguradora cifradas na tabela settings (_api/insurers/credentials.ts)"
```

---

### Task 4: Rotas de credenciais + registro em `server.ts`

**Files:**
- Create: `_api/insurers/router.ts` (só a parte de credenciais nesta task — cotar/veículos/pdf entram na Task 8)
- Modify: `server.ts`

**Interfaces:**
- Consumes: `getInsurerCredentialsSafe`, `saveInsurerCredentials` (Task 3); `requireAuth` de `_api/lib/authMiddleware.js`.
- Produces: `insurersRouter` (Express `Router`) montado em `/api/insurers`.

- [ ] **Step 1: Criar `router.ts` com as rotas de credenciais**

```ts
// _api/insurers/router.ts
import { Router } from 'express';
import { requireAuth } from '../lib/authMiddleware.js';
import { loadTenantContext } from '../data/tenantMiddleware.js';
import { getInsurerCredentialsSafe, saveInsurerCredentials, getInsurerCredentials } from './credentials.js';

export const insurersRouter = Router();
insurersRouter.use(requireAuth);
insurersRouter.use(loadTenantContext);

function requireAdmin(req: any, res: any, next: any) {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem gerenciar credenciais de seguradora' });
  next();
}

insurersRouter.get('/credenciais', requireAdmin, async (req: any, res) => {
  const creds = await getInsurerCredentialsSafe(req.organizationId);
  res.json(creds);
});

insurersRouter.put('/credenciais/:providerId', requireAdmin, async (req: any, res) => {
  const { ativa, ambiente, codigoCorretor, codigoUsuario, codigoOperadora, cpfEmissor } = req.body ?? {};
  if (!ambiente || !codigoCorretor || !codigoUsuario || !cpfEmissor) {
    return res.status(400).json({ error: 'ambiente, codigoCorretor, codigoUsuario e cpfEmissor são obrigatórios' });
  }
  await saveInsurerCredentials(req.organizationId, req.params.providerId, {
    ativa: !!ativa, ambiente, codigoCorretor, codigoUsuario, codigoOperadora: codigoOperadora ?? '', cpfEmissor,
  });
  res.status(204).end();
});

insurersRouter.post('/credenciais/:providerId/validar', requireAdmin, async (req: any, res) => {
  const creds = await getInsurerCredentials(req.organizationId, req.params.providerId);
  if (!creds) return res.status(400).json({ ok: false, error: 'Nenhuma credencial salva para validar' });
  // Validação real (chamar /codigoProduto da Tokio Marine) entra na Task 7, quando o
  // restClient existir. Por enquanto confirma só que há credencial salva.
  res.json({ ok: true, pendingRealValidation: true });
});
```

- [ ] **Step 2: Registrar em `server.ts`**

Seguindo o padrão da rota de CNPJ (`server.ts:357-361`), adicionar logo depois:

```ts
  // ── Multicálculo / Seguradoras ────────────────────────────────────────────────
  const { insurersRouter } = await import('./_api/insurers/router.js');
  app.use('/api/insurers', insurersRouter);
  log.info('Rotas de multicálculo/seguradoras registradas');
```

- [ ] **Step 3: Checar tipos**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 4: Deploy manual no Railway (mesmo motivo das tasks anteriores desta sessão — sem GitHub auto-deploy)**

```bash
git add _api/insurers/router.ts server.ts
git commit -m "feat: rotas de credenciais de seguradora (GET/PUT/validar) + registro no server"
railway up --detach
```

Acompanhar `railway status` até "Online" antes de seguir.

- [ ] **Step 5: Smoke test manual contra produção**

```bash
curl -s -w "\nHTTP:%{http_code}\n" https://michelin-crm-backend-production.up.railway.app/api/insurers/credenciais
```

Expected: `401` (sem token) — confirma que a rota existe e exige auth.

---

### Task 5: Tela de credenciais (Configurações → Seguradoras)

**Files:**
- Create: `src/services/InsurerCredentialsService.ts`
- Create: `src/domains/settings/InsurerSettings.tsx`
- Modify: `src/domains/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `authHeader()` de `src/lib/dataApiClient.ts`.
- Produces: `InsurerCredentialsService.get()`, `.save(providerId, data)`, `.validar(providerId)`; componente `<InsurerSettings />`.

- [ ] **Step 1: Criar o serviço de frontend**

```ts
// src/services/InsurerCredentialsService.ts
import { authHeader } from '../lib/dataApiClient';

export interface TokioMarineCredentialsForm {
  ativa: boolean;
  ambiente: 'aceite-w' | 'aceite-y' | 'producao';
  codigoCorretor: string;
  codigoUsuario: string;
  codigoOperadora: string; // vazio = "não alterar"
  cpfEmissor: string;
}

export interface InsurerCredentialsSafe {
  ativa: boolean;
  ambiente: string;
  codigoCorretor: string;
  codigoUsuario: string;
  cpfEmissor: string;
  temCredencial: boolean;
}

async function handle(res: Response) {
  if (!res.ok) throw new Error(`API /api/insurers respondeu ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export const InsurerCredentialsService = {
  async get(): Promise<Record<string, InsurerCredentialsSafe>> {
    const res = await fetch('/api/insurers/credenciais', { headers: await authHeader() });
    return handle(res);
  },
  async save(providerId: string, data: TokioMarineCredentialsForm): Promise<void> {
    const res = await fetch(`/api/insurers/credenciais/${providerId}`, {
      method: 'PUT', headers: await authHeader(), body: JSON.stringify(data),
    });
    await handle(res);
  },
  async validar(providerId: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`/api/insurers/credenciais/${providerId}/validar`, {
      method: 'POST', headers: await authHeader(),
    });
    return handle(res);
  },
};
```

- [ ] **Step 2: Criar `InsurerSettings.tsx`** (estilo de `src/components/AggerToolSettings.tsx`)

```tsx
// src/domains/settings/InsurerSettings.tsx
import React, { useEffect, useState } from 'react';
import { Shield, Eye, EyeOff, Save, CheckCircle2, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { InsurerCredentialsService, TokioMarineCredentialsForm } from '../../services/InsurerCredentialsService';

const EMPTY_FORM: TokioMarineCredentialsForm = {
  ativa: false, ambiente: 'aceite-w', codigoCorretor: '', codigoUsuario: '', codigoOperadora: '', cpfEmissor: '',
};

export const InsurerSettings: React.FC = () => {
  const [form, setForm] = useState<TokioMarineCredentialsForm>(EMPTY_FORM);
  const [temCredencial, setTemCredencial] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    InsurerCredentialsService.get().then((all) => {
      const tokio = all.tokio;
      if (tokio) {
        setForm({
          ativa: tokio.ativa, ambiente: tokio.ambiente as any, codigoCorretor: tokio.codigoCorretor,
          codigoUsuario: tokio.codigoUsuario, codigoOperadora: '', cpfEmissor: tokio.cpfEmissor,
        });
        setTemCredencial(tokio.temCredencial);
      }
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await InsurerCredentialsService.save('tokio', form);
      setSaved(true);
      setTemCredencial(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const validar = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await InsurerCredentialsService.validar('tokio');
      setValidationResult(result);
    } catch (err: any) {
      setValidationResult({ ok: false, error: err.message });
    } finally {
      setValidating(false);
    }
  };

  if (loading) return <div className="text-white/40 text-[11px] p-6">Carregando...</div>;

  return (
    <section className="bg-brand-dark p-6 rounded-[2rem] border border-gold-deep/20 shadow-xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
          <Shield className="w-5 h-5 text-gold-deep" />
          <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">Tokio Marine</h3>
        </div>
        <div className={cn(
          "px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-[0.18em] flex items-center gap-1.5",
          temCredencial ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"
        )}>
          {temCredencial ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {temCredencial ? 'Credencial salva' : 'Sem credencial'}
        </div>
      </div>

      <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
        <p className="text-[11px] font-black text-white uppercase tracking-wider">Seguradora ativa</p>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, ativa: !f.ativa }))}
          className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors", form.ativa ? "bg-gold-deep" : "bg-white/10")}
        >
          <span className={cn("pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition", form.ativa ? "translate-x-5" : "translate-x-0")} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Ambiente</label>
          <select
            value={form.ambiente}
            onChange={(e) => setForm((f) => ({ ...f, ambiente: e.target.value as any }))}
            className="w-full px-3 py-2 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all"
          >
            <option value="aceite-w">Aceite W (homologação)</option>
            <option value="aceite-y">Aceite Y (homologação)</option>
            <option value="producao">Produção</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">CPF Emissor</label>
          <input
            value={form.cpfEmissor}
            onChange={(e) => setForm((f) => ({ ...f, cpfEmissor: e.target.value }))}
            className="w-full px-3 py-2 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all"
            placeholder="000.000.000-00"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Código Corretor</label>
          <input
            value={form.codigoCorretor}
            onChange={(e) => setForm((f) => ({ ...f, codigoCorretor: e.target.value }))}
            className="w-full px-3 py-2 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Código Usuário</label>
          <input
            value={form.codigoUsuario}
            onChange={(e) => setForm((f) => ({ ...f, codigoUsuario: e.target.value }))}
            className="w-full px-3 py-2 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Código Operadora (senha)</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.codigoOperadora}
              onChange={(e) => setForm((f) => ({ ...f, codigoOperadora: e.target.value }))}
              className="w-full px-3 py-2 pr-9 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all"
              placeholder={temCredencial ? 'Deixe em branco para manter a senha atual' : '••••••••'}
            />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-gold-light transition-colors">
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {validationResult && (
        <div className={cn(
          "p-3 rounded-xl border flex items-start gap-2.5 text-[11px] font-medium",
          validationResult.ok ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300" : "bg-red-500/5 border-red-500/30 text-red-300"
        )}>
          {validationResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
          <span>{validationResult.ok ? 'Credenciais válidas.' : (validationResult.error || 'Falha na validação.')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={validar}
          disabled={!temCredencial || validating}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all disabled:opacity-40"
        >
          {validating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Validar credenciais
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !form.ambiente || !form.codigoCorretor || !form.codigoUsuario || !form.cpfEmissor}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            saved ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300" : "bg-gold-deep text-brand-dark hover:bg-gold-light disabled:opacity-40"
          )}
        >
          {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Salvo</> : <><Save className="w-3.5 h-3.5" /> Salvar</>}
        </button>
      </div>
    </section>
  );
};
```

- [ ] **Step 3: Adicionar a aba em `SettingsPage.tsx`**

Import no topo:

```ts
import { InsurerSettings } from './InsurerSettings';
```

Ampliar o tipo do `activeSubTab` (linha 281) incluindo `'seguradoras'`.

Adicionar o botão da aba (mesmo padrão de `admin`/`diagnostic`, gated por `canManageUsers`), logo após o botão de `'agente_ia'` (linha ~683):

```tsx
        {canManageUsers && (
          <button
            onClick={() => setActiveSubTab('seguradoras')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
              activeSubTab === 'seguradoras' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
            )}
          >
            <Shield className="w-3.5 h-3.5 flex-shrink-0" /> Seguradoras
          </button>
        )}
```

Adicionar o bloco de conteúdo (mesmo padrão de `'sessoes_wa'`), logo após o bloco de `'agente_ia'` (linha ~1090):

```tsx
        {activeSubTab === 'seguradoras' && canManageUsers && (
          <motion.div key="seguradoras" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <InsurerSettings />
          </motion.div>
        )}
```

- [ ] **Step 4: Checar tipos e build**

```bash
npx tsc --noEmit -p tsconfig.json
npm run build
```

- [ ] **Step 5: Commit e deploy (Vercel — automático via push)**

```bash
git add src/services/InsurerCredentialsService.ts src/domains/settings/InsurerSettings.tsx src/domains/settings/SettingsPage.tsx
git commit -m "feat: tela Configurações > Seguradoras — credenciais da Tokio Marine"
git push origin main
```

- [ ] **Step 6: Verificação manual**

Depois do deploy, abrir `/settings`, aba "Seguradoras" (visível só pra quem tem `canManageUsers`), preencher os campos com as credenciais reais de Aceite do usuário, clicar "Salvar", recarregar a página e confirmar que o badge muda pra "Credencial salva" e os campos (exceto senha) continuam preenchidos.

---

### Task 6: `tokioMarine/config.ts` — URLs e resolução de credenciais

**Files:**
- Create: `_api/insurers/tokioMarine/config.ts`

**Interfaces:**
- Consumes: `getInsurerCredentials` (Task 3).
- Produces: `getTokioMarineConfig(organizationId): Promise<TokioMarineConfig>` — usado por `soapClient.ts`, `restClient.ts`, `mapper.ts`.

- [ ] **Step 1: Implementar**

```ts
// _api/insurers/tokioMarine/config.ts
import { getInsurerCredentials, TokioMarineCredentials } from '../credentials.js';

const BASE_URLS: Record<TokioMarineCredentials['ambiente'], string> = {
  'aceite-w': 'https://wscotador-aceitew.tokiomarine.com.br',
  'aceite-y': 'https://wscotador-aceitey.tokiomarine.com.br',
  'producao': 'https://wscotador.tokiomarine.com.br',
};

export interface TokioMarineConfig extends TokioMarineCredentials {
  baseUrl: string;
}

export async function getTokioMarineConfig(organizationId: string): Promise<TokioMarineConfig> {
  const creds = await getInsurerCredentials(organizationId, 'tokio');
  if (!creds) throw new Error('Nenhuma credencial da Tokio Marine cadastrada — configure em Configurações > Seguradoras');
  if (!creds.ativa) throw new Error('Integração com a Tokio Marine está desativada em Configurações > Seguradoras');
  return { ...creds, baseUrl: BASE_URLS[creds.ambiente] };
}
```

- [ ] **Step 2: Checar tipos**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add _api/insurers/tokioMarine/config.ts
git commit -m "feat: resolução de URL/credenciais da Tokio Marine por ambiente"
```

---

### Task 7: `tokioMarine/soapClient.ts` — chamada SOAP genérica

**Files:**
- Create: `_api/insurers/tokioMarine/soapClient.ts`
- Test: `_api/insurers/tokioMarine/__tests__/soapClient.test.ts`

**Interfaces:**
- Produces: `callSoap(params: { baseUrl, path, namespace, method, body }): Promise<any>` — devolve o conteúdo já dentro de `Body.<method>` com prefixos de namespace removidos. Consumido por `mapper.ts`/`provider.ts` (Task 9/10).

- [ ] **Step 1: Escrever o teste (falhando)**

Baseado no exemplo real de request/response do serviço `cotar` da doc (`CotacaoWS`, `<con:cotar>`).

```ts
// _api/insurers/tokioMarine/__tests__/soapClient.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { callSoap } from '../soapClient.js';

describe('tokioMarine/soapClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('monta o envelope SOAP com o namespace e o body corretos', async () => {
    let capturedBody = '';
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toBe('https://wscotador-aceitew.tokiomarine.com.br/TmsWS/Auto/Cotacao?wsdl');
      expect(opts.headers['Content-Type']).toContain('text/xml');
      capturedBody = opts.body;
      return {
        ok: true,
        text: async () => `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:con="CotacaoWS">
  <soapenv:Body>
    <con:cotar>
      <Retorno>
        <Calculo>
          <NumeroCalculo>123456</NumeroCalculo>
        </Calculo>
      </Retorno>
    </con:cotar>
  </soapenv:Body>
</soapenv:Envelope>`,
      };
    }) as any;

    const result = await callSoap({
      baseUrl: 'https://wscotador-aceitew.tokiomarine.com.br',
      path: '/TmsWS/Auto/Cotacao?wsdl',
      namespace: 'CotacaoWS',
      method: 'cotar',
      body: { codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA' },
    });

    expect(capturedBody).toContain('xmlns:con="CotacaoWS"');
    expect(capturedBody).toContain('<con:cotar>');
    expect(capturedBody).toContain('<codigoCorretor>C1</codigoCorretor>');
    expect(result).toEqual({ Retorno: { Calculo: { NumeroCalculo: 123456 } } });
  });

  it('lança erro com o texto da resposta quando o HTTP não é ok', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'Internal Server Error' })) as any;
    await expect(callSoap({
      baseUrl: 'https://x', path: '/y', namespace: 'NS', method: 'm', body: {},
    })).rejects.toThrow('500');
  });

  it('trata múltiplas ocorrências de tags repetíveis como array mesmo com um item só', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:con="CotacaoWS">
  <soapenv:Body>
    <con:cotar>
      <Retorno><Calculo><Itens><Item><ITEM>1</ITEM><Modalidades><Modalidade><CodigoModalidade>M1</CodigoModalidade></Modalidade></Modalidades></Item></Itens></Calculo></Retorno>
    </con:cotar>
  </soapenv:Body>
</soapenv:Envelope>`,
    })) as any;

    const result = await callSoap({ baseUrl: 'https://x', path: '/y', namespace: 'CotacaoWS', method: 'cotar', body: {} });
    expect(Array.isArray(result.Retorno.Calculo.Itens.Item)).toBe(true);
    expect(Array.isArray(result.Retorno.Calculo.Itens.Item[0].Modalidades.Modalidade)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run _api/insurers/tokioMarine/__tests__/soapClient.test.ts
```

Expected: FAIL — `Cannot find module '../soapClient.js'`.

- [ ] **Step 3: Implementar**

```ts
// _api/insurers/tokioMarine/soapClient.ts
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const ARRAY_TAGS = new Set([
  'Item', 'Modalidade', 'Cobertura', 'CondicaoPagamento', 'FormaPagamento',
  'Parcela', 'Mensagem', 'InformacaoAssumida', 'Verba', 'Tipo',
]);

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

export interface CallSoapParams {
  baseUrl: string;
  path: string;
  namespace: string;
  method: string;
  body: Record<string, any>;
}

export async function callSoap({ baseUrl, path, namespace, method, body }: CallSoapParams): Promise<any> {
  const envelope = builder.build({
    'soapenv:Envelope': {
      '@_xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
      '@_xmlns:con': namespace,
      'soapenv:Header': {},
      'soapenv:Body': {
        [`con:${method}`]: body,
      },
    },
  });

  const res = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n${envelope}`,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Tokio Marine SOAP "${method}" retornou ${res.status}: ${text}`);

  const parsed = parser.parse(text);
  return parsed?.Envelope?.Body?.[method];
}
```

- [ ] **Step 4: Rodar os testes de novo**

```bash
npx vitest run _api/insurers/tokioMarine/__tests__/soapClient.test.ts
```

Expected: PASS (3 testes). Se o teste 3 falhar porque `Tipo` não deveria estar em `ARRAY_TAGS` neste caso específico, ajustar o teste ou a lista — o objetivo é confirmar que tags conhecidas como repetíveis nunca colapsam pra objeto único, não que a lista completa esteja perfeita (será ajustada durante o teste manual contra o Aceite na Task 12).

- [ ] **Step 5: Commit**

```bash
git add _api/insurers/tokioMarine/soapClient.ts _api/insurers/tokioMarine/__tests__/soapClient.test.ts
git commit -m "feat: cliente SOAP genérico da Tokio Marine (fetch + fast-xml-parser)"
```

---

### Task 8: `tokioMarine/restClient.ts` — consultas REST

**Files:**
- Create: `_api/insurers/tokioMarine/restClient.ts`
- Test: `_api/insurers/tokioMarine/__tests__/restClient.test.ts`

**Interfaces:**
- Consumes: `TokioMarineConfig` (Task 6).
- Produces: `buscarVeiculos`, `buscarCpfEmissor`, `buscarCoberturasAdicionais`, `buscarValorMercado`, `buscarFranquiaIndenizacaoIntegral`, `buscarPrincipalCondutor`, `buscarGaragemPrincipalCondutor`, `buscarCoberturaResidentes1825Anos`, `buscarCodigoProduto`, `buscarPdfCotacao` — todos usados por `provider.ts` (Task 10) e pelas rotas REST de `router.ts` (Task 11).

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
// _api/insurers/tokioMarine/__tests__/restClient.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buscarVeiculos, buscarCodigoProduto, buscarPdfCotacao } from '../restClient.js';

const CONFIG = {
  baseUrl: 'https://wscotador-aceitew.tokiomarine.com.br',
  codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA', cpfEmissor: '111', ativa: true, ambiente: 'aceite-w' as const,
};

describe('tokioMarine/restClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('buscarVeiculos chama /modelos com os parâmetros certos e devolve a lista', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toBe('https://wscotador-aceitew.tokiomarine.com.br/TmsWS/Auto/consultas/modelos');
      const body = JSON.parse(opts.body);
      expect(body).toEqual({ codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA', codigoProduto: 1, anoModelo: '2023', codigoFIPE: undefined, tipoCombustivel: undefined, inicioVigencia: undefined });
      return {
        ok: true, status: 200,
        json: async () => ({ veiculos: [{ idVeiculo: 999, codigoProduto: 1, nomeProduto: 'Automóvel', codigoFipe: '001004-9', codigoMolicar: null, categoria: '1', codigoFabricante: '56', descricaoFabricante: 'FIAT', codigoModelo: '1234', descricaoModelo: 'ARGO 1.0', lotacao: 5, lotacaoMaxima: 5, tipoCombustivel: 'GASOLINA' }] }),
      };
    }) as any;

    const result = await buscarVeiculos(CONFIG, { codigoProduto: 1, anoModelo: '2023' });
    expect(result.veiculos).toHaveLength(1);
    expect(result.veiculos[0].idVeiculo).toBe(999);
  });

  it('buscarCodigoProduto devolve a lista de produtos com erro tratado', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ produtos: [{ codigo: 1, descricao: 'Automóvel' }, { codigo: 2, descricao: 'Moto' }] }),
    })) as any;

    const result = await buscarCodigoProduto(CONFIG);
    expect(result.produtos.find((p) => p.descricao === 'Automóvel')?.codigo).toBe(1);
  });

  it('lança erro amigável quando a Tokio Marine responde erro HTTP', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' })) as any;
    await expect(buscarCodigoProduto(CONFIG)).rejects.toThrow('401');
  });

  it('buscarPdfCotacao posta em /impressao/cotacao/:numeroCalculo e devolve o pdf em base64', async () => {
    global.fetch = vi.fn(async (url: any) => {
      expect(String(url)).toBe('https://wscotador-aceitew.tokiomarine.com.br/TmsWS/Auto/impressao/cotacao/123456');
      return { ok: true, status: 200, json: async () => ({ impressao: { pdf: 'BASE64PDFDATA' } }) };
    }) as any;

    const result = await buscarPdfCotacao(CONFIG, '123456');
    expect(result.impressao.pdf).toBe('BASE64PDFDATA');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run _api/insurers/tokioMarine/__tests__/restClient.test.ts
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// _api/insurers/tokioMarine/restClient.ts
import { TokioMarineConfig } from './config.js';

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

async function postConsulta<T>(config: TokioMarineConfig, method: string, extra: Record<string, any> = {}): Promise<T> {
  const res = await fetchWithTimeout(`${config.baseUrl}/TmsWS/Auto/consultas/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigoCorretor: config.codigoCorretor,
      codigoUsuario: config.codigoUsuario,
      codigoOperadora: config.codigoOperadora,
      ...extra,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tokio Marine REST "${method}" retornou ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

export interface VeiculoTokioMarine {
  idVeiculo: number; codigoProduto: number; nomeProduto: string; codigoFipe: string | null; codigoMolicar: string | null;
  categoria: string; codigoFabricante: string; descricaoFabricante: string; codigoModelo: string; descricaoModelo: string;
  lotacao: number; lotacaoMaxima: number; tipoCombustivel: string;
}

export async function buscarVeiculos(
  config: TokioMarineConfig,
  params: { codigoProduto: number; anoModelo: string; codigoFIPE?: string; tipoCombustivel?: string; inicioVigencia?: string },
): Promise<{ veiculos: VeiculoTokioMarine[] }> {
  return postConsulta(config, 'modelos', params);
}

export async function buscarCpfEmissor(config: TokioMarineConfig): Promise<{ listaCpfEmissor: Array<{ cpf: string; nome: string }> }> {
  return postConsulta(config, 'cpfEmissor', { codigoParceiroNegocio: undefined });
}

export async function buscarCoberturasAdicionais(
  config: TokioMarineConfig, codigoProduto: number,
): Promise<{ coberturasAdicionais: Array<{ codigo: number; descricao: string; opcoes: Array<{ codigo: string; descricao: string }> }> }> {
  return postConsulta(config, 'coberturasAdicionais', { codigoProduto });
}

export async function buscarValorMercado(
  config: TokioMarineConfig, params: { anoModelo: string; idVeiculo: number; zeroKm: string; inicioVigencia: string },
): Promise<{ valorMercado: { valor: string } }> {
  return postConsulta(config, 'valorMercado', params);
}

export async function buscarFranquiaIndenizacaoIntegral(
  config: TokioMarineConfig, params: { codigoProduto: number; inicioVigencia: string },
): Promise<{ tipos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'franquiaIndenizacaoIntegral', params);
}

export async function buscarPrincipalCondutor(
  config: TokioMarineConfig, params: { codigoProduto: number; inicioVigencia: string; tipoPessoa: string },
): Promise<{ tipos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'principalCondutor', params);
}

export async function buscarGaragemPrincipalCondutor(
  config: TokioMarineConfig, params: { codigoProduto: number; inicioVigencia: string },
): Promise<{ tipos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'principalCondutorGaragem', params);
}

export async function buscarCoberturaResidentes1825Anos(
  config: TokioMarineConfig, params: { codigoProduto: number; inicioVigencia: string },
): Promise<{ tipos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'coberturaResidentes1825Anos', params);
}

export async function buscarCodigoProduto(config: TokioMarineConfig): Promise<{ produtos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'codigoProduto');
}

export async function buscarPdfCotacao(config: TokioMarineConfig, numeroCalculo: string): Promise<{ impressao: { pdf: string } }> {
  const res = await fetchWithTimeout(`${config.baseUrl}/TmsWS/Auto/impressao/cotacao/${numeroCalculo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigoCorretor: config.codigoCorretor, codigoUsuario: config.codigoUsuario, codigoOperadora: config.codigoOperadora,
      produtos: null, formasPagamento: null,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tokio Marine REST "cotacao/pdf" retornou ${res.status}: ${text}`);
  return JSON.parse(text);
}
```

- [ ] **Step 4: Rodar os testes de novo**

```bash
npx vitest run _api/insurers/tokioMarine/__tests__/restClient.test.ts
```

Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add _api/insurers/tokioMarine/restClient.ts _api/insurers/tokioMarine/__tests__/restClient.test.ts
git commit -m "feat: cliente REST de consultas da Tokio Marine (modelos, cpfEmissor, franquias, etc)"
```

---

### Task 9: `tokioMarine/mapper.ts` — CotacaoInput ⇄ XML do `cotar`

**Files:**
- Create: `_api/insurers/tokioMarine/mapper.ts`
- Test: `_api/insurers/tokioMarine/__tests__/mapper.test.ts`

**Interfaces:**
- Consumes: `CotacaoInput`, `CotacaoResultado`, `CotacaoResultadoItem` (Task 1).
- Produces: `buildCotarBody(input: CotacaoInput, config: TokioMarineConfig, codigoProduto: number): Record<string, any>`, `parseCotarResponse(providerId: string, retorno: any): CotacaoResultado` — usados por `provider.ts` (Task 10).

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
// _api/insurers/tokioMarine/__tests__/mapper.test.ts
import { describe, it, expect } from 'vitest';
import { buildCotarBody, parseCotarResponse } from '../mapper.js';
import { CotacaoInput } from '../../types.js';

const CONFIG = { cpfEmissor: '11122233344' } as any;

const BASE_INPUT: CotacaoInput = {
  segurado: { nome: 'João da Silva', cpfCnpj: '11122233344', tipoPessoa: 'fisica', telefone: '67999999999', email: 'joao@example.com' },
  veiculo: { idVeiculoTokio: 999, anoModelo: 2023, zeroKm: false, valorVeiculo: 55000, cep: '79000000', placa: 'ABC1D23', chassi: '9BWZZZ377VT004251' },
  cobertura: { classeBonus: 0, tipoSeguro: '1', tipoAssistencia: 'C', codigoCobertura: '1', tipoModalidade: 'A', codigoFranquia: '1' },
  vigencia: { inicio: '15/09/2026', fim: '15/09/2027' },
};

describe('tokioMarine/mapper — buildCotarBody', () => {
  it('monta o Calculo com Segurado e Item a partir do CotacaoInput', () => {
    const body = buildCotarBody(BASE_INPUT, CONFIG, 1);
    expect(body.Calculo.CpfEmissor).toBe('11122233344');
    expect(body.Calculo.Segurado.NomeSegurado).toBe('João da Silva');
    expect(body.Calculo.Segurado.CGC_CPF).toBe('11122233344');
    expect(body.Calculo.Segurado.TipoPessoa).toBe('F');
    expect(body.Calculo.Item.IdVeiculo).toBe(999);
    expect(body.Calculo.Item.AnoModelo).toBe(2023);
    expect(body.Calculo.Item.ZeroKm).toBe('N');
    expect(body.Calculo.Item.CodigoCobertura).toBe('1');
    expect(body.Calculo.Item.CodigoFranquia).toBe('1');
    expect(body.Calculo.Item.InicioVigencia).toBe('15/09/2026');
    expect(body.Calculo.CodigoProduto).toBe(1);
  });

  it('não envia CodigoFranquia quando CodigoCobertura é 3 (RCF-V)', () => {
    const input = { ...BASE_INPUT, cobertura: { ...BASE_INPUT.cobertura, codigoCobertura: '3' as const, codigoFranquia: '1' } };
    const body = buildCotarBody(input, CONFIG, 1);
    expect(body.Calculo.Item.CodigoFranquia).toBeUndefined();
  });

  it('não envia CodigoFranquia quando CodigoCobertura é 5 (Indenização Integral)', () => {
    const input = { ...BASE_INPUT, cobertura: { ...BASE_INPUT.cobertura, codigoCobertura: '5' as const, codigoFranquia: '1' } };
    const body = buildCotarBody(input, CONFIG, 1);
    expect(body.Calculo.Item.CodigoFranquia).toBeUndefined();
  });

  it('envia TipoPessoa J e usa Nome do Responsável quando pessoa jurídica', () => {
    const input = { ...BASE_INPUT, segurado: { ...BASE_INPUT.segurado, tipoPessoa: 'juridica' as const, cpfCnpj: '11222333000181' } };
    const body = buildCotarBody(input, CONFIG, 1);
    expect(body.Calculo.Segurado.TipoPessoa).toBe('J');
  });
});

describe('tokioMarine/mapper — parseCotarResponse', () => {
  it('extrai modalidades, coberturas e parcelas do XML de retorno', () => {
    const retorno = {
      Calculo: {
        Avisos: { Mensagem: ['Cálculo válido por 7 dias'] },
        NumeroCalculo: '830044509',
        Itens: {
          Item: [{
            ITEM: '1', Placa: 'ABC1D23', Chassi: '9BWZZZ377VT004251',
            Modalidades: {
              Modalidade: [{
                CodigoModalidade: 'M1', CodigoProduto: '1', DescricaoModalidade: 'Compreensiva',
                PremioLiquido: '1200.50', CustoApolice: '25.00',
                Coberturas: { Cobertura: [{ CodigoCobertura: '1', DescricaoCobertura: 'Compreensiva', ValorCobertura: '55000.00', PremioCobertura: '1200.50', FranquiaCobertura: '1500.00' }] },
                Parcelas: { CondicaoPagamento: [{ CodigoCondicaoPagamento: '2', FormaPagamento: [{ CodigoFormaPagamento: '1', Parcela: [{ NumeroParcela: '1', ValorPrimeira: '120.05' }, { NumeroParcela: '2', ValorDemais: '110.00' }] }] }] },
              }],
            },
          }],
        },
      },
      Erros: undefined,
    };

    const result = parseCotarResponse('tokio', retorno);
    expect(result.ok).toBe(true);
    expect(result.itens).toHaveLength(1);
    expect(result.itens![0].numeroCalculo).toBe('830044509');
    expect(result.itens![0].avisos).toEqual(['Cálculo válido por 7 dias']);
    const modalidade = result.itens![0].modalidades[0];
    expect(modalidade.premioLiquido).toBe(1200.5);
    expect(modalidade.coberturas[0].codigo).toBe('1');
    expect(modalidade.parcelas).toHaveLength(2);
    expect(modalidade.parcelas[0].valor).toBe(120.05);
  });

  it('devolve ok:false com a mensagem de erro quando a Tokio Marine recusa o cálculo', () => {
    const retorno = { Calculo: undefined, Erros: { Mensagem: ['CEP inválido'] } };
    const result = parseCotarResponse('tokio', retorno);
    expect(result.ok).toBe(false);
    expect(result.erro).toBe('CEP inválido');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run _api/insurers/tokioMarine/__tests__/mapper.test.ts
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// _api/insurers/tokioMarine/mapper.ts
import { CotacaoInput, CotacaoResultado } from '../types.js';
import { TokioMarineCredentials } from '../credentials.js';

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildCotarBody(input: CotacaoInput, config: Pick<TokioMarineCredentials, 'cpfEmissor'>, codigoProduto: number): Record<string, any> {
  const { segurado, veiculo, cobertura, vigencia } = input;

  const item: Record<string, any> = {
    IdVeiculo: veiculo.idVeiculoTokio,
    AnoModelo: veiculo.anoModelo,
    ZeroKm: veiculo.zeroKm ? 'S' : 'N',
    ValorVeiculo: veiculo.valorVeiculo,
    CEP: veiculo.cep,
    Placa: veiculo.placa,
    Chassi: veiculo.chassi,
    CodigoCobertura: cobertura.codigoCobertura,
    ClasseBonus: cobertura.classeBonus,
    InicioVigencia: vigencia.inicio,
    FinalVigencia: vigencia.fim,
    TipoSeguro: cobertura.tipoSeguro,
    TipoAssistencia: cobertura.tipoAssistencia,
    IsencaoFiscal: cobertura.isencaoFiscal,
    PrincipalCondutor: cobertura.principalCondutor,
    GaragemPrincipalCondutor: cobertura.garagemPrincipalCondutor,
    CoberturaPessoasResidentes1825Anos: cobertura.coberturaPessoasResidentes1825Anos,
    CodigoFranquiaIndenizacaoIntegral: cobertura.codigoFranquiaIndenizacaoIntegral,
  };

  // TipoModalidade não é obrigatório em cotação "sem casco" (RCF-V isolado ou Assistência
  // Exclusiva) — ADR-10 da spec.
  if (cobertura.codigoCobertura !== '3' && cobertura.codigoCobertura !== '6') {
    item.TipoModalidade = cobertura.tipoModalidade;
  }

  // CodigoFranquia (parcial) não se aplica quando a cobertura é RCF-V (3) ou Indenização
  // Integral (5) — ADR-10 da spec.
  if (cobertura.codigoCobertura !== '3' && cobertura.codigoCobertura !== '5') {
    item.CodigoFranquia = cobertura.codigoFranquia;
  }

  return {
    Calculo: {
      CpfEmissor: config.cpfEmissor,
      Segurado: {
        NomeSegurado: segurado.nome,
        CGC_CPF: segurado.cpfCnpj,
        TipoPessoa: segurado.tipoPessoa === 'juridica' ? 'J' : 'F',
        TelefoneSegurado: segurado.telefone,
        EmailSegurado: segurado.email,
      },
      Item: item,
      CodigoProduto: codigoProduto,
    },
  };
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseCotarResponse(providerId: string, retorno: any): CotacaoResultado {
  const erros = toArray(retorno?.Erros?.Mensagem);
  if (erros.length > 0 || !retorno?.Calculo) {
    return { providerId, ok: false, erro: erros[0] ?? 'Erro desconhecido ao calcular na Tokio Marine' };
  }

  const calculo = retorno.Calculo;
  const avisos = toArray(calculo?.Avisos?.Mensagem);
  const itensXml = toArray(calculo?.Itens?.Item);

  const itens = itensXml.map((itemXml: any) => {
    const modalidadesXml = toArray(itemXml?.Modalidades?.Modalidade);
    const modalidades = modalidadesXml.map((mod: any) => {
      const coberturasXml = toArray(mod?.Coberturas?.Cobertura);
      const condicoesXml = toArray(mod?.Parcelas?.CondicaoPagamento);
      const parcelas = condicoesXml.flatMap((cond: any) =>
        toArray(cond?.FormaPagamento).flatMap((forma: any) =>
          toArray(forma?.Parcela).map((p: any) => ({
            numero: toNum(p.NumeroParcela),
            valor: toNum(p.ValorPrimeira ?? p.ValorDemais),
          })),
        ),
      );
      return {
        codigoModalidade: String(mod.CodigoModalidade),
        descricaoModalidade: String(mod.DescricaoModalidade ?? ''),
        premioLiquido: toNum(mod.PremioLiquido),
        custoApolice: toNum(mod.CustoApolice),
        coberturas: coberturasXml.map((c: any) => ({
          codigo: String(c.CodigoCobertura), descricao: String(c.DescricaoCobertura ?? ''),
          valor: c.ValorCobertura !== undefined ? toNum(c.ValorCobertura) : undefined,
          premio: c.PremioCobertura !== undefined ? toNum(c.PremioCobertura) : undefined,
          franquia: c.FranquiaCobertura !== undefined ? String(c.FranquiaCobertura) : undefined,
        })),
        parcelas,
      };
    });
    return { providerId, numeroCalculo: String(calculo.NumeroCalculo), modalidades, avisos: avisos.map(String) };
  });

  return { providerId, ok: true, itens };
}
```

- [ ] **Step 4: Rodar os testes de novo**

```bash
npx vitest run _api/insurers/tokioMarine/__tests__/mapper.test.ts
```

Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add _api/insurers/tokioMarine/mapper.ts _api/insurers/tokioMarine/__tests__/mapper.test.ts
git commit -m "feat: mapper CotacaoInput <-> XML do cotar da Tokio Marine, com regras de ADR-10"
```

---

### Task 10: `tokioMarine/provider.ts` — implementa `InsurerProvider`

**Files:**
- Create: `_api/insurers/tokioMarine/provider.ts`
- Test: `_api/insurers/tokioMarine/__tests__/provider.test.ts`

**Interfaces:**
- Consumes: `getTokioMarineConfig` (Task 6), `callSoap` (Task 7), `buscarCodigoProduto` (Task 8), `buildCotarBody`/`parseCotarResponse` (Task 9).
- Produces: `tokioMarineProvider: InsurerProvider` — usado por `registry.ts` (Task 11).

- [ ] **Step 1: Escrever o teste (falhando)**

```ts
// _api/insurers/tokioMarine/__tests__/provider.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../config.js', () => ({ getTokioMarineConfig: vi.fn() }));
vi.mock('../restClient.js', () => ({ buscarCodigoProduto: vi.fn() }));
vi.mock('../soapClient.js', () => ({ callSoap: vi.fn() }));

import { getTokioMarineConfig } from '../config.js';
import { buscarCodigoProduto } from '../restClient.js';
import { callSoap } from '../soapClient.js';
import { tokioMarineProvider } from '../provider.js';
import { CotacaoInput } from '../../types.js';

const INPUT: CotacaoInput = {
  segurado: { nome: 'João', cpfCnpj: '11122233344', tipoPessoa: 'fisica' },
  veiculo: { idVeiculoTokio: 999, anoModelo: 2023, zeroKm: false, valorVeiculo: 55000, cep: '79000000' },
  cobertura: { tipoSeguro: '1', tipoAssistencia: 'C', codigoCobertura: '1' },
  vigencia: { inicio: '15/09/2026', fim: '15/09/2027' },
};

describe('tokioMarineProvider.cotar', () => {
  it('resolve o CodigoProduto de Automóvel, chama o SOAP cotar e devolve o resultado mapeado', async () => {
    (getTokioMarineConfig as any).mockResolvedValue({ baseUrl: 'https://x', cpfEmissor: '111', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'S1' });
    (buscarCodigoProduto as any).mockResolvedValue({ produtos: [{ codigo: 7, descricao: 'Automóvel' }, { codigo: 9, descricao: 'Moto' }] });
    (callSoap as any).mockResolvedValue({ Retorno: { Calculo: { NumeroCalculo: '830044509', Itens: { Item: [] } }, Erros: undefined } });

    const result = await tokioMarineProvider.cotar('org1', INPUT);

    expect(buscarCodigoProduto).toHaveBeenCalled();
    expect(callSoap).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://x', path: '/TmsWS/Auto/Cotacao?wsdl', namespace: 'CotacaoWS', method: 'cotar',
      body: expect.objectContaining({ codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'S1' }),
    }));
    expect(result.ok).toBe(true);
    expect(result.providerId).toBe('tokio');
  });

  it('devolve ok:false com erro amigável quando não acha "Automóvel" na lista de produtos', async () => {
    (getTokioMarineConfig as any).mockResolvedValue({ baseUrl: 'https://x', cpfEmissor: '111' });
    (buscarCodigoProduto as any).mockResolvedValue({ produtos: [{ codigo: 9, descricao: 'Moto' }] });

    const result = await tokioMarineProvider.cotar('org1', INPUT);

    expect(result.ok).toBe(false);
    expect(result.erro).toContain('Automóvel');
    expect(callSoap).not.toHaveBeenCalled();
  });

  it('devolve ok:false quando as credenciais não estão configuradas', async () => {
    (getTokioMarineConfig as any).mockRejectedValue(new Error('Nenhuma credencial da Tokio Marine cadastrada'));
    const result = await tokioMarineProvider.cotar('org1', INPUT);
    expect(result.ok).toBe(false);
    expect(result.erro).toContain('credencial');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run _api/insurers/tokioMarine/__tests__/provider.test.ts
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Nota: `InsurerProvider.cotar` (Task 1) foi definido como `cotar(input): Promise<CotacaoResultado>`, sem `organizationId` — ajustar a interface aqui, já que cada provider precisa saber de qual organização buscar credenciais. Atualizar `_api/insurers/types.ts` (Task 1):

```ts
// _api/insurers/types.ts — ajustar a assinatura de InsurerProvider
export interface InsurerProvider {
  id: string;
  cotar(organizationId: string, input: CotacaoInput): Promise<CotacaoResultado>;
}
```

```ts
// _api/insurers/tokioMarine/provider.ts
import { InsurerProvider, CotacaoInput, CotacaoResultado } from '../types.js';
import { getTokioMarineConfig } from './config.js';
import { buscarCodigoProduto } from './restClient.js';
import { callSoap } from './soapClient.js';
import { buildCotarBody, parseCotarResponse } from './mapper.js';

async function cotar(organizationId: string, input: CotacaoInput): Promise<CotacaoResultado> {
  try {
    const config = await getTokioMarineConfig(organizationId);

    const { produtos } = await buscarCodigoProduto(config);
    const produtoAuto = produtos.find((p) => p.descricao.toLowerCase().includes('automóvel') || p.descricao.toLowerCase().includes('automovel'));
    if (!produtoAuto) {
      return { providerId: 'tokio', ok: false, erro: 'Não foi possível localizar o código do produto "Automóvel" na Tokio Marine' };
    }

    const body = buildCotarBody(input, config, produtoAuto.codigo);
    const retorno = await callSoap({
      baseUrl: config.baseUrl,
      path: '/TmsWS/Auto/Cotacao?wsdl',
      namespace: 'CotacaoWS',
      method: 'cotar',
      body: { codigoCorretor: config.codigoCorretor, codigoUsuario: config.codigoUsuario, codigoOperadora: config.codigoOperadora, xmlEnvio: body },
    });

    return parseCotarResponse('tokio', retorno?.Retorno);
  } catch (err: any) {
    return { providerId: 'tokio', ok: false, erro: err?.message ?? 'Erro inesperado ao consultar a Tokio Marine' };
  }
}

export const tokioMarineProvider: InsurerProvider = { id: 'tokio', cotar };
```

- [ ] **Step 4: Rodar os testes de novo**

```bash
npx vitest run _api/insurers/tokioMarine/__tests__/provider.test.ts
```

Expected: PASS (3 testes).

- [ ] **Step 5: Checar tipos do projeto inteiro** (a mudança de assinatura de `InsurerProvider` afeta `types.ts`)

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 6: Commit**

```bash
git add _api/insurers/types.ts _api/insurers/tokioMarine/provider.ts _api/insurers/tokioMarine/__tests__/provider.test.ts
git commit -m "feat: tokioMarineProvider — implementação de InsurerProvider.cotar"
```

---

### Task 11: `registry.ts` + rotas de cotação/veículos/pdf em `router.ts`

**Files:**
- Create: `_api/insurers/registry.ts`
- Modify: `_api/insurers/router.ts`

**Interfaces:**
- Consumes: `tokioMarineProvider` (Task 10), `buscarVeiculos`/`buscarPdfCotacao` (Task 8), tabela `cotacoes` (Task 2).
- Produces: `PROVIDERS: InsurerProvider[]`; rotas `POST /api/insurers/cotar`, `GET /api/insurers/veiculos`, `GET /api/insurers/cotacao/:numeroCalculo/pdf`.

- [ ] **Step 1: Criar `registry.ts`**

```ts
// _api/insurers/registry.ts
import { InsurerProvider } from './types.js';
import { tokioMarineProvider } from './tokioMarine/provider.js';

export const PROVIDERS: InsurerProvider[] = [tokioMarineProvider];
```

- [ ] **Step 2: Adicionar as rotas em `router.ts`**

Acrescentar ao arquivo criado na Task 4 (`_api/insurers/router.ts`), depois das rotas de credenciais:

```ts
// (adicionar aos imports do topo do arquivo)
import { randomBytes } from 'crypto';
import { getDb } from '../lib/db.js';
import { cotacoes } from '../db/schema/insurers.js';
import { PROVIDERS } from './registry.js';
import { buscarVeiculos, buscarPdfCotacao, buscarCodigoProduto } from './tokioMarine/restClient.js';
import { getTokioMarineConfig } from './tokioMarine/config.js';
import type { CotacaoInput } from './types.js';

function generateId(): string {
  return randomBytes(9).toString('base64url');
}

insurersRouter.post('/cotar', async (req: any, res) => {
  const input = req.body as CotacaoInput;
  if (!input?.segurado?.nome || !input?.veiculo?.idVeiculoTokio) {
    return res.status(400).json({ error: 'Dados de segurado e veículo (com idVeiculoTokio) são obrigatórios' });
  }

  const resultados = await Promise.all(PROVIDERS.map((p) => p.cotar(req.organizationId, input)));

  await Promise.all(resultados.map((r) =>
    getDb().insert(cotacoes).values({
      id: generateId(),
      organizationId: req.organizationId,
      leadId: input.leadId ?? null,
      providerId: r.providerId,
      numeroCalculo: r.itens?.[0]?.numeroCalculo ?? null,
      status: r.ok ? 'ok' : 'erro',
      resultado: r.itens ?? null,
      erro: r.erro ?? null,
      createdBy: req.userId,
    }),
  ));

  res.json(resultados);
});

insurersRouter.get('/veiculos', async (req: any, res) => {
  const { anoModelo, codigoFIPE, tipoCombustivel } = req.query ?? {};
  if (!anoModelo) return res.status(400).json({ error: 'anoModelo é obrigatório' });
  try {
    const config = await getTokioMarineConfig(req.organizationId);
    const { produtos } = await buscarCodigoProduto(config);
    const produtoAuto = produtos.find((p) => p.descricao.toLowerCase().includes('autom'));
    if (!produtoAuto) return res.status(502).json({ error: 'Código do produto Automóvel não encontrado na Tokio Marine' });
    const result = await buscarVeiculos(config, {
      codigoProduto: produtoAuto.codigo, anoModelo: String(anoModelo),
      codigoFIPE: codigoFIPE ? String(codigoFIPE) : undefined,
      tipoCombustivel: tipoCombustivel ? String(tipoCombustivel) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'Erro ao buscar veículos na Tokio Marine' });
  }
});

insurersRouter.get('/cotacao/:numeroCalculo/pdf', async (req: any, res) => {
  try {
    const config = await getTokioMarineConfig(req.organizationId);
    const result = await buscarPdfCotacao(config, req.params.numeroCalculo);
    res.json({ pdf: result.impressao.pdf });
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'Erro ao buscar PDF da cotação' });
  }
});
```

- [ ] **Step 3: Checar tipos**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 4: Deploy manual no Railway**

```bash
git add _api/insurers/registry.ts _api/insurers/router.ts
git commit -m "feat: rotas POST /cotar, GET /veiculos, GET /cotacao/:numeroCalculo/pdf"
railway up --detach
```

Acompanhar até "Online".

- [ ] **Step 5: Smoke test manual**

```bash
curl -s -w "\nHTTP:%{http_code}\n" https://michelin-crm-backend-production.up.railway.app/api/insurers/veiculos?anoModelo=2023
```

Expected: `401` (sem token) — confirma que a rota está registrada e protegida.

---

### Task 12: Tela `/multicalculo` (frontend)

**Files:**
- Create: `src/services/InsurerService.ts`
- Create: `src/domains/multicalculo/MulticalculoPage.tsx`
- Modify: `src/components/AppContentManager.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `authHeader()` (`src/lib/dataApiClient.ts`); `formatCpfCnpjProgressive`, `detectTipoPessoa`, `validateCPF`, `validateCNPJ`, `formatPhone`-equivalent de `src/lib/utils.ts`; `SEGURADORAS`/`getSeguradora` de `src/lib/seguradoras.ts`; `PDFViewer` de `src/components/PDFViewer.tsx`.
- Produces: rota `/multicalculo` navegável pela Sidebar.

- [ ] **Step 1: Criar o serviço de frontend**

```ts
// src/services/InsurerService.ts
import { authHeader } from '../lib/dataApiClient';

export interface CotacaoInput {
  leadId?: string;
  segurado: { nome: string; cpfCnpj: string; tipoPessoa: 'fisica' | 'juridica'; telefone?: string; email?: string };
  veiculo: { idVeiculoTokio?: number; anoModelo: number; zeroKm: boolean; valorVeiculo: number; cep: string; placa?: string; chassi?: string };
  cobertura: {
    classeBonus?: number; tipoSeguro: '1' | '6' | '7'; tipoAssistencia: 'N' | 'C' | 'V'; isencaoFiscal?: string;
    codigoCobertura: string; tipoModalidade?: string; codigoFranquia?: string; codigoFranquiaIndenizacaoIntegral?: string;
    principalCondutor?: string; garagemPrincipalCondutor?: string; coberturaPessoasResidentes1825Anos?: string;
  };
  vigencia: { inicio: string; fim: string };
}

export interface CotacaoResultado {
  providerId: string;
  ok: boolean;
  itens?: Array<{
    providerId: string; numeroCalculo: string;
    modalidades: Array<{ codigoModalidade: string; descricaoModalidade: string; premioLiquido: number; custoApolice: number; coberturas: Array<{ codigo: string; descricao: string; valor?: number; premio?: number; franquia?: string }>; parcelas: Array<{ numero: number; valor: number }> }>;
    avisos: string[];
  }>;
  erro?: string;
}

export interface VeiculoTokioMarine {
  idVeiculo: number; nomeProduto: string; descricaoFabricante: string; descricaoModelo: string; tipoCombustivel: string;
}

async function handle(res: Response) {
  if (!res.ok) throw new Error(`API /api/insurers respondeu ${res.status}: ${await res.text()}`);
  return res.json();
}

export const InsurerService = {
  async buscarVeiculos(anoModelo: string): Promise<{ veiculos: VeiculoTokioMarine[] }> {
    const res = await fetch(`/api/insurers/veiculos?anoModelo=${encodeURIComponent(anoModelo)}`, { headers: await authHeader() });
    return handle(res);
  },
  async cotar(input: CotacaoInput): Promise<CotacaoResultado[]> {
    const res = await fetch('/api/insurers/cotar', { method: 'POST', headers: await authHeader(), body: JSON.stringify(input) });
    return handle(res);
  },
  async buscarPdf(numeroCalculo: string): Promise<{ pdf: string }> {
    const res = await fetch(`/api/insurers/cotacao/${numeroCalculo}/pdf`, { headers: await authHeader() });
    return handle(res);
  },
};
```

- [ ] **Step 2: Criar a página** (formulário em cards, submissão, resultado, PDF — segue o layout da spec §4.2)

```tsx
// src/domains/multicalculo/MulticalculoPage.tsx
import React, { useState } from 'react';
import { Car, User as UserIcon, ShieldCheck, Calendar, Search, Loader2, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatCpfCnpjProgressive, detectTipoPessoa, formatPhone } from '../../lib/utils';
import { getSeguradora } from '../../lib/seguradoras';
import { InsurerService, CotacaoInput, CotacaoResultado, VeiculoTokioMarine } from '../../services/InsurerService';
import { PDFViewer } from '../../components/PDFViewer';

const Card: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="bg-[#111214] rounded-2xl border border-white/5 p-5 space-y-4">
    <div className="flex items-center gap-2 text-gold-deep">
      <Icon className="w-4 h-4" />
      <h3 className="text-[11px] font-black uppercase tracking-widest">{title}</h3>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">{label}</label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-[12px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all";

export const MulticalculoPage: React.FC = () => {
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');

  const [anoModelo, setAnoModelo] = useState('');
  const [buscaVeiculo, setBuscaVeiculo] = useState<VeiculoTokioMarine[]>([]);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<VeiculoTokioMarine | null>(null);
  const [buscandoVeiculo, setBuscandoVeiculo] = useState(false);
  const [zeroKm, setZeroKm] = useState(false);
  const [valorVeiculo, setValorVeiculo] = useState('');
  const [cep, setCep] = useState('');
  const [placa, setPlaca] = useState('');
  const [chassi, setChassi] = useState('');

  const [classeBonus, setClasseBonus] = useState('0');
  const [tipoSeguro, setTipoSeguro] = useState<'1' | '6' | '7'>('1');
  const [tipoAssistencia, setTipoAssistencia] = useState<'N' | 'C' | 'V'>('C');
  const [isencaoFiscal, setIsencaoFiscal] = useState('24747');
  const [codigoCobertura, setCodigoCobertura] = useState('1');
  const [tipoModalidade, setTipoModalidade] = useState('A');
  const [codigoFranquia, setCodigoFranquia] = useState('1');

  const [inicioVigencia, setInicioVigencia] = useState('');
  const [fimVigencia, setFimVigencia] = useState('');

  const [cotando, setCotando] = useState(false);
  const [resultados, setResultados] = useState<CotacaoResultado[] | null>(null);
  const [erroGeral, setErroGeral] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const tipoPessoa = detectTipoPessoa(cpfCnpj.replace(/\D/g, ''));

  const buscarVeiculos = async () => {
    if (!anoModelo) return;
    setBuscandoVeiculo(true);
    try {
      const { veiculos } = await InsurerService.buscarVeiculos(anoModelo);
      setBuscaVeiculo(veiculos);
    } catch (err: any) {
      setErroGeral(err.message);
    } finally {
      setBuscandoVeiculo(false);
    }
  };

  const dataParaTM = (iso: string) => {
    if (!iso) return '';
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const cotar = async () => {
    if (!veiculoSelecionado) { setErroGeral('Selecione um veículo antes de cotar'); return; }
    setCotando(true);
    setErroGeral('');
    setResultados(null);
    try {
      const input: CotacaoInput = {
        segurado: { nome, cpfCnpj: cpfCnpj.replace(/\D/g, ''), tipoPessoa, telefone: telefone.replace(/\D/g, ''), email },
        veiculo: {
          idVeiculoTokio: veiculoSelecionado.idVeiculo, anoModelo: Number(anoModelo), zeroKm,
          valorVeiculo: Number(valorVeiculo), cep: cep.replace(/\D/g, ''), placa, chassi,
        },
        cobertura: {
          classeBonus: Number(classeBonus), tipoSeguro, tipoAssistencia, isencaoFiscal,
          codigoCobertura, tipoModalidade, codigoFranquia,
        },
        vigencia: { inicio: dataParaTM(inicioVigencia), fim: dataParaTM(fimVigencia) },
      };
      const result = await InsurerService.cotar(input);
      setResultados(result);
    } catch (err: any) {
      setErroGeral(err.message);
    } finally {
      setCotando(false);
    }
  };

  const verPdf = async (numeroCalculo: string) => {
    const { pdf } = await InsurerService.buscarPdf(numeroCalculo);
    setPdfUrl(`data:application/pdf;base64,${pdf}`);
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <h1 className="text-lg font-bold text-white uppercase tracking-tight">Multicálculo</h1>

      <Card title="Segurado" icon={UserIcon}>
        <Field label="Nome Completo"><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="CPF/CNPJ"><input className={inputCls} value={cpfCnpj} onChange={(e) => setCpfCnpj(formatCpfCnpjProgressive(e.target.value))} /></Field>
        <Field label="Telefone"><input className={inputCls} value={telefone} onChange={(e) => setTelefone(formatPhone(e.target.value))} /></Field>
        <Field label="E-mail"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      </Card>

      <Card title="Veículo" icon={Car}>
        <Field label="Ano Modelo">
          <div className="flex gap-2">
            <input className={inputCls} value={anoModelo} onChange={(e) => setAnoModelo(e.target.value)} placeholder="2023" />
            <button type="button" onClick={buscarVeiculos} disabled={buscandoVeiculo} className="px-3 bg-gold-deep text-brand-dark rounded-lg shrink-0">
              {buscandoVeiculo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        </Field>
        <Field label="Veículo">
          <select className={inputCls} value={veiculoSelecionado?.idVeiculo ?? ''} onChange={(e) => setVeiculoSelecionado(buscaVeiculo.find((v) => v.idVeiculo === Number(e.target.value)) ?? null)}>
            <option value="">Busque pelo ano modelo…</option>
            {buscaVeiculo.map((v) => (
              <option key={v.idVeiculo} value={v.idVeiculo}>{v.descricaoFabricante} {v.descricaoModelo} ({v.tipoCombustivel})</option>
            ))}
          </select>
        </Field>
        <Field label="Zero KM">
          <select className={inputCls} value={zeroKm ? 'S' : 'N'} onChange={(e) => setZeroKm(e.target.value === 'S')}>
            <option value="N">Não</option><option value="S">Sim</option>
          </select>
        </Field>
        <Field label="Valor do Veículo (R$)"><input className={inputCls} value={valorVeiculo} onChange={(e) => setValorVeiculo(e.target.value)} /></Field>
        <Field label="CEP"><input className={inputCls} value={cep} onChange={(e) => setCep(e.target.value)} /></Field>
        <Field label="Placa"><input className={inputCls} value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} /></Field>
        <Field label="Chassi"><input className={inputCls} value={chassi} onChange={(e) => setChassi(e.target.value.toUpperCase())} /></Field>
      </Card>

      <Card title="Cobertura" icon={ShieldCheck}>
        <Field label="Classe Bônus"><input className={inputCls} value={classeBonus} onChange={(e) => setClasseBonus(e.target.value)} /></Field>
        <Field label="Tipo de Seguro">
          <select className={inputCls} value={tipoSeguro} onChange={(e) => setTipoSeguro(e.target.value as any)}>
            <option value="1">Novo</option><option value="6">Renovação Congênere</option><option value="7">Renovação Tokio</option>
          </select>
        </Field>
        <Field label="Assistência">
          <select className={inputCls} value={tipoAssistencia} onChange={(e) => setTipoAssistencia(e.target.value as any)}>
            <option value="N">Não possui</option><option value="C">Completa</option><option value="V">VIP</option>
          </select>
        </Field>
        <Field label="Isenção Fiscal">
          <select className={inputCls} value={isencaoFiscal} onChange={(e) => setIsencaoFiscal(e.target.value)}>
            <option value="24747">Não</option><option value="24748">Sim — PCD</option><option value="24749">Sim — exceto PCD</option>
          </select>
        </Field>
        <Field label="Tipo de Cobertura">
          <select className={inputCls} value={codigoCobertura} onChange={(e) => setCodigoCobertura(e.target.value)}>
            <option value="1">Compreensiva</option><option value="2">Incêndio e Roubo</option><option value="3">RCF-V</option>
            <option value="4">Colisão e Incêndio</option><option value="5">Indenização Integral</option><option value="6">Assistência Exclusiva</option>
          </select>
        </Field>
        {codigoCobertura !== '3' && codigoCobertura !== '6' && (
          <Field label="Tipo de Modalidade">
            <select className={inputCls} value={tipoModalidade} onChange={(e) => setTipoModalidade(e.target.value)}>
              <option value="A">Valor Ajustável</option><option value="D">Valor Determinado</option>
            </select>
          </Field>
        )}
        {codigoCobertura !== '3' && codigoCobertura !== '5' && (
          <Field label="Franquia">
            <select className={inputCls} value={codigoFranquia} onChange={(e) => setCodigoFranquia(e.target.value)}>
              <option value="1">Básica</option><option value="4">50% da Básica</option><option value="6">25% da Básica</option>
              <option value="7">75% da Básica</option><option value="2">150% da Básica</option><option value="3">200% da Básica</option>
            </select>
          </Field>
        )}
      </Card>

      <Card title="Vigência" icon={Calendar}>
        <Field label="Início"><input type="date" className={inputCls} value={inicioVigencia} onChange={(e) => setInicioVigencia(e.target.value)} /></Field>
        <Field label="Fim"><input type="date" className={inputCls} value={fimVigencia} onChange={(e) => setFimVigencia(e.target.value)} /></Field>
      </Card>

      {erroGeral && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-300 text-[12px]">
          <AlertCircle className="w-4 h-4 shrink-0" /> {erroGeral}
        </div>
      )}

      <button
        type="button"
        onClick={cotar}
        disabled={cotando || !veiculoSelecionado}
        className="w-full py-3 bg-gold-deep text-brand-dark rounded-xl font-black uppercase tracking-widest text-[12px] disabled:opacity-40"
      >
        {cotando ? 'Cotando...' : 'Cotar'}
      </button>

      {resultados && (
        <div className="space-y-3">
          {resultados.map((r) => {
            const seguradora = getSeguradora(r.providerId);
            return (
              <div key={r.providerId} className="bg-[#111214] rounded-2xl border border-white/5 p-5">
                <div className="flex items-center gap-2 mb-3" style={{ color: seguradora?.cor }}>
                  <ShieldCheck className="w-4 h-4" />
                  <h3 className="text-[12px] font-black uppercase tracking-widest">{seguradora?.nome ?? r.providerId}</h3>
                </div>
                {!r.ok ? (
                  <div className="flex items-center gap-2 text-red-300 text-[12px]"><AlertCircle className="w-4 h-4" /> {r.erro}</div>
                ) : (
                  r.itens?.[0]?.modalidades.map((m) => (
                    <div key={m.codigoModalidade} className="border-t border-white/5 pt-3 mt-3 first:border-0 first:mt-0 first:pt-0">
                      <div className="flex items-center justify-between">
                        <p className="text-white font-bold text-[13px]">{m.descricaoModalidade}</p>
                        <p className="text-gold-deep font-black text-[15px]">R$ {m.premioLiquido.toFixed(2)}</p>
                      </div>
                      <button type="button" onClick={() => verPdf(r.itens![0].numeroCalculo)} className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-white/50 hover:text-gold-deep transition-colors">
                        <FileText className="w-3.5 h-3.5" /> Ver PDF
                      </button>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {pdfUrl && <PDFViewer url={pdfUrl} title="Cotação Tokio Marine" onClose={() => setPdfUrl(null)} />}
    </div>
  );
};
```

- [ ] **Step 3: Registrar a rota**

Em `src/components/AppContentManager.tsx`, adicionar o lazy import (perto de `RelatoriosPage`):

```ts
const MulticalculoPage = lazy(() => import('../domains/multicalculo/MulticalculoPage').then(m => ({ default: m.MulticalculoPage })));
```

E a rota (perto de `/relatorios`):

```tsx
<Route path="/multicalculo" element={<MulticalculoPage />} />
```

- [ ] **Step 4: Adicionar link na Sidebar**

Em `src/components/Sidebar.tsx`, localizar o item de navegação de `/relatorios` (ou similar) e adicionar um item análogo para `/multicalculo`, com um ícone de seguro (`ShieldCheck` ou `Calculator` de `lucide-react`) e label "Multicálculo" — seguir exatamente o mesmo padrão JSX do item vizinho encontrado no arquivo (link `<NavLink>`/`<button>` com `to="/relatorios"` como referência de estrutura).

- [ ] **Step 5: Checar tipos e build**

```bash
npx tsc --noEmit -p tsconfig.json
npm run build
```

- [ ] **Step 6: Commit e deploy**

```bash
git add src/services/InsurerService.ts src/domains/multicalculo/MulticalculoPage.tsx src/components/AppContentManager.tsx src/components/Sidebar.tsx
git commit -m "feat: tela /multicalculo — formulário de cotação Tokio Marine e resultado"
git push origin main
```

---

### Task 13: Teste manual ponta a ponta contra o Aceite

**Files:** nenhum (só verificação)

- [ ] **Step 1:** Abrir `/settings` → aba Seguradoras, preencher as credenciais reais de Aceite (W ou Y) do usuário, salvar, clicar "Validar credenciais" e confirmar `ok: true`.
- [ ] **Step 2:** Abrir `/multicalculo`, preencher os dados de um veículo real, buscar pelo ano modelo e confirmar que a lista de veículos aparece.
- [ ] **Step 3:** Selecionar um veículo, preencher cobertura e vigência, clicar "Cotar" e confirmar que aparece um resultado com prêmio líquido (ou uma mensagem de erro de negócio legível, se os dados de teste não forem válidos para cálculo real).
- [ ] **Step 4:** Clicar "Ver PDF" e confirmar que o PDF abre.
- [ ] **Step 5:** Rodar a suíte de testes completa uma última vez:

```bash
npx vitest run _api/insurers
```

Expected: todos os testes passando.

- [ ] **Step 6:** Se algum campo/regra precisar de ajuste depois de ver o retorno real (ex.: `ARRAY_TAGS` do `soapClient.ts`, mapeamento de algum campo em `mapper.ts`), ajustar, rodar os testes de novo, e commitar como um fix separado — não é esperado acertar 100% no primeiro teste real contra um sistema legado sem sandbox de testes automatizado.

---

## Self-Review

**Cobertura da spec:** ADR-1 (SOAP manual) → Task 7. ADR-2 (tipos genéricos) → Task 1/10. ADR-3 (estrutura de pastas) → todas as tasks de backend. ADR-4 (busca de veículo separada) → Task 8/11/12. ADR-5 (`/modelos` confirmado) → Task 8. ADR-6 (credenciais por tela) → Task 3/4/5. ADR-7 (`requireAuth`) → Task 4. ADR-8 (tabela `cotacoes` com cascade) → Task 2. ADR-9 (campos fora de escopo) → Task 1/9/12 (não implementados, de propósito). ADR-10 (domínios confirmados) → Task 9/12. §4.1 (tela credenciais) → Task 5. §4.2 (tela multicálculo) → Task 12.

**Placeholders:** nenhum "TBD"/"implementar depois" — os dois pontos pendentes da spec (`CoberturaPessoas1825Anos` sem "Resid", `codigoCategoria` de Tipo Veículo v2) não bloqueiam nenhuma task porque nenhum dos dois entra no formulário desta fase (spec §5).

**Consistência de tipos:** `InsurerProvider.cotar` foi ajustado de `(input)` (Task 1) para `(organizationId, input)` (Task 10) — a Task 10 já inclui o passo de atualizar `types.ts`, então não fica divergente entre tasks.

**Correções feitas nesta revisão:** a Task 11 tinha um `import()` dinâmico inconsistente pra `buscarCodigoProduto` na rota `/veiculos`, enquanto `buscarVeiculos`/`buscarPdfCotacao` já vinham de um import normal no topo do arquivo — corrigido pra um import único e consistente.

**Simplificação consciente:** a spec (§4.1) menciona um botão de buscar CPF Emissor via `/cpfEmissor` dentro da tela de credenciais. O plano implementa `buscarCpfEmissor` no `restClient.ts` (Task 8) mas a Task 5 (tela de credenciais) usa um campo de texto simples pro CPF Emissor, sem esse botão de busca — reduz o escopo de UI de um detalhe não-crítico do MVP; a função já existe pronta pra plugar esse botão depois sem precisar de nova task de backend.
