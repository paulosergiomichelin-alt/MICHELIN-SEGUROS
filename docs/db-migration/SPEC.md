# Migração Firestore → PostgreSQL (Neon) — Spec de Arquitetura

> Documento de referência técnica. Os planos executáveis (tarefas passo a passo) ficam em `docs/superpowers/plans/2026-09-10-pg-migration-*.md` e citam este arquivo. Leia este documento inteiro antes de executar qualquer fase.

## 0. Contexto real do projeto (confirmado por leitura de código, não suposição)

- **Frontend**: Vite + React 19 SPA, build vira estático em `dist/`, hospedado na Vercel.
- **Backend real**: `server.ts` (Express + Socket.IO), roda numa **VPS própria** (`143.95.211.30:3000`), não em Vercel Functions. `vercel.json` reescreve `/api/*` e `/socket.io*` para essa VPS — a Vercel só serve os arquivos estáticos da SPA.
- **`_api/**`**: módulos de rota (webhook, campaigns, meta, email, evolution) importados dinamicamente pelo `server.ts`. Falam com o Firestore via um **cliente REST caseiro** (`_api/lib/adminFirebase.ts` — não usa `firebase-admin`, assina JWT manualmente e chama a REST API do Firestore).
- **`api/index.js`**: bundle gerado por `build-server.mjs` a partir de `_api/server.ts` (arquivo diferente do `server.ts` da raiz). Contém uma cópia colada da lógica de `adminFirebase.ts`. **Não está confirmado se é só artefato de build ou se já foi editado manualmente** — isso é uma tarefa de verificação da Fase 4, não uma suposição aqui.
- **Cliente Firestore no browser**: `src/lib/firebase.ts` inicializa `firebase/firestore` + `firebase/auth` + `firebase/storage` direto no navegador. `DataService.ts` (hub genérico) e outros 7 serviços/componentes leem/escrevem Firestore **direto do browser**, protegidos hoje por `firestore.rules`.
- **Importante para a pergunta original do usuário** ("rodar local e depois commitar pro Vercel"): a Vercel nunca vai hospedar o Postgres nem o servidor Node — ela só serve os arquivos estáticos. O Neon (Postgres) é acessado tanto pela VPS (produção) quanto pela máquina local (dev) através da mesma `DATABASE_URL`. Git commit nunca carrega dados, só código e migrations de schema.

## 1. Escopo

**Dentro do escopo**: todos os dados hoje persistidos no Firestore (32 coleções/subcoleções, ver seção 3) migram para Postgres/Neon. A camada de acesso a dados é reescrita para nunca expor o Postgres direto ao browser — tudo passa a ser API HTTP autenticada.

**Fora do escopo** (permanece no Firebase, por decisão explícita — o pedido do usuário foi trocar "o banco de dados", não a autenticação nem o storage de arquivos):
- **Firebase Auth** (login, `UserProfile.uid`, `createUserWithEmailAndPassword` em `EmpresaService.ts`).
- **Firebase Storage** (logos, documentos de lead/cliente, anexos de apólice/NFS-e). `LeadDocument.storagePath`, `ClienteDocumento.path`, `ApoliceAnexo.path` continuam sendo URLs/paths do Storage, só que agora salvos em colunas Postgres em vez de campos Firestore.
- Achado de segurança encontrado de passagem (rotas `_api/**` não validam ID token do Firebase Auth) — **não é objeto deste projeto**, mas fica registrado no risco 7 da seção 8 para o usuário decidir depois.

## 2. Decisões de arquitetura (ADR resumido)

| # | Decisão | Motivo |
|---|---|---|
| ADR-1 | **Neon Postgres**, uma única instância/branch usada tanto em dev local quanto em produção (VPS), via `DATABASE_URL`. | Opção A já escolhida pelo usuário — simplicidade, free tier, sem sincronização manual de dados entre "local" e "prod". |
| ADR-2 | ORM: **Drizzle** (não Prisma). | Mais leve para rodar bem em Node comum (VPS) e serverless; migrations em SQL puro versionadas em git — fácil de auditar linha a linha, o que importa numa migração deste tamanho. |
| ADR-3 | **Preservar a interface pública do `DataService.ts`** (`get/list/listPaginated/create/update/delete/save/subscribe/subscribeCollection/getFromServer/listFromServer`) e reescrever só o interior para chamar uma nova API HTTP genérica. | `DataService` já é usado por ~30 arquivos em `src/**`. Trocar a interface obrigaria a editar todos eles — superfície de bug enorme. Trocar só o motor interno é uma mudança cirúrgica. |
| ADR-4 | Substituir os *query constraint builders* do Firestore (`where`, `orderBy`, `limit`, `startAfter`, hoje importados de `firebase/firestore`) por um módulo local `src/lib/queryConstraints.ts` com **as mesmas assinaturas de função**. | Permite trocar só o `import` (mecânico, buscável por grep) nos ~10-15 arquivos que constroem query constraints, sem reescrever a lógica de cada tela. |
| ADR-5 | Tempo real (`onSnapshot`) é substituído por **Socket.IO** (já é dependência do projeto e já roda no `server.ts`/`socketRegistry.ts`), não por polling puro. | Reaproveita infra existente. Servidor emite evento `data:changed {entity, id, organizationId}` após toda escrita; cliente com subscrição ativa refaz o `get`/`list` correspondente. Fallback: reconciliação por polling a cada 45s como rede de segurança (cobre evento perdido/desconexão). |
| ADR-6 | Serviços que hoje **ignoram o `DataService`** e falam com Firestore direto (`EmpresaService`, `ClienteService`, `TemplateService`, `NfseService`, `LockService`, `MigrationRunnerService`, `TenantIsolationService`, `RelacionamentosTab.tsx`, `leadAutomation.ts`, `SecurityService.generateId`, `LoggerService.ts`, `MetricsService.ts`, `BatchCoordinatorService.ts`, `AdminTools.tsx`) são portados **individualmente**, um por tarefa, para chamar rotas de API novas — não dá para escondê-los por trás do `DataService` sem reescrever a lógica de negócio deles. Os últimos 4 foram encontrados numa revisão de correção posterior (grep direto no código confirmou `writeBatch`/`updateDoc` bypassando `DataService`) e não estavam na lista original — ver Fase 3 Task 11. | Ver Fase 3. |
| ADR-7 | Schema híbrido: campos usados em filtro/ordenação/índice viram **colunas reais**; o resto do documento (campos de cauda longa, específicos de UI) vai para uma coluna `data jsonb`. Nada é descartado — qualquer campo pode ser lido via `data->>'campo'` mesmo sem ser coluna promovida. | `leads` tem ~90 campos; criar 90 colunas tipadas é trabalho de baixo valor e alto risco de erro de digitação. Padrão comum e não-destrutivo de migração documento→relacional. |
| ADR-8 | IDs do Firestore são **preservados como texto** na chave primária Postgres (`id text primary key`), não regenerados. | Referências cruzadas (`leadId`, `clienteId`, `organizationId`, `sessionId`, `conversationId` etc.) aparecem embutidas como string em dezenas de documentos. Preservar o valor exato do ID elimina a necessidade de uma passada de remapeamento de FKs — a maior fonte de bugs num "big bang" de migração de dados. |
| ADR-9 | `whatsapp_conversations` e `whatsapp_messages` — hoje **declaradas no `COLLECTION_MAP` do `DataService` mas na prática nunca persistidas** (vivem só em `Map` de memória em `_api/lib/conversationCache.ts`/`emailCache.ts`, comentário explícito no código: "Avoids Firestore writes entirely... prevents quota exhaustion") — **decisão do usuário (2026-09-10): mantido como está.** Os caches de WhatsApp e e-mail continuam em memória, sem persistência real; as tabelas `whatsapp_conversations`/`whatsapp_messages` existem no schema Postgres (criadas para o caso de uma promoção futura) mas não são escritas por nenhum caminho de código nesta migração. | O plano original propunha promover esses dados para tabelas Postgres reais, corrigindo uma inconsistência já documentada nos commits recentes ("fragilidades e vazamentos de memória", "corrigir paginação findMessages"). Perguntado diretamente na Fase 4 Task 3, o usuário optou por não mudar esse comportamento agora — ver Risco 3 na seção 8 para o registro definitivo da decisão, para não ser reaberta sem contexto numa fase futura. |
| ADR-10 | Multi-tenancy: coluna `organization_id` + índice em toda tabela org-scoped, aplicação continua responsável pelo isolamento (como já é hoje via `TenantIsolationService`/`DataPolicyService`). Postgres Row-Level Security **não** entra nesta fase. | Manter paridade de comportamento com o sistema atual. RLS é uma camada extra de segurança que pode ser adicionada depois sem mudar o schema (fica registrado como melhoria futura, fora de escopo). |

## 3. Inventário de coleções → tabelas (mapa completo)

Todas as 32 coleções/subcoleções confirmadas no código, sem nenhuma omitida (30 do levantamento original + `settings`/`config`, encontradas numa revisão de correção posterior lendo `DataService.ts` diretamente):

| Coleção Firestore | Tabela Postgres | Observação |
|---|---|---|
| `empresas` | `organizations` | |
| `users` | `users` | PK = Firebase Auth `uid` (mantido, Auth não migra) |
| `access_profiles` | `access_profiles` | Não tem `organizationId` no código atual — global |
| `audit_logs` | `audit_logs` | |
| `system_logs` | `system_logs` | Schema exato a confirmar contra `LoggerService.ts` na Fase 1 (tarefa explícita, não suposição) |
| `notifications` | `notifications` | |
| `messages` | `messages` | |
| `follow_ups` | `follow_ups` | |
| `flows` | `flows` | |
| `learning_memory` | `learning_memory` | |
| `system_metrics/dashboard` (doc único) | `system_metrics_dashboard` (1 linha) + `lead_status_counts` | Ver seção 4.9 |
| `dead_letter_queue` | `dead_letter_queue` | Declarada no `COLLECTION_MAP`, nenhum call-site de escrita confirmado — criar tabela por paridade, confirmar uso na Fase 2 |
| `migration_logs` | `migration_logs` | Usada por `MigrationRunnerService` |
| `processing_locks` | `processing_locks` | Lock distribuído, ver seção 4.10 |
| `leads` | `leads` | Schema híbrido, ver seção 4.1 |
| `clientes` | `clientes` | |
| `clientes/{id}/apolices` | `cliente_apolices` | Subcoleção → FK `cliente_id`; valores monetários em **centavos** (manter mesma unidade) |
| `clientes/{id}/historico` | `cliente_historico` | Subcoleção → FK `cliente_id` |
| `cliente_relacionamentos` | `cliente_relacionamentos` | Hoje grava 2 docs por vínculo (bidirecional) — manter esse padrão em 2 linhas |
| `seguradoras` | `seguradoras` | Declarada no `COLLECTION_MAP`, referenciada por `Apolice.seguradoraId`/`Lead.insurer` |
| `whatsapp_sessions` | `whatsapp_sessions` | PK = `instanceName` |
| `whatsapp_conversations` | `whatsapp_conversations` | **Nova tabela real** — ver ADR-9 |
| `whatsapp_messages` | `whatsapp_messages` | **Nova tabela real** — ver ADR-9 |
| `campaigns` | `campaigns` | |
| `campaign_log` | `campaign_log` | |
| `email_accounts` | `email_accounts` | |
| `email_settings` | `email_settings` | PK = `user_id` |
| `metrics_raw` | `metrics_raw` | |
| `metrics_users` | `metrics_users` | PK atual `{uid}_{today}` → manter como PK composta `(user_id, day)` |
| `metrics_daily` | `metrics_daily` | PK atual `{today}` → `day date primary key` |
| `platform_agent_templates` | `platform_agent_templates` | Global (não org-scoped) |
| `platform_guardrails` | `platform_guardrails` | 1 linha fixa `id='universal'` |
| `tenants/{orgId}/config/agent_config` | `tenant_agent_configs` | PK `organization_id` |
| `tenants/{orgId}/onboarding/wizard_state` | `tenant_onboarding_wizard_state` | PK `organization_id` |
| `organizations/{orgId}/nfse` | `nfse_documents` | |
| `organizations/{orgId}/nfse_logs` | `nfse_logs` | |
| `settings` | `settings` | **Adicionada em revisão de correção — faltava no inventário original.** Doc ID composto `{orgId}::{id}` (`DataService.resolveDocId`/`ORG_SETTINGS_COLLECTIONS`, `src/services/DataService.ts:137-149`) — preservado como texto único na PK (ADR-8), sem split de coluna. Ver seção 4.13. |
| `config` | `config` | Idem `settings` — mesmo mecanismo de ID composto, coleção Firestore separada. Ver seção 4.13. |

**Não migram** (ficam no Firebase, fora de escopo): Auth (`users` no Firebase Auth — só o *perfil* em `users` acima migra), Storage (arquivos).

## 4. Schema Postgres completo (DDL de referência)

> Este DDL é o ponto de partida da migration Drizzle da Fase 1. `text` para todo ID que hoje é string Firestore (ADR-8). `timestamptz` para todo campo hoje ISO string. `jsonb` para estruturas aninhadas/livres do Firestore sem equivalente relacional direto.

```sql
-- ─── 4.1 Organizações e usuários ────────────────────────────────────────────

CREATE TABLE organizations (
  id                  text PRIMARY KEY,
  nome_razao_social   text NOT NULL,
  nome_fantasia       text,
  cnpj                text NOT NULL,
  email_corporativo   text NOT NULL,
  telefone            text,
  slug                text UNIQUE NOT NULL,
  logo_url            text,
  plano_saas          text NOT NULL,          -- 'basico'|'profissional'|'enterprise'
  limite_usuarios     integer NOT NULL,
  limite_leads_mes    integer NOT NULL,
  limite_storage_mb   integer NOT NULL,
  status              text NOT NULL,          -- 'trial'|'ativo'|'suspenso'|'inadimplente'|'cancelado'
  trial_expira_em     timestamptz,
  timezone            text NOT NULL,
  idioma              text NOT NULL,
  owner_user_id       text,
  configuracoes       jsonb NOT NULL DEFAULT '{}',
  fiscal_settings     jsonb,
  certificate         jsonb,
  fiscal_services     jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                    text PRIMARY KEY,     -- Firebase Auth uid (Auth não migra)
  organization_id       text REFERENCES organizations(id),
  email                 text NOT NULL,
  name                  text NOT NULL,
  phone                 text,
  role                  text NOT NULL,        -- 'admin'|'gestor'|'atendente'
  user_type             text NOT NULL,        -- 'HUMAN'|'AI'|'IA_SYSTEM'|'BOT_OPERACIONAL'
  profile_id            text,
  permissions           jsonb NOT NULL,
  cargo                 text,
  photo_url             text,
  status                text NOT NULL,        -- 'active'|'inactive'|'suspended'|'pending_setup'
  onboarding_completed  boolean,
  metrics               jsonb,
  activity              jsonb,
  theme                 text,
  chat_preferences      jsonb,
  superadmin            boolean NOT NULL DEFAULT false,
  last_access           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_org ON users(organization_id);

CREATE TABLE access_profiles (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  description        text,
  is_active          boolean NOT NULL DEFAULT true,
  lead_visibility    text NOT NULL,          -- 'own'|'all'
  permissions        jsonb NOT NULL,
  menu_permissions   jsonb NOT NULL DEFAULT '[]',
  field_permissions  jsonb NOT NULL DEFAULT '[]',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 4.2 Leads (schema híbrido — ver ADR-7) ─────────────────────────────────

CREATE TABLE leads (
  id                     text PRIMARY KEY,
  organization_id        text REFERENCES organizations(id),
  status                 text NOT NULL,
  temperature            text,
  score                  numeric,
  vendedor_id            text,
  owner_id               text,
  responsible_agent_id   text,
  responsible_agent_type text,
  cliente_id             text,          -- FK para clientes(id) adicionada via ALTER TABLE abaixo (dependência circular)
  origin                 text NOT NULL,
  is_test                boolean NOT NULL DEFAULT false,
  ia_active              boolean,
  name                   text NOT NULL,
  phone                  text NOT NULL,
  email                  text,
  cpf                    text NOT NULL,
  plate                  text NOT NULL,
  chassis                text NOT NULL,
  insurer                text,
  insurance_type         text,
  closed_at              timestamptz,
  last_interaction       timestamptz,
  next_return_at         timestamptz,
  stuck_since            timestamptz,
  version                integer NOT NULL DEFAULT 1,
  data                   jsonb NOT NULL DEFAULT '{}',  -- todos os demais ~70 campos de Lead (types.ts:99-250)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_org_status ON leads(organization_id, status);
CREATE INDEX idx_leads_org_vendedor ON leads(organization_id, vendedor_id);
CREATE INDEX idx_leads_cliente ON leads(cliente_id);
-- Dependência circular real: leads.cliente_id -> clientes(id) e clientes.lead_origem_id -> leads(id)
-- (ver seção 4.7). Nenhuma das duas FKs pode ser inline na CREATE TABLE porque a outra tabela
-- ainda não existe em nenhuma das duas ordens possíveis. Ambas as tabelas são criadas SEM essas
-- duas colunas referenciando a outra (ver "cliente_id" acima e "lead_origem_id" na seção 4.7),
-- e as FKs são adicionadas depois que AMBAS existem:
--   ALTER TABLE leads    ADD CONSTRAINT fk_leads_cliente        FOREIGN KEY (cliente_id)      REFERENCES clientes(id) DEFERRABLE INITIALLY DEFERRED;
--   ALTER TABLE clientes ADD CONSTRAINT fk_clientes_lead_origem FOREIGN KEY (lead_origem_id)  REFERENCES leads(id)    DEFERRABLE INITIALLY DEFERRED;
-- Na migration Drizzle (Fase 1), isso corresponde a duas migrations separadas (ou uma migration
-- única com os dois ALTER TABLE no final, depois dos dois CREATE TABLE) — nunca `.references()`
-- inline nas duas colunas ao mesmo tempo.
-- IMPORTANTE — dados de produção provavelmente têm ciclos reais (um lead convertido em cliente
-- E o cliente referenciando esse mesmo lead como origem): DEFERRABLE INITIALLY DEFERRED faz o
-- Postgres só checar as duas FKs no COMMIT da transação, não a cada INSERT — sem isso, a
-- migração de dados (Fase 5) trava em qualquer par lead/cliente circular, mesmo inserindo na
-- ordem "certa", porque em algum ponto uma das duas linhas ainda não existe. Ver Fase 5 Task 3.

-- ─── 4.3 Mensagens, notificações, follow-ups, flows, aprendizado ───────────

CREATE TABLE messages (
  id              text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  lead_id         text NOT NULL REFERENCES leads(id),
  sender          text NOT NULL,             -- 'user'|'lead'|'ai'
  text            text NOT NULL,
  attachments     jsonb,
  is_test         boolean NOT NULL DEFAULT false,
  ai_processed    boolean,
  ai_processing_started_at timestamptz,
  timestamp       timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_lead ON messages(lead_id, timestamp);

CREATE TABLE notifications (
  id              text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  user_id         text NOT NULL,
  lead_id         text REFERENCES leads(id),
  lead_name       text,
  title           text NOT NULL,
  message         text NOT NULL,
  type            text NOT NULL,
  priority        text NOT NULL,
  read            boolean NOT NULL DEFAULT false,
  created_by      text NOT NULL,             -- 'ai'|'sistema'
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read);

CREATE TABLE follow_ups (
  id               text PRIMARY KEY,
  organization_id  text REFERENCES organizations(id),
  lead_id          text NOT NULL REFERENCES leads(id),
  scheduled_at     timestamptz NOT NULL,
  status           text NOT NULL,            -- 'pending'|'executed'|'cancelled'
  origin           text NOT NULL,            -- 'ai'|'manual'
  context_summary  text,
  executed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_followups_scheduled ON follow_ups(status, scheduled_at);

CREATE TABLE flows (
  id                     text PRIMARY KEY,
  organization_id        text REFERENCES organizations(id),
  name                   text NOT NULL,
  description            text NOT NULL,
  priority               integer NOT NULL,
  is_active              boolean NOT NULL DEFAULT true,
  layer                  text,               -- 'core'|'decision'|'sales'|'behavior'
  activation_score       numeric,
  compressed_description text,
  applicable_status      jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE learning_memory (
  id               text PRIMARY KEY,
  organization_id  text REFERENCES organizations(id),
  status           text NOT NULL,
  temperature      text,
  profile          text,
  objection_type   text,
  argument_used    text,
  step             text,
  outcome          text NOT NULL,            -- 'fechado'|'perdido'
  timestamp        timestamptz NOT NULL
);

-- ─── 4.4 Auditoria e logs ───────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id              text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  timestamp       timestamptz NOT NULL,
  user_id         text NOT NULL,
  user_name       text,
  ip              text,
  user_agent      text,
  device_type     text,
  browser         text,
  os              text,
  location        text,
  action          text NOT NULL,
  category        text NOT NULL,             -- 'auth'|'leads'|'team'|'security'|'intelligence'|'system'
  entity          text NOT NULL,
  entity_id       text,
  before          jsonb,
  after           jsonb,
  origin          text NOT NULL,             -- 'ai'|'USUARIO'|'sistema'
  details         text,
  status          text,
  result          text,                      -- 'success'|'denied'|'error'
  context         text,
  metadata        jsonb
);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_org_time ON audit_logs(organization_id, timestamp);

-- system_logs: schema exato a confirmar contra LoggerService.ts na Fase 1 antes de criar a migration real.
CREATE TABLE system_logs (
  id         text PRIMARY KEY,
  level      text NOT NULL,
  message    text NOT NULL,
  context    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 4.5 Métricas agregadas (DataService.updateAggregates) ─────────────────

CREATE TABLE system_metrics_dashboard (
  id          text PRIMARY KEY DEFAULT 'dashboard',
  total_leads integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_metrics_dashboard (id) VALUES ('dashboard');

CREATE TABLE lead_status_counts (
  status text PRIMARY KEY,
  count  integer NOT NULL DEFAULT 0
);
-- increment()/decrement() do Firestore (DataService.ts:237-246) traduz para:
--   INSERT INTO lead_status_counts (status, count) VALUES ($1, 1)
--   ON CONFLICT (status) DO UPDATE SET count = lead_status_counts.count + 1;
-- e UPDATE lead_status_counts SET count = count - 1 WHERE status = $1;

CREATE TABLE metrics_raw (
  id         bigserial PRIMARY KEY,
  event      jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE metrics_users (
  user_id text NOT NULL,
  day     date NOT NULL,
  data    jsonb NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE metrics_daily (
  day  date PRIMARY KEY,
  data jsonb NOT NULL
);

-- ─── 4.6 Fila morta, logs de migração interna, locks distribuídos ──────────

CREATE TABLE dead_letter_queue (
  id         text PRIMARY KEY,
  payload    jsonb NOT NULL,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE migration_logs (
  id         text PRIMARY KEY,
  stats      jsonb NOT NULL,       -- shape: MigrationStats (MigrationRunnerService.ts)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE processing_locks (
  id           text PRIMARY KEY,   -- formato atual: '{orgId}:{type}:{resourceId}' — MANTER
  resource_id  text NOT NULL,
  owner_id     text NOT NULL,
  instance_id  text NOT NULL,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- runTransaction (LockService.acquireLock) traduz para:
--   BEGIN;
--   SELECT * FROM processing_locks WHERE id = $1 FOR UPDATE;
--   -- se não existe OU expires_at < now(): INSERT/UPDATE com novo owner+expires_at
--   -- senão: ROLLBACK e retornar "lock ocupado"
--   COMMIT;

-- ─── 4.7 Clientes, apólices, histórico, relacionamentos, seguradoras ───────

CREATE TABLE seguradoras (
  id   text PRIMARY KEY,
  nome text NOT NULL
);
-- Schema mínimo — nenhum call-site de escrita confirmado no inventário; confirmar campos
-- reais (se existirem mais) durante a Fase 3, tarefa "clientes/apólices".

CREATE TABLE clientes (
  id                  text PRIMARY KEY,
  organization_id     text REFERENCES organizations(id),
  nome                text NOT NULL,
  cpf                 text NOT NULL,
  rg                  text,
  rg_data_expedicao   text,
  rg_orgao_emissor    text,
  data_nascimento     date,
  estado_civil        text,
  profissao           text,
  sexo                text,
  telefone            text NOT NULL,
  whatsapp            text,
  email               text,
  cep                 text,
  rua                 text,
  numero              text,
  complemento         text,
  bairro              text,
  cidade              text,
  estado              text,
  responsavel_id      text,
  observacoes         text,
  lead_origem_id      text,          -- FK para leads(id) adicionada via ALTER TABLE — ver nota de dependência circular na seção 4.2
  status              text NOT NULL,        -- 'ativo'|'renovacao_proxima'|'renovacao_vencida'|'inativo'
  seguradora_atual_id text REFERENCES seguradoras(id),
  produto_atual       text,
  data_renovacao      date,
  documentos          jsonb,                -- ClienteDocumento[] (URLs do Firebase Storage)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clientes_org ON clientes(organization_id);

CREATE TABLE cliente_apolices (
  id               text PRIMARY KEY,        -- Firestore usava auto-id (addDoc) — gerar uuid/nanoid equivalente
  cliente_id       text NOT NULL REFERENCES clientes(id),
  produto          text NOT NULL,
  seguradora_id    text REFERENCES seguradoras(id),
  numero_apolice   text NOT NULL,
  inicio_vigencia  date NOT NULL,
  fim_vigencia     date NOT NULL,
  data_renovacao   date NOT NULL,
  premio_liquido_centavos integer NOT NULL, -- valores em CENTAVOS — mesma unidade do Firestore, não converter
  valor_total_centavos    integer NOT NULL,
  comissao_centavos       integer NOT NULL,
  comissao_pct     numeric,
  corretora_origem text,
  observacoes      text,
  status           text NOT NULL,           -- 'ativo'|'cancelado'|'expirado'|'em_renovacao'
  documento_url    text,
  documento_path   text,
  documento_file_name text,
  anexos           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_apolices_cliente ON cliente_apolices(cliente_id);

CREATE TABLE cliente_historico (
  id            text PRIMARY KEY,
  cliente_id    text NOT NULL REFERENCES clientes(id),
  tipo          text NOT NULL,
  descricao     text NOT NULL,
  usuario_id    text,
  usuario_nome  text,
  dados_extras  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_cliente ON cliente_historico(cliente_id);

CREATE TABLE cliente_relacionamentos (
  id                        text PRIMARY KEY,
  cliente_id                text NOT NULL REFERENCES clientes(id),
  related_cliente_id        text NOT NULL REFERENCES clientes(id),
  related_cliente_nome      text NOT NULL,
  related_cliente_telefone  text,
  related_cliente_whatsapp  text,
  related_cliente_cpf       text,
  tipo_relacionamento       text NOT NULL,
  organization_id           text REFERENCES organizations(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
-- O app grava 2 linhas por vínculo (A→B e B→A) — manter esse padrão, não normalizar
-- para 1 linha, senão as duas pontas do RelacionamentosTab.tsx precisam reescrever a query.

-- ─── 4.8 WhatsApp (sessões, e — nova persistência real — conversas/mensagens) ──

CREATE TABLE whatsapp_sessions (
  id              text PRIMARY KEY,        -- instanceName
  organization_id text REFERENCES organizations(id),
  user_id         text NOT NULL,
  session_name    text NOT NULL,
  phone_number    text,
  profile_name    text,
  profile_picture text,
  status          text NOT NULL,           -- 'open'|'connecting'|'close'|'qr'
  qr_base64       text,
  qr_code         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Novas tabelas reais (ADR-9) — hoje só em memória em conversationCache.ts
CREATE TABLE whatsapp_conversations (
  id                     text PRIMARY KEY,
  organization_id        text REFERENCES organizations(id),
  session_id             text NOT NULL REFERENCES whatsapp_sessions(id),
  session_name           text NOT NULL,
  phone                  text NOT NULL,
  contact_name           text,
  contact_picture        text,
  is_group               boolean NOT NULL DEFAULT false,
  lead_id                text REFERENCES leads(id),
  cliente_id             text REFERENCES clientes(id),
  last_message           text,
  last_message_at        timestamptz,
  last_message_direction text,
  unread_count           integer NOT NULL DEFAULT 0,
  presence               text,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_conv_session ON whatsapp_conversations(session_id, updated_at DESC);

CREATE TABLE whatsapp_messages (
  id              text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  conversation_id text NOT NULL REFERENCES whatsapp_conversations(id),
  session_id      text NOT NULL,
  direction       text NOT NULL,           -- 'inbound'|'outbound'
  message_type    text NOT NULL,
  body            text,
  phone           text,
  contact_name    text,
  media_url       text,
  media_path      text,
  mime_type       text,
  file_name       text,
  transcription   text,
  status          text,
  evolution_id    text,
  timestamp       timestamptz NOT NULL
);
CREATE INDEX idx_wa_msg_conv ON whatsapp_messages(conversation_id, timestamp);
-- Migração 100% incremental para o futuro: não há dado existente no Firestore para
-- essas duas tabelas (nunca foram persistidas lá — só existiam em Map de memória).

-- ─── 4.9 Campanhas de mensagens ─────────────────────────────────────────────

CREATE TABLE campaigns (
  id               text PRIMARY KEY,
  organization_id  text REFERENCES organizations(id),
  name             text NOT NULL,
  objective        text,
  instructions     text,
  message_template text,
  session_name     text,
  image_url        text,
  image_order      text,
  target_leads     jsonb,
  status           text NOT NULL,          -- 'idle'|'running'|'paused'|'completed'|'cancelled'|'error'
  total_leads      integer NOT NULL DEFAULT 0,
  sent_count       integer NOT NULL DEFAULT 0,
  error_count      integer NOT NULL DEFAULT 0,
  responded_count  integer NOT NULL DEFAULT 0,
  "limit"          integer,
  interval         integer,
  filters          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign_log (
  id          text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  lead_id     text NOT NULL REFERENCES leads(id),
  lead_name   text NOT NULL,
  status      text NOT NULL,               -- 'sent'|'error'|'pending'
  message     text,
  error       text,
  timestamp   timestamptz NOT NULL
);
CREATE INDEX idx_campaignlog_campaign ON campaign_log(campaign_id);

-- ─── 4.10 E-mail ─────────────────────────────────────────────────────────────

CREATE TABLE email_accounts (
  id              text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  user_id         text NOT NULL,
  provider        text NOT NULL,           -- 'gmail'|'microsoft'
  email           text NOT NULL,
  display_name    text,
  is_default      boolean NOT NULL DEFAULT false,
  status          text NOT NULL,           -- 'connected'|'disconnected'|'error'|'reconnecting'
  last_sync       timestamptz,
  sync_error      text,
  oauth_tokens    jsonb NOT NULL,          -- criptografado na aplicação (ver emailEncryption.ts) — manter mesmo esquema
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_settings (
  user_id      text PRIMARY KEY,
  signature    text,
  display_name text,
  default_account_id text,
  auto_reply   jsonb,
  notifications jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Nota: emails/threads em si (Email, EmailThread) NUNCA foram persistidos no Firestore
-- (vivem só em emailCache.ts, em memória) — não há dado existente a migrar aqui.
-- Mesma decisão do ADR-9 se aplica: usuário decide na Fase 4 se isso vira tabela
-- Postgres real (corrige o mesmo bug de estado por instância) ou continua em memória.

-- ─── 4.11 Templates de agente IA, guardrails, config por tenant ────────────

CREATE TABLE platform_agent_templates (
  id                    text PRIMARY KEY,
  segment               text NOT NULL,
  name                  text NOT NULL,
  description           text,
  version               integer NOT NULL,
  published_at          timestamptz NOT NULL,
  published_by          text NOT NULL,
  default_persona       jsonb NOT NULL,
  default_sales_blocks  jsonb NOT NULL,
  default_hard_rules    jsonb NOT NULL,
  funnel_steps          jsonb NOT NULL,
  lead_fields           jsonb NOT NULL,
  wizard_questions      jsonb NOT NULL,
  preview_conversation  jsonb,
  locked_fields         jsonb NOT NULL DEFAULT '[]',
  suggested_insurers    jsonb
);

CREATE TABLE platform_guardrails (
  id                       text PRIMARY KEY DEFAULT 'universal',
  hard_prohibitions        jsonb NOT NULL,
  hard_requirements        jsonb NOT NULL,
  max_response_length      integer NOT NULL,
  max_questions_per_message integer NOT NULL,
  forbidden_phrases        jsonb NOT NULL,
  version                  integer NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_agent_configs (
  organization_id      text PRIMARY KEY REFERENCES organizations(id),
  template_id          text NOT NULL,
  template_version     integer NOT NULL,
  segment              text NOT NULL,
  custom_persona       jsonb,
  custom_sales_blocks  jsonb,
  custom_hard_rules    jsonb,
  business_context     jsonb NOT NULL,
  onboarding           jsonb NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           text NOT NULL
);

CREATE TABLE tenant_onboarding_wizard_state (
  organization_id  text PRIMARY KEY REFERENCES organizations(id),
  current_step     integer NOT NULL,
  completed_steps  jsonb NOT NULL DEFAULT '[]',
  segment          text,
  template_id      text,
  persona          jsonb,
  business_context jsonb,
  tone             text,
  completed        boolean NOT NULL DEFAULT false,
  started_at       timestamptz NOT NULL,
  completed_at     timestamptz,
  last_saved_step  integer NOT NULL
);

-- ─── 4.12 NFS-e ──────────────────────────────────────────────────────────────

CREATE TABLE nfse_documents (
  id                     text PRIMARY KEY,
  organization_id        text NOT NULL REFERENCES organizations(id),
  numero_nota            text,
  numero_rps             text,
  protocolo              text,
  codigo_verificacao     text,
  cliente_id             text REFERENCES clientes(id),
  cliente_nome           text NOT NULL,
  cliente_cpf_cnpj       text NOT NULL,
  cliente_email          text,
  cliente_telefone       text,
  cliente_endereco       jsonb,
  servico_id             text,
  descricao_servico      text NOT NULL,
  valor_servico_centavos integer NOT NULL,
  quantidade             integer NOT NULL,
  desconto_centavos      integer,
  valor_iss_centavos     integer,
  aliquota_iss           numeric NOT NULL,
  iss_retido             boolean NOT NULL DEFAULT false,
  natureza_operacao      text,
  exigibilidade_iss      text,
  observacoes            text,
  ambiente               text NOT NULL,       -- 'homologacao'|'producao'
  provider               text NOT NULL,
  status                 text NOT NULL,       -- 'rascunho'|'processando'|'emitida'|'cancelada'|'erro'
  xml_url                text,
  pdf_url                text,
  error_message          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  emitted_at             timestamptz,
  canceled_at            timestamptz
);
CREATE INDEX idx_nfse_org ON nfse_documents(organization_id);

CREATE TABLE nfse_logs (
  id                   text PRIMARY KEY,
  organization_id      text NOT NULL REFERENCES organizations(id),
  nfse_id              text NOT NULL REFERENCES nfse_documents(id),
  action               text NOT NULL,
  status               text NOT NULL,
  message              text,
  provider_response    text,
  processing_time_ms    integer,
  user_id              text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── 4.13 Configurações genéricas (settings/config) ────────────────────────
-- Adicionado numa revisão de correção: `settings` e `config` são duas coleções Firestore
-- REAIS e ativas (DataService.COLLECTION_MAP + ORG_SETTINGS_COLLECTIONS,
-- src/services/DataService.ts:60-107) que faltavam neste documento inteiro. Cada doc tem ID
-- composto "{orgId}::{id}" (DataService.resolveDocId) — a decisão da tabela da seção 5 abaixo
-- ("Doc ID composto") já apontava para "manter a mesma string como PK" como opção válida;
-- esta é a implementação escolhida (ADR-8: preservar ID como texto, sem split de coluna).

CREATE TABLE settings (
  id         text PRIMARY KEY,   -- formato existente: "{orgId}::{id}" — preservado literalmente
  data       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE config (
  id         text PRIMARY KEY,   -- mesmo formato de id de `settings`, coleção Firestore separada
  data       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Nota: sem coluna organization_id — o orgId já está embutido no id (consistente com o
-- comportamento atual) e estas duas entidades NÃO estão em ORG_SCOPED_ENTITIES no código-fonte
-- original, então não recebem o filtro automático de tenant do router genérico (Fase 2 Task 1).
-- O isolamento continua vindo de `DataService.resolveDocId` compor o id certo no cliente.
```

> Valores monetários: `Apolice` e `NfseDocument` já guardam valores em **centavos** hoje (achado do inventário) — a coluna Postgres mantém a mesma unidade (`integer`, não `numeric`), para não introduzir um bug de conversão de moeda durante a migração.

## 5. Tradução de semântica Firestore → Postgres (referência rápida)

| Firestore | Postgres | Onde aparece |
|---|---|---|
| `writeBatch` | Transação SQL (`BEGIN`/`COMMIT`) | `DataService` create/update/delete/aggregates, `RelacionamentosTab.tsx`, `LoggerService`, `MigrationRunnerService` |
| `runTransaction` | `SELECT ... FOR UPDATE` ou `INSERT ... ON CONFLICT DO NOTHING RETURNING` | `LockService.acquireLock/releaseLock`, `leadAutomation.ts:44` |
| `increment(n)` | `UPDATE t SET col = col + $1` | `system_metrics_dashboard.total_leads`, `lead_status_counts.count`, `users.metrics` (dentro do jsonb — extrair para coluna se for usado em filtro) |
| `serverTimestamp()` | `now()` | quase toda escrita |
| `{ merge: true }` | `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` | quase toda escrita de `DataService`/`EmpresaService` |
| `arrayUnion`/`arrayRemove` | — (nenhum uso encontrado no código atual) | — |
| Doc ID composto `{orgId}::{id}` (`settings`/`config`) | mantido como a mesma string na PK `text` (ver seção 4.13) — decisão resolvida, não fica mais em aberto | `DataService.ORG_SETTINGS_COLLECTIONS` |
| `collectionGroup(db, 'apolices')` | `SELECT * FROM cliente_apolices` (sem partição por cliente) | `ClienteService.ts` |
| `onSnapshot` | Socket.IO `data:changed` + refetch (ADR-5) | ver seção 6 |

## 6. Tempo real via Socket.IO (detalhe de implementação)

1. **Servidor**: toda rota/serviço que grava em Postgres chama um helper único `emitDataChanged(entity, id, organizationId)` (novo arquivo `_api/lib/realtimeBus.ts`) depois do commit da escrita. O helper usa `getIo()` (já existe em `socketRegistry.ts`) e emite para a room `org:{organizationId}` (rooms por organização já é o padrão natural dado que Socket.IO já roda no `server.ts`).
2. **Cliente**: `DataService.subscribe`/`subscribeCollection` deixam de chamar `onSnapshot` e passam a: (a) fazer o fetch inicial via `get`/`list`, (b) registrar um listener `socket.on('data:changed', handler)` que filtra por `entity`/`id`/`organizationId` e, ao bater, refaz o mesmo `get`/`list` e chama o `callback` do assinante — mesmo contrato público, comportamento equivalente (eventual consistency, não diffs granulares de campo como o Firestore faz).
3. **Rede de segurança**: cada subscrição ativa também refaz o fetch a cada 45s independente de evento (cobre reconexão de socket, evento perdido). Constante configurável, mesma ideia do `QUERY_CACHE_TTL` que já existe em `DataService.ts:260`.
4. Mesma estratégia cobre `EmpresaService` (doc `empresas/{id}`) e `ClienteService` (apolices/historico) — eles emitem o mesmo evento pelo mesmo helper.

## 7. Migração dos dados existentes (visão geral — detalhe na Fase 5)

- Não existe hoje nenhum script de export em massa do Firestore (`scripts/`/`tools/` não têm nada disso) — será escrito do zero na Fase 5, reaproveitando `fsQueryFull` de `_api/lib/adminFirebase.ts` como base de leitura paginada por coleção.
- Ordem de importação respeita as FKs do schema (organizations → users/clientes/seguradoras → leads → messages/notifications/... → cliente_apolices/historico → campanhas/nfse).
- IDs preservados (ADR-8) eliminam remapeamento de referências cruzadas.
- Script roda em modo **dry-run** primeiro (conta documentos por coleção, valida contra o Postgres vazio) e só depois em modo de escrita real, com log de progresso por coleção e contagem final comparada (Firestore count == Postgres count) antes de qualquer cutover.

## 8. Registro de riscos

| # | Risco | Mitigação |
|---|---|---|
| 1 | `leads` tem ~90 campos; qualquer campo esquecido no `data jsonb` vs. coluna promovida pode ficar "invisível" para quem só olha o schema. | Nenhum campo é perdido (tudo cai em `data` por padrão) — documentar explicitamente no schema (feito acima) quais campos foram promovidos e por quê. |
| 2 | `api/index.js` pode não ser só artefato de build. | Fase 4 inclui tarefa explícita de verificação antes de tocar em `_api/**`. |
| 3 | Promover `whatsapp_conversations`/`whatsapp_messages`/e-mails de "memória" para "tabela real" (ADR-9) é uma mudança de comportamento, não só de motor de banco. | **Decidido pelo usuário na Fase 4 Task 3 (2026-09-10): manter como está.** `conversationCache.ts`/`emailCache.ts` continuam em memória, sem persistência real — nenhuma mudança de código foi feita para este risco. As tabelas `whatsapp_conversations`/`whatsapp_messages` seguem existindo no schema (não removidas), mas ficam sem escrita real até uma decisão futura explícita. Não reabrir esta decisão numa fase seguinte sem trazer este contexto de volta ao usuário. |
| 4 | Migração "big bang" (trocar tudo de uma vez) tem alto risco de indisponibilidade. | Plano é sequencial por fase, cada fase entrega algo testável isoladamente (ver planos); cutover final (Fase 6) só ocorre depois de todas as fases anteriores validadas em ambiente de dev/preview. |
| 5 | Perda de dados durante a migração em massa (Fase 5). | Dry-run + contagem comparada + Firestore **não é apagado** até confirmação manual do usuário após período de operação estável em produção (ver Fase 6). |
| 6 | Free tier do Neon tem limite de storage (0.5 GB) — `audit_logs`/`messages`/`whatsapp_messages` podem crescer rápido. | Fora do escopo desta spec resolver, mas fica registrado: monitorar uso e ter plano de upgrade de plano Neon se necessário. |
| 7 | Rotas `_api/**` não validam ID token do Firebase Auth hoje (achado de segurança, não relacionado à troca de banco). | Registrado aqui para visibilidade; não faz parte deste projeto de migração — recomendação de abrir um projeto de segurança separado. |

## 9. Plano de rollback

Cada fase é reversível independentemente até a Fase 6 (cutover):
- Fases 0-4: código novo convive com o código antigo via feature flag de ambiente (`USE_POSTGRES=true/false` lido no boot do `server.ts` e no bundle do frontend via `VITE_USE_POSTGRES`) — permite religar o caminho Firestore instantaneamente se algo falhar em produção.
- Fase 5 (migração de dados): não apaga nada no Firestore; é só leitura lá + escrita no Postgres.
- Fase 6 (cutover): decomissionamento do Firestore como fonte de dados só ocorre depois de um período de operação estável (sugestão: 2 semanas) com `USE_POSTGRES=true` em produção sem incidentes relacionados a dados.

### 9.1 Execução real da Fase 6 (2026-09-11) — desvio registrado do plano original

O plano original assumia cutover na mesma VPS (`143.95.211.30`) que já rodava o backend Firestore. Na prática:

- O usuário decidiu não pagar mais essa VPS e não usá-la — ela ficou indisponível (senha de acesso não fazia mais login com as credenciais conhecidas), tornando `/api/*` e `/socket.io` de produção já inoperantes antes de qualquer ação desta fase.
- **Novo backend**: `server.ts` + `_api/**` (Postgres/Neon) implantado no **Railway** (`michelin-crm-backend-production.up.railway.app`), não na VPS. Evolution API/WhatsApp deixados de fora deste deploy por decisão explícita do usuário — endpoints correspondentes retornam erro gracioso até serem configurados nesse novo ambiente.
- `vercel.json` atualizado para apontar `/api/*`/`/socket.io` pro Railway em vez da VPS morta.
- **Cutover completo sem período de observação de 2 semanas**: dado que a VPS antiga já estava fora do ar (ou seja, `_api/**` já não tinha caminho Firestore funcional em produção havia um tempo indeterminado) e os dados já estavam migrados e verificados (Fase 5, `VERIFY-OK` em todas as 33 coleções), o usuário optou por ativar `USE_POSTGRES=true` (Railway) e `VITE_USE_POSTGRES=true` (Vercel) imediatamente, em vez de esperar. Validado com smoke test real em produção: ciclo completo create/read/update/delete em `leads` via `https://michelin-seguros.vercel.app/api/data/*`, e conexão Socket.IO bem-sucedida pelo mesmo domínio.
- **Firestore não foi apagado nem desativado** — Task 3/4 da Fase 6 (remover o caminho Firestore do código, `_api/lib/adminFirebase.ts`, etc.) não foi executada. O código antigo permanece no repositório; a "reversão" agora seria reverter as env vars (`USE_POSTGRES`/`VITE_USE_POSTGRES` de volta a `false`) mais religar um backend que sirva Firestore — o que não é mais possível sem uma VPS ou serviço equivalente no ar servindo esse caminho, já que a antiga foi abandonada.

### 9.2 Bug pós-cutover encontrado e corrigido (revisão de 2026-09-11)

Numa revisão completa do projeto logo após o cutover, uma comparação de contagens direto no Postgres revelou que `messages` (54/56), `notifications` (12/12), `flows` (19/19), `email_accounts` (1/1) e `campaigns` (4/4) tinham `organization_id` **nulo** — não o literal `"default"` (que o remap da Fase 5 já cobria), mas ausência total do campo no documento Firestore original. Como `orgScopeWhere()` (`_api/data/tenantMiddleware.ts`) filtra por igualdade exata de `organization_id`, qualquer usuário autenticado não-superadmin ficava sem ver quase nenhuma dessas mensagens/notificações/flows — uma regressão de visibilidade de dados real, ativa em produção, descoberta só porque o teste de fumaça comparou a contagem retornada pela API (2 mensagens) com a contagem real conhecida da Fase 5 (56 mensagens).

Corrigido com um `UPDATE ... WHERE organization_id IS NULL` direto no Neon (mesma organização única do sistema) e ajustando `resolveOrgId()` em `scripts/migrate-firestore-to-postgres.ts` pra tratar `undefined`/`null` igual ao literal `"default"` — sem isso, o próximo re-run do script desfaria o backfill. Verificado depois: contagens batendo (56/12/19/4/1) tanto localmente quanto em produção, já que ambos apontam pra mesma instância Neon.

### 9.3 Usuário real ausente do Postgres pós-cutover (2026-09-11) — `runQuery` vs `listDocuments`

Logo após o cutover, o próprio usuário (login real via Google, uid `KjffljEGXMgY3rJbB8bYrnROJwc2`, email `paulosergio.michelin@gmail.com`) recebeu 403 em `/api/data/users/:id` ao abrir o site em produção — esse uid não existia na tabela `users` do Postgres.

Investigação: o documento existe no Firestore (confirmado via `fsGet` e via `listDocuments`), mas a Fase 5 **nunca o migrou**, porque `fsQueryFull('users', [])` (baseado em `runQuery`) nunca o retornou — nem na migração original, nem nos re-runs posteriores (mesmo depois do fix do bug de ordem do spread do `id`, seção 9.2 relacionada). `listDocuments` (endpoint REST diferente, enumeração direta em vez de query) encontra esse documento sem problema. Causa raiz não identificada com certeza — hipótese mais provável é o campo `photoURL` desse documento ser um data-URI base64 de ~76KB, perto de algum limite de tamanho/indexação que faz o Firestore excluí-lo de resultados de `runQuery` sem erro nem aviso. **Não investigado a fundo por falta de tempo** — registrado aqui para o caso de precisar re-auditar `users` (ou qualquer outra coleção com campos grandes) no futuro: preferir `listDocuments` a `runQuery` para enumeração completa quando os documentos podem conter blobs grandes.

Também descoberto no caminho: o documento Firestore desse usuário não tem campo `email` (por isso a Fase 5 o teria descartado mesmo se o `runQuery` o retornasse — a lógica de "pular sem email" no script tratou por engano um OUTRO documento, `s2m4xx27gKVtnEHqHKTF`, que tinha um campo interno `id` corrompido apontando pra esse mesmo texto, artefato do mesmo bug de ordem de spread da seção 9.2, só que na leitura de `users` antes do fix). O email real e verificado vem do Firebase **Auth** (`accounts:lookup`), não do perfil Firestore.

Corrigido inserindo a linha manualmente no Postgres com o email correto do Firebase Auth, `organizationId` da organização real, e os demais campos do perfil Firestore (exceto `photoURL`, descartado — era o data-URI de 76KB, sem motivo pra inflar a coluna quando a foto real do Google já vem via Firebase Auth). Removida também `test-migration-verify`, resíduo de teste que tinha ficado na tabela `users` de produção desde a Fase 4.
