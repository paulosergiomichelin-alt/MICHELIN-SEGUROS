# Multicálculo — Integração API Tokio Marine (Fase 1: só cotação) — Spec de Arquitetura

## 0. Contexto real (confirmado por leitura de código, não suposição)

- Hoje o sistema **não tem nenhuma integração direta com API de seguradora**. O único fluxo de "cotar" existente é o **Agger** (`src/lib/agger-quote.ts`, `agger-userscript.user.js`): um link com os dados do lead codificados em base64 no hash da URL, aberto em `aggilizador.com.br`, preenchido por uma extensão de navegador. É um agregador de terceiro via automação de UI, não uma API — e é exclusivo para pessoa física (`buildAggerPayload` lança erro se `lead.cpf` estiver vazio).
- O padrão estabelecido no projeto para **toda** integração externa server-side é `fetch()` direto + um helper `fetchWithTimeout` local (ver `_api/lib/evolutionApi.ts:23`), credenciais lidas via `process.env.X` com uma função getter que lança erro claro se a env var não estiver definida (`_api/lib/evolutionApi.ts:4-11`, `EVOLUTION_API_URL()`). Nenhuma lib de cliente HTTP/SOAP genérica é usada em nenhum lugar do `_api/`.
- `package.json` não tem nenhuma lib de parsing de XML (`fast-xml-parser`, `xml2js`, `soap`, etc.) — vai ser necessário adicionar uma.
- Rotas do backend em `server.ts` seguem o padrão: `const { default: xHandler } = await import('./_api/x/y.js'); app.all('/api/x/y', xHandler);`, registradas dentro de `startServer()`. A rota de CNPJ (`server.ts:358-361`) é o exemplo mais recente e mais simples desse padrão, incluindo `requireAuth` como middleware.
- Já existe uma lista estática de seguradoras com id, cor e logo em `src/lib/seguradoras.ts` — inclui `{ id: 'tokio', nome: 'Tokio Marine', cor: '#003087', logo: ... }`. Essa spec reaproveita o id `'tokio'` como identificador do provider, para ficar consistente com o resto do sistema (ex.: usado em `ApoliceForm.tsx`'s dropdown de seguradora).
- O formulário de Lead (`LeadForm.tsx`) já tem uma seção "Veículo e Seguro" com Placa/Chassi/Ano/Valor e uma seção "Perfil de Uso" com boa parte dos dados de perfil de condução (uso comercial, condutor jovem, proprietário é condutor, alienação fiduciária) — esses dados já existem no `Lead` e podem alimentar o formulário de multicálculo quando a cotação partir de um lead existente.
- O tipo `Lead` (`src/types.ts`) não tem nenhum campo equivalente a `IdVeiculo`, `ClasseBonus`, `CodigoCobertura`, `RegiaoCirculacao` ou qualquer outro campo específico da Tokio Marine — esses são conceitos novos, exclusivos da cotação, que não pertencem ao modelo de dados do Lead.
- **Lacuna de documentação conhecida:** a doc fornecida pelo usuário para o serviço REST `/modelos` (busca de veículo, que resolve o `IdVeiculo` obrigatório para cotar) tem a seção de **resposta** claramente trocada com a de outro endpoint ("Coberturas Adicionais") — os parâmetros de entrada fazem sentido, mas o formato de saída documentado é o errado. Da mesma forma, vários outros serviços REST de "Consultas" mencionados na doc (Valor Mercado, Bancos, Franquia, Região Circulação, Coberturas Adicionais em si, etc.) foram citados só pelo nome, sem contrato de entrada/saída. Essa spec assume formatos razoáveis onde necessário e isola essas incertezas atrás de uma interface só (ver §4.4 e §8).
- **Domínios confirmados pelo usuário apesar do formato divergente:** parte do material colado vem num bloco de formato conversacional ("Olá! Fico feliz em ajudar você..."), estruturalmente diferente das tabelas de doc oficial que vêm antes. O usuário confirmou que a informação é confiável — essa spec trata `TipoSeguro` (1/6/7), `TipoAssistencia` (N/C/V), `IsencaoFiscal` (3 códigos) e as regras associadas (ex.: `TipoVeiculo` Táxi × `IsencaoFiscal`) como **confirmados**, utilizáveis como `<select>` desde já.

## 1. Escopo desta fase

Construir a infraestrutura de **multicálculo** (cotação multi-seguradora) com **uma seguradora implementada — Tokio Marine, produto Automóvel** — cobrindo:

- Cliente SOAP para o serviço `cotar` (`/TmsWS/Auto/Cotacao?wsdl`), que é o núcleo do cálculo.
- Cliente REST para os lookups mínimos necessários para montar uma requisição de cotação válida: busca de veículo (`/modelos`) e CPF Emissor (`/consultas/cpfEmissor`).
- Uma **tela nova e separada** (`/multicalculo`), fora do fluxo do LeadForm, onde o usuário informa os dados do veículo/segurado (com opção de pré-carregar de um Lead existente) e recebe o resultado da cotação.
- Uma abstração de "provider de seguradora" desenhada para múltiplas seguradoras desde o início, mesmo com só uma implementada agora — para que adicionar a 2ª seguradora no futuro não exija redesenhar a tela nem o contrato da API interna.
- Impressão do PDF da cotação (`/TmsWS/Auto/impressao` → `/cotacao/{numeroCalculo}`), já que a doc é explícita: "Não terão validade os cálculos/propostas que não apresentarem o layout/PDF da Tokio Marine".

## 2. Fora do escopo desta fase

- **Efetivação de proposta** (fechar apólice de verdade pela API) — fica para uma fase 2, depois que o fluxo de cotação estiver validado em homologação.
- Upload de documentos / correção de bônus online (`/documentos/consulta`, upload, exclusão) — só entra junto com a efetivação, não é necessário para só cotar.
- Conta Corrente (saldo/aplicar) — é um recurso de desconto sobre uma cotação já efetivada; fica para depois.
- Consulta de apólices existentes (`consultarApolice`, `consultarApoliceDetalhada`) — não faz parte do fluxo de multicálculo em si.
- Qualquer segunda seguradora real — a arquitetura é desenhada para comportar, mas nenhuma outra é implementada nesta fase.
- Ambiente de Produção da Tokio Marine — o usuário só tem credenciais de **Aceite** (homologação) hoje; a integração é construída e testada em Aceite. A troca para Produção é só uma mudança de env var (URL base + credenciais), quando o usuário tiver acesso liberado.

## 3. Decisões de arquitetura (ADR)

**ADR-1 — Cliente SOAP manual (fetch + templates XML), não uma lib genérica tipo `soap`.**
A doc da Tokio Marine já traz o XML exato de request/response de cada operação. Montar esse XML com template strings e fazer parse da resposta com uma lib leve (`fast-xml-parser`, nova dependência — zero deps próprias, ~30KB) dá controle total e é auditável linha a linha contra os exemplos da doc. Uma lib como `node-soap`, que introspecciona o WSDL em runtime, tende a ter atrito com WSDLs corporativos legados (namespaces, encoding) e foge do padrão de "fetch direto" já usado em 100% das integrações externas deste projeto (`evolutionApi.ts`, `CnpjService`, etc.).

**ADR-2 — Modelo de dados de cotação genérico, independente de seguradora, com um `provider` por seguradora.**
```ts
// _api/insurers/types.ts
export interface CotacaoInput {
  segurado: { nome: string; cpfCnpj: string; tipoPessoa: 'fisica' | 'juridica'; telefone?: string; email?: string };
  veiculo: { idVeiculoTokio?: number /* opcional no tipo genérico — cada provider decide o que exige; o mapper da Tokio Marine rejeita com erro claro se faltar, ver ADR-4 */; anoModelo: number; zeroKm: boolean; valorVeiculo: number; cep: string; placa?: string; chassi?: string };
  cobertura: { classeBonus?: number; tipoSeguro: '1' | '6' | '7'; tipoAssistencia: 'N' | 'C' | 'V'; regiaoCirculacao?: string; principalCondutor?: string };
  vigencia: { inicio: string; fim: string };
}

export interface CotacaoResultadoItem {
  providerId: string;          // 'tokio' — bate com o id em src/lib/seguradoras.ts
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
  pdfUrl?: string;              // populado sob demanda via /api/insurers/cotacao/:numeroCalculo/pdf
}

export interface CotacaoResultado {
  providerId: string;
  ok: boolean;
  itens?: CotacaoResultadoItem[];
  erro?: string;                // mensagem amigável se o provider falhou (erro de negócio ou técnico)
}

export interface InsurerProvider {
  id: string;                   // 'tokio'
  cotar(input: CotacaoInput): Promise<CotacaoResultado>;
}
```
`POST /api/insurers/cotar` recebe um `CotacaoInput`, roda **todos os providers habilitados** em paralelo (`Promise.allSettled`, um provider falhando não derruba os outros) e devolve `CotacaoResultado[]`. Hoje o array sempre tem 1 item (Tokio Marine); adicionar a 2ª seguradora é só registrar um novo `InsurerProvider` nessa lista — zero mudança na tela.

**ADR-3 — Estrutura de pastas: `_api/insurers/`, não `_api/tokio-marine/`.**
```
_api/insurers/
  types.ts              # CotacaoInput/CotacaoResultado genéricos (ADR-2)
  router.ts             # POST /cotar, GET /cotacao/:numeroCalculo/pdf, GET /veiculos (busca)
  registry.ts           # lista de providers habilitados
  tokioMarine/
    config.ts           # lê env vars, monta URL base por ambiente
    soapClient.ts        # fetch + template XML + parse (fast-xml-parser) — genérico p/ qualquer op SOAP da TM
    restClient.ts        # fetch JSON — genérico p/ qualquer consulta REST da TM
    mapper.ts             # CotacaoInput -> XML de entrada do `cotar`; resposta -> CotacaoResultado
    provider.ts           # implementa InsurerProvider, usa mapper+soapClient
```
Cada seguradora futura ganha sua própria subpasta (`_api/insurers/allianz/`, etc.) implementando o mesmo `InsurerProvider`, sem tocar no resto.

**ADR-4 — Busca de veículo (`IdVeiculo`) é uma chamada separada do usuário, não automática dentro do `cotar`.**
A doc deixa claro que o `cotar` espera `IdVeiculo` já resolvido (campo antigo `CodigoVeiculo` está descontinuado). Não existe forma de mandar "marca + modelo + ano" em texto livre direto pro cálculo. Por isso a tela de multicálculo precisa de um passo de busca (`GET /api/insurers/veiculos?anoModelo=...&descricao=...`) que chama `/modelos` da Tokio Marine e deixa o usuário escolher o veículo certo antes de cotar — igual a um autocomplete.

**ADR-5 — Formato de resposta de `/modelos` é assumido, não confirmado (ver Contexto §0).**
`restClient.ts` isola essa chamada atrás de uma função só (`buscarVeiculos(params)`), com o parsing da resposta claramente comentado como "formato assumido, confirmar com doc real ou teste em Aceite". Assim, quando a doc certa (ou o teste real contra o Aceite) confirmar o formato, o ajuste fica isolado num único arquivo, sem vazar pro resto do sistema.

**ADR-6 — Credenciais via env vars no Railway, nunca no navegador.**
```
TOKIO_MARINE_ENV=aceite-w | aceite-y | producao   # escolhe a URL base
TOKIO_MARINE_CODIGO_CORRETOR=...
TOKIO_MARINE_CODIGO_USUARIO=...
TOKIO_MARINE_CODIGO_OPERADORA=...
TOKIO_MARINE_CPF_EMISSOR=...                       # CPF emissor padrão (ver §4.3)
```
Segue exatamente o padrão de `EVOLUTION_API_URL`/`EVOLUTION_API_KEY`: getter que lança erro claro se a env var não estiver definida, nunca hardcoded, nunca exposta a uma rota que o navegador possa ler diretamente.

**ADR-7 — Rota `/api/insurers/cotar` exige `requireAuth`, igual à rota de CNPJ.**
Nenhuma chamada à Tokio Marine é feita sem usuário autenticado do CRM — mesmo padrão já estabelecido pela rota de CNPJ (`server.ts:360`), evitando repetir o débito de rotas antigas do módulo de e-mail que ficaram sem autenticação.

**ADR-8 — Cotações são persistidas numa tabela nova (`cotacoes`), vinculada ao lead, com `ON DELETE CASCADE` desde o início.**
Cada chamada bem-sucedida (ou com erro de negócio) ao `POST /api/insurers/cotar` grava uma linha, para virar histórico visível na ficha do lead depois. Diferente de `lead_pessoa_juridica` (1-para-1, chave primária é o `leadId`), aqui é 1-para-N — um lead pode ter várias cotações ao longo do tempo — então a tabela tem `id` próprio e `leadId` como FK comum, consultada pelo mecanismo genérico de coleções (`entityMap.ts` + `DataService`, mesmo padrão de `cliente_relacionamentos`).
```ts
// _api/db/schema/leads.ts (ou arquivo novo _api/db/schema/cotacoes.ts)
export const cotacoes = pgTable('cotacoes', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  leadId: text('lead_id').references(() => leads.id, { onDelete: 'cascade' }), // nulo se cotação feita sem lead vinculado
  providerId: text('provider_id').notNull(),        // 'tokio'
  numeroCalculo: text('numero_calculo'),             // nulo se a cotação falhou antes de gerar número
  status: text('status').notNull(),                  // 'ok' | 'erro'
  resultado: jsonb('resultado'),                     // snapshot do CotacaoResultadoItem completo
  erro: text('erro'),
  createdBy: text('created_by'),                     // uid do usuário que rodou a cotação
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_cotacoes_lead').on(t.leadId),
]);
```
`leadId` **já nasce com `onDelete: 'cascade'`** — essa mesma sessão encontrou dois bugs em produção (`lead_pessoa_juridica` e `campaign_log`) causados exatamente por FKs pra `leads.id` sem essa configuração, quebrando a exclusão de lead com erro 500. Não repetir o erro aqui.

## 4. Fluxo da tela `/multicalculo`

1. Usuário abre `/multicalculo`. Pode opcionalmente escolher um Lead existente (autocomplete) para pré-carregar nome/CPF/telefone/e-mail/placa/ano do veículo — ou preencher tudo do zero.
2. Campo de veículo: usuário digita a descrição (marca/modelo) ou informa código FIPE/Molicar se souber; sistema chama `GET /api/insurers/veiculos` e mostra os resultados pra escolher — resolve o `idVeiculoTokio`.
3. Formulário com os campos mínimos exigidos (ano, zero km, valor, CEP, classe bônus, tipo de seguro, assistência, vigência) — `TipoSeguro`, `TipoAssistencia` e `IsencaoFiscal` já entram como `<select>` (domínios confirmados, ver §0); os demais campos sem domínio confirmado (Franquia, Região Circulação, etc.) entram como texto livre nesta fase, viram dropdown assim que o contrato for confirmado.
4. Botão "Cotar" → `POST /api/insurers/cotar` com o `CotacaoInput` → aguarda `CotacaoResultado[]` (hoje: 1 item) → mostra card(s) com modalidade, prêmio líquido, coberturas e parcelas — usando a cor/logo de `src/lib/seguradoras.ts` pra identidade visual de cada seguradora.
5. Cada resultado (sucesso ou erro) é salvo em `cotacoes` (ADR-8), vinculado ao lead se a cotação partiu de um lead existente.
6. Botão "Ver PDF" por resultado → `GET /api/insurers/cotacao/:numeroCalculo/pdf?providerId=tokio` → abre o PDF (base64 decodificado) numa nova aba, reusando o `PDFViewer`/`UniversalDocumentViewer` que o projeto já tem.
7. Erros de negócio da Tokio Marine (tag `<Erros><Mensagem>`) aparecem como mensagem amigável no card daquele provider, sem quebrar os outros.

## 5. O que fica pendente de confirmação (não bloqueia o início da implementação)

- Formato real de resposta de `/modelos` (ADR-5) — implementar com melhor esforço, ajustar quando testar contra o Aceite de verdade ou quando a doc certa chegar.
- Contrato exato dos demais lookups REST de domínio (Franquia, Região Circulação, Coberturas Adicionais, etc.) — nesta fase, os campos que não têm domínio confirmado entram como texto livre no formulário (o usuário digita o código, se souber) em vez de `<select>`; viram dropdown assim que o contrato for confirmado.
- Código exato de `CodigoProduto` para Automóvel — nenhum dos materiais fornecidos traz o valor numérico, só o nome do lookup ("Código Produto"). Precisa confirmar testando o lookup contra o Aceite, ou perguntando ao suporte da Tokio Marine.
- Contrato de **entrada** do endpoint real "Coberturas Adicionais" — hoje só temos a **saída** dele (veio colada por engano junto da doc de "Modelos", ver acima).

## 6. Testes

- Testes unitários do `mapper.ts` (Tokio Marine): `CotacaoInput` → XML esperado (comparar contra os exemplos exatos da doc), e XML de resposta de exemplo → `CotacaoResultado` esperado. Não dependem de rede.
- Teste de integração manual contra o ambiente de Aceite (W ou Y) antes de considerar a fase pronta — não há como automatizar isso sem credenciais reais em CI.
- `soapClient.ts`/`restClient.ts` testados com mocks de `fetch`, igual ao padrão já usado em `CnpjService.test.ts`.

## 7. Plano de implementação (visão geral — detalhado no plano de execução)

1. Dependência nova (`fast-xml-parser`) + `_api/insurers/types.ts` + `registry.ts` vazio.
2. Tabela `cotacoes` (ADR-8) + `db:push` em produção + registro em `entityMap.ts`/`DataService`.
3. `tokioMarine/config.ts` + `soapClient.ts` genérico + teste unitário do parser contra os exemplos de XML da doc.
4. `tokioMarine/mapper.ts` (`cotar`) + `provider.ts` + teste unitário do mapper.
5. `tokioMarine/restClient.ts` (`/modelos`, `/cpfEmissor`) com o disclaimer do ADR-5.
6. `_api/insurers/router.ts` (`POST /cotar` — já salvando em `cotacoes`, `GET /veiculos`, `GET /cotacao/:numeroCalculo/pdf`) + registro em `server.ts`.
7. Tela `/multicalculo` (frontend): formulário + busca de veículo + card de resultado + visualizador de PDF.
8. Teste manual ponta a ponta contra o Aceite com credenciais reais do usuário.
