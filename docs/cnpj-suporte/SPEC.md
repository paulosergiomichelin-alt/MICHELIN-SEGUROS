# Suporte a CNPJ (Pessoa Jurídica) em Leads e Clientes — Spec de Arquitetura

## 0. Contexto real (confirmado por leitura de código, não suposição)

- `leads.cpf` e `clientes.cpf` são hoje `NOT NULL` no Postgres (`_api/db/schema/leads.ts`, `_api/db/schema/clientes.ts`). Não existe nenhum campo de CNPJ, nenhum discriminador de tipo de pessoa, e nenhuma lógica de pessoa jurídica em nenhum dos dois módulos.
- O único lugar do sistema que hoje lida com CNPJ é a tela de administração "Empresas" (`src/domains/admin/EmpresasManagement.tsx`) — uma entidade completamente diferente (tenants/organizações do próprio CRM, não clientes/leads da corretora). Ela tem um `formatCnpj()` só de exibição, sem validação de dígito verificador e sem nenhuma busca externa.
- Já existe um padrão de "buscar dado externo e autopreencher" no `ClienteForm.tsx`: ao completar 8 dígitos de CEP, o formulário chama a ViaCEP direto do navegador (`fetch('https://viacep.com.br/ws/...')`) e preenche rua/bairro/cidade/estado. Esse padrão de UX (buscar ao completar o campo, preencher automaticamente, campos continuam editáveis, spinner de carregamento) é a referência de UX pra essa spec — mas a busca de CNPJ vai passar pelo backend, não direto do navegador (ver ADR-3).
- `clientes` já tem um padrão estabelecido de tabelas satélite ligadas por chave estrangeira: `cliente_apolices`, `cliente_historico`, `cliente_relacionamentos`. Duas dessas (`cliente_apolices`, `cliente_historico`) são acessadas por uma rota dedicada (`_api/data/clientesRouter.ts`, endpoints aninhados tipo `/api/data/clientes/:clienteId/apolices`); a terceira (`cliente_relacionamentos`) é acessada pelo mecanismo **genérico** de coleções — registrada em `_api/data/entityMap.ts` (backend) e em `src/services/DataService.ts`'s `COLLECTION_MAP`/`ORG_SCOPED_ENTITIES` (frontend), sem rota dedicada nenhuma. As duas formas convivem hoje no mesmo módulo.
- `leads` não tem uma tabela/coluna de endereço promovida — os campos de endereço residencial/pernoite do tipo `Lead` (em `src/types.ts`) vivem soltos dentro da coluna `data: jsonb('data')`, não como colunas reais. Só `name`, `phone`, `email`, `cpf`, `plate`, `chassis`, `insurer`, `insuranceType` são colunas de primeira classe hoje.
- `LeadForm.tsx` já tem um campo livre chamado "CPF/CNPJ do Proprietário" (`cpfProprietario`/`ownerCpfCnpj`, linha ~1694) — isso é o documento do **dono do veículo** sendo segurado, um conceito totalmente diferente do CPF/CNPJ do lead/cliente em si. Essa spec não mexe nesse campo; é citado aqui só pra deixar claro que os dois não devem ser confundidos durante a implementação.
- `LeadForm.tsx` já faz checagem de duplicidade de CPF (`checkDuplicate('cpf', ...)`, linha ~951) contra outros leads existentes, mas só dispara quando o valor limpo tem exatamente 11 dígitos.
- `src/lib/validation.ts` já tem `isValidCPF()` (validação de dígito verificador). Não existe `isValidCNPJ()` equivalente ainda.
- O sistema já está em produção (Railway + Vercel + Neon Postgres) com dados reais — qualquer migração de schema precisa ser aditiva e não pode quebrar nenhum registro de pessoa física já existente.

## 1. Escopo

Adicionar suporte a cadastro de pessoa jurídica (CNPJ) em **Leads** e **Clientes**, com:
- Um campo único "CPF/CNPJ" que detecta automaticamente pelo tamanho do que foi digitado.
- Ao detectar CNPJ, os campos exclusivos de pessoa física (RG, data de nascimento, estado civil, profissão, sexo) somem da tela; nome/telefone/e-mail continuam existindo, mas passam a representar o contato responsável na empresa.
- Busca automática dos dados da empresa (razão social, nome fantasia, inscrição estadual, situação cadastral, porte, CNAE, endereço) ao completar os 14 dígitos do CNPJ, com preenchimento automático dos campos correspondentes — todos continuam editáveis.
- Telas de listagem/detalhe mostrando razão social/CNPJ no lugar de nome/CPF quando for pessoa jurídica.
- Checagem de duplicidade estendida pra CNPJ, no mesmo padrão que já existe pra CPF.

Fora do escopo desta fase (ver seção 8).

## 2. Decisões de arquitetura (ADR)

**ADR-1 — `tipoPessoa` como coluna nas tabelas principais; `cpf` deixa de ser `NOT NULL`.**
`leads` e `clientes` ganham uma coluna `tipoPessoa: 'fisica' | 'juridica'` (default `'fisica'`, preenchida automaticamente em todo registro existente pela migração — nenhum dado real muda de sentido). `cpf` perde a restrição `NOT NULL` em ambas as tabelas. Motivo: mesmo guardando os detalhes de PJ numa tabela satélite (ADR-2), as telas de listagem precisam saber "é PF ou PJ" pra dezenas de linhas de uma vez sem um JOIN por linha — e uma coluna simples nas tabelas principais resolve isso sem custo.

**ADR-2 — Dados de pessoa jurídica em tabelas satélite (`cliente_pessoa_juridica`, `lead_pessoa_juridica`), acessadas pelo mecanismo genérico de coleções.**
Segue o precedente já usado por `cliente_relacionamentos` (registro em `entityMap.ts` + `DataService.COLLECTION_MAP`/`ORG_SCOPED_ENTITIES`), não o padrão de rota dedicada de `clientesRouter.ts` — porque a relação aqui é 1-pra-1 (uma linha satélite por lead/cliente), então o CRUD genérico (get/set por id) já resolve sem precisar de endpoints aninhados novos. A chave primária de cada tabela satélite É o `clienteId`/`leadId` (não um id próprio), reforçando o 1-pra-1 e tornando a leitura um simples `fsGet(tabela, clienteId)`.

**ADR-3 — Busca de CNPJ por uma rota nova no backend (`GET /api/cnpj/:cnpj`), não direto do navegador.**
Diferente do padrão do CEP (que chama a ViaCEP direto do navegador), a busca de CNPJ passa por uma rota no backend, protegida por `requireAuth` desde o início. Motivo: permite trocar de provedor de API sem mexer no frontend, evita depender de CORS de terceiro continuar liberado, e mantém a política de autenticação correta em uma rota nova — sem herdar o débito de rotas antigas do módulo de e-mail que ficaram sem `requireAuth`.

**ADR-4 — Provedor de consulta: BrasilAPI.**
`https://brasilapi.com.br/api/cnpj/v1/{cnpj}` — gratuita, sem chave de API, dados oficiais da Receita Federal. Sem custo/burocracia de credencial pra configurar em produção.

**ADR-5 — Campo único "CPF/CNPJ" com detecção automática por tamanho (sem seletor explícito PF/PJ).**
Até 11 dígitos → tratado como CPF (pessoa física); a partir do 12º dígito → detectado como CNPJ em digitação, já troca a máscara e a seção do formulário pra pessoa jurídica antes mesmo de completar os 14 dígitos. Reversível: apagar de volta pra ≤11 dígitos volta pra pessoa física. A busca da empresa só dispara ao completar exatamente 14 dígitos (mesmo gatilho de "campo completo" que o CEP já usa com 8 dígitos).

**ADR-6 — Campos nome/telefone/e-mail não são alterados pela busca de CNPJ; representam o contato responsável.**
A busca de CNPJ preenche só os campos novos da empresa (razão social, nome fantasia, inscrição estadual, situação cadastral, porte, CNAE) e o endereço. Nome/telefone/e-mail continuam sendo preenchidos manualmente — a BrasilAPI não retorna "responsável" de forma confiável (o quadro de sócios é um recurso mais avançado, fora do escopo desta fase). Quando `tipoPessoa === 'juridica'`, o rótulo do campo "Nome" muda pra "Nome do responsável" só como texto de UI, sem mudar o dado.

**ADR-7 — Falha na busca de CNPJ nunca bloqueia o formulário.**
CNPJ não encontrado, mal formatado, ou API fora do ar: o formulário continua no modo Pessoa Jurídica (a detecção por tamanho já decidiu isso, independente da busca funcionar), mostra um aviso pequeno e não bloqueante, e deixa todos os campos da empresa disponíveis pra preenchimento manual.

## 3. Modelo de dados (Postgres/Drizzle)

### 3.1 `clientes` — alterações

```ts
// _api/db/schema/clientes.ts
export const clientes = pgTable('clientes', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  nome: text('nome').notNull(), // pessoa física: nome completo. pessoa jurídica: nome do contato responsável.
  cpf: text('cpf'), // deixa de ser .notNull() — nulo quando tipoPessoa === 'juridica'
  tipoPessoa: text('tipo_pessoa').notNull().default('fisica'), // NOVO: 'fisica' | 'juridica'
  // ...todas as colunas existentes continuam iguais (rg, dataNascimento, endereço, etc.)
}, (t) => [
  index('idx_clientes_org').on(t.organizationId),
]);
```

### 3.2 `cliente_pessoa_juridica` — nova tabela

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

O endereço da empresa reaproveita as colunas de endereço já existentes em `clientes` (`cep`/`rua`/`numero`/`complemento`/`bairro`/`cidade`/`estado`) — não duplica.

### 3.3 `leads` — alterações

```ts
export const leads = pgTable('leads', {
  // ...
  name: text('name').notNull(), // pessoa jurídica: nome do contato responsável
  cpf: text('cpf'), // deixa de ser .notNull()
  tipoPessoa: text('tipo_pessoa').notNull().default('fisica'), // NOVO
  // ...
});
```

### 3.4 `lead_pessoa_juridica` — nova tabela

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
  // leads não tem colunas de endereço promovidas — a empresa carrega o próprio endereço aqui
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

### 3.5 Migração

Migração aditiva via drizzle-kit (mesmo mecanismo já usado em `drizzle/0000_low_madelyne_pryor.sql`): `ALTER TABLE leads/clientes ADD COLUMN tipo_pessoa ... DEFAULT 'fisica'`, `ALTER TABLE leads/clientes ALTER COLUMN cpf DROP NOT NULL`, `CREATE TABLE cliente_pessoa_juridica/lead_pessoa_juridica`. Nenhum backfill de dado necessário — todo registro existente já é `tipoPessoa = 'fisica'` por definição (nenhum tinha CNPJ antes) e mantém o `cpf` que já tinha.

### 3.6 Registro nos mecanismos genéricos

- `_api/data/entityMap.ts`: registrar `cliente_pessoa_juridica` e `lead_pessoa_juridica` (com suas respectivas variantes singular/plural, igual o padrão de `cliente_relacionamentos`/`cliente_relacionamento`), incluindo a configuração de chave primária não-padrão (`clienteId`/`leadId` em vez de `id`).
- `src/services/DataService.ts`: adicionar as duas novas coleções em `COLLECTION_MAP` e em `ORG_SCOPED_ENTITIES`.
- `src/lib/validation.ts`: adicionar `isValidCNPJ(cnpj: string): boolean` (validação de dígito verificador), ao lado do `isValidCPF()` já existente.

## 4. API de busca de CNPJ

**Novo arquivo:** `_api/cnpj/[cnpj].ts` (ou `_api/cnpj/lookup.ts` com `:cnpj` como param de rota — a nomenclatura exata fica pro plano de implementação, seguindo a convenção de arquivo-por-rota já usada em `_api/calendar/events.ts`/`_api/email/*`).

**Registro em `server.ts`:** `app.all('/api/cnpj/:cnpj', requireAuth, cnpjLookupHandler)`, seguindo o padrão de import dinâmico já usado pras outras rotas.

**Contrato:**
- `GET /api/cnpj/:cnpj` → 200 com `{ cnpj, razaoSocial, nomeFantasia, inscricaoEstadual, situacaoCadastral, porte, cnae, cep, rua, numero, complemento, bairro, cidade, estado }` (nomes de campo já no formato interno do sistema).
- CNPJ com menos/mais de 14 dígitos (após limpar pontuação) → 400 antes de chamar a BrasilAPI.
- CNPJ não encontrado na Receita → 404.
- BrasilAPI indisponível/timeout → 502.

Sem cache, sem rate-limiting nesta fase — ação disparada manualmente por pessoa, sem volume que justifique. Documentar como possível melhoria futura se o uso real mostrar necessidade (mesmo critério já usado noutras partes do sistema, ex.: limitação conhecida do filtro de datas da Agenda).

## 5. Fluxo de UX (formulário)

Aplica-se igualmente a `ClienteForm.tsx` e `LeadForm.tsx` (implementação separada em cada um, já que são componentes independentes, mas o comportamento é o mesmo):

1. Campo único "CPF/CNPJ" substitui o campo de CPF atual. Uma função de máscara combinada decide o formato a cada tecla: ≤11 dígitos → máscara de CPF; ≥12 dígitos → máscara de CNPJ.
2. O estado `tipoPessoa` do formulário é derivado do tamanho do valor limpo (sem pontuação) a cada mudança — não é um campo separado que a pessoa escolhe, é puramente reativo ao que foi digitado. Isso decide quais campos aparecem (PF vs PJ) em tempo real, nos dois sentidos (digitar mais ou apagar).
3. Ao atingir exatamente 14 dígitos: dispara `GET /api/cnpj/:cnpj`, mostra spinner de carregamento (mesmo componente/estilo já usado em `loadingCep`).
4. Resposta de sucesso: preenche razão social, nome fantasia, inscrição estadual, situação cadastral, porte, CNAE e os campos de endereço — todos continuam editáveis depois de preenchidos.
5. Resposta de erro (400/404/502): mostra aviso curto e não-bloqueante; a tela continua em modo Pessoa Jurídica (a detecção já decidiu isso pelo tamanho do documento, independente da busca ter funcionado), com os campos da empresa vazios pra preenchimento manual.
6. Campos exclusivos de pessoa física (RG, data de nascimento, estado civil, profissão, sexo) somem da tela quando `tipoPessoa === 'juridica'`, mas os valores continuam no estado local do formulário (não são apagados) — só não são incluídos no payload de salvar. Permite alternar de ida e volta sem perder o que já foi digitado.
7. Rótulo do campo de nome muda pra "Nome do responsável" (ou equivalente) quando `tipoPessoa === 'juridica'` — texto de UI, sem mudar a coluna usada (`nome`/`name` continuam sendo os mesmos campos).
8. Ao **editar** um cadastro que já é `tipoPessoa === 'juridica'`: o formulário carrega junto o registro da tabela satélite (`cliente_pessoa_juridica`/`lead_pessoa_juridica`) e já abre direto na visão de Pessoa Jurídica, com o campo único mostrando o CNPJ formatado — sem precisar "redetectar" nada.
9. Ao salvar: se `tipoPessoa === 'fisica'`, comportamento idêntico ao atual (nenhuma mudança visível pra quem só usa pessoa física) — se existir uma linha satélite de uma edição anterior (cadastro que era PJ e virou PF), ela é apagada. Se `tipoPessoa === 'juridica'`, grava a linha principal (`cpf: null`, `tipoPessoa: 'juridica'`, nome/telefone/email como contato) e faz upsert da linha satélite com CNPJ + dados da empresa (+ endereço, no caso do lead). Razão social é obrigatória pra salvar como pessoa jurídica (mesmo peso que "nome" já tem hoje pra pessoa física) — se a busca falhar, a pessoa precisa preencher esse campo manualmente antes de conseguir salvar.

## 6. Telas de listagem/detalhe afetadas

Qualquer tela que hoje exibe `cliente.nome`/`cliente.cpf` ou `lead.name`/`lead.cpf` precisa de um branch simples: se `tipoPessoa === 'juridica'`, mostra razão social (ou nome fantasia, se preenchido) e CNPJ formatado no lugar. Pontos já identificados por busca de código (o plano de implementação vai confirmar a lista exata e pode encontrar mais pontos menores durante a implementação):

- `src/domains/clientes/ClienteDetailPage.tsx`
- `src/domains/clientes/RelacionamentosTab.tsx`
- `src/domains/leads/LeadDetailsSidebar.tsx`
- `src/domains/leads/LeadsView.tsx`
- `src/domains/leads/ContactImport.tsx`

## 7. Checagem de duplicidade

`LeadForm.tsx`'s `checkDuplicate('cpf', ...)` (hoje só dispara com exatamente 11 dígitos) passa a também disparar com exatamente 14 dígitos, buscando duplicidade de CNPJ na tabela `lead_pessoa_juridica` em vez de `leads.cpf`. Mesmo aviso visual, mesmo comportamento — só muda contra qual tabela/coluna a checagem é feita, dependendo do tamanho do documento.

## 8. Registro de riscos

1. **BrasilAPI fora do ar ou limitando requisições** — mitigado pelo ADR-7 (busca nunca bloqueia o formulário; preenchimento manual sempre disponível).
2. **`LeadForm.tsx` já é um arquivo grande (~2000 linhas)** — risco de as mudanças ficarem espalhadas/difíceis de revisar. O plano de implementação deve isolar a lógica nova em funções/hooks dedicados (ex.: um hook `useDocumentoPessoa` compartilhado entre `LeadForm.tsx` e `ClienteForm.tsx`) em vez de duplicar lógica solta nos dois arquivos.
3. **Confusão entre o novo campo CPF/CNPJ e o campo já existente "CPF/CNPJ do Proprietário"** (`cpfProprietario`/`ownerCpfCnpj`, documento do veículo segurado) — são conceitos diferentes; a implementação não deve tocar nesse campo nem reaproveitar sua lógica.
4. **CNAE/situação cadastral/porte não têm tradução amigável nesta fase** — a BrasilAPI retorna código + descrição textual pra a maioria desses campos; a spec assume mostrar a descrição textual que a própria API já devolve, sem tabela de tradução própria.
5. **Migração de `cpf` de `NOT NULL` pra nullable em produção** — aditiva e segura (não exclui/transforma dado existente), mas precisa ser testada localmente contra uma cópia do schema antes de aplicar em produção, seguindo o mesmo cuidado já usado nas migrações anteriores deste projeto.

## 9. Fases de execução (visão preliminar — o plano de implementação detalha as tarefas exatas)

- **Fase A — Fundação:** schema (migração), `isValidCNPJ`, rota `/api/cnpj/:cnpj`, registro nas coleções genéricas.
- **Fase B — Cliente:** `ClienteForm.tsx` (campo único, detecção, autopreenchimento, salvar/editar), `ClienteDetailPage.tsx`/`RelacionamentosTab.tsx` (exibição).
- **Fase C — Lead:** `LeadForm.tsx` (mesma lógica, adaptada ao arquivo maior e sem colunas de endereço promovidas), checagem de duplicidade de CNPJ, `LeadDetailsSidebar.tsx`/`LeadsView.tsx`/`ContactImport.tsx` (exibição).
- **Fase D — Verificação manual + deploy**, seguindo o mesmo processo já usado nas fases anteriores deste projeto (build, testes, deploy Railway+Vercel, teste real com um CNPJ de verdade).

## 10. Fora do escopo desta fase

- Buscar/exibir o quadro de sócios (QSA) da empresa.
- Sugerir automaticamente o "responsável" a partir do quadro de sócios.
- Cache ou rate-limiting da busca de CNPJ.
- Migrar/mesclar o campo "CPF/CNPJ do Proprietário" (documento do veículo) pra essa mesma lógica de detecção — fica como está.
- Suporte a mais de uma empresa por cliente (ex.: grupo econômico com múltiplos CNPJs) — cada cliente/lead tem no máximo uma linha PJ associada.
