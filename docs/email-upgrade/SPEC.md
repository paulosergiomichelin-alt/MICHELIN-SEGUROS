# Melhoria do Módulo de E-mail — Spec de Arquitetura

> Documento de referência técnica. Os planos executáveis (tarefas passo a passo) ficam em `docs/superpowers/plans/2026-09-11-email-upgrade-*.md` e citam este arquivo.

## 0. Contexto real (confirmado por leitura de código, não suposição)

Mapeamento completo feito antes deste documento (agente de exploração, 2026-09-11):

- **Backend**: `_api/email/{accounts,action,draft,messages,search,send,settings,stats,sync}.ts` + `_api/email/auth/{gmail,microsoft}.ts` + `_api/lib/{emailSync,gmailClient,microsoftClient,emailCache,emailEncryption}.ts`. Todo o código ramifica em `provider === 'gmail' | 'microsoft'` — não há union de 3 valores em lugar nenhum, é literalmente `'gmail' | 'microsoft'` fechado no tipo TypeScript.
- **Nenhum suporte a IMAP/SMTP genérico existe hoje** — confirmado via grep (`imap`/`smtp`, case-insensitive) em todo o repositório: zero ocorrências. Nenhuma dependência `imapflow`/`nodemailer`/`node-imap`/`mailparser` no `package.json`.
- **6 pastas fixas hardcoded** em 4 lugares diferentes (`FolderNav.tsx`, `MS_FOLDER_IDS` em `action.ts`, `FOLDER_LABEL_MAP`/`FOLDER_MAP` nos clients, `folderIndex` do `emailCache.ts`): inbox/sent/drafts/trash/spam/archive. Nenhuma pasta customizada, nenhum aninhamento, labels do Gmail são colapsadas numa string única (`labelIdsToFolder()` descarta labels customizadas).
- **Nenhum motor de regras existe** — o único "filtro" é um toggle de visualização client-side (`all`/`unread`/`attachments`), não uma regra persistida que age sobre e-mail recebido.
- **Resposta automática é um stub sem efeito**: a coluna `email_settings.autoReply` (jsonb) existe no banco, a UI (`EmailSettingsPage.tsx`) tem o formulário completo (toggle/assunto/corpo) e chama `saveSettings({autoReply: {...}})`, mas `_api/email/settings.ts` **nunca lê nem persiste esse campo** na lógica de merge do PUT. Não existe nenhum processo em lugar nenhum (sync, webhook, cron) que dispare uma resposta automática de fato.
- **Cache de e-mail é 100% em memória de processo** (`_api/lib/emailCache.ts`, `Map` puro) — confirma o ADR-9 já registrado em `docs/db-migration/SPEC.md`: decisão explícita do usuário (2026-09-10) de manter WhatsApp e e-mail em memória, sem promover a tabelas Postgres, para evitar exaustão de quota (preocupação da era Firestore). **Essa decisão foi reconfirmada nesta sessão especificamente para e-mail** (2026-09-11): o conteúdo/corpo dos e-mails continua em memória — só a pasta perde tudo com reinício, não configuração.
- **Sync é polling de 5 minutos**, não push/webhook (sem Gmail Pub/Sub watch, sem Graph subscriptions).
- **Chave de criptografia de tokens tem fallback hardcoded** (`emailEncryption.ts`): se `EMAIL_ENCRYPTION_KEY` não estiver definida, usa uma string literal fixa no código — risco de segurança real, fora do escopo original mas fica registrado no risco 1 da seção 6.
- `docs/db-migration/SPEC.md` §4.10 está **desatualizado**: ainda descreve `oauth_tokens jsonb`, mas o schema real usa colunas de nível superior (`accessToken`/`refreshToken`/`tokenExpiry`). Não é bug de código, é a documentação da fase anterior que não foi atualizada — corrigir de passagem.

## 1. Escopo

**Dentro do escopo** (pedido explícito do usuário: "colocar qualquer e-mail" + "pastas, regras, resposta automática e tudo mais"; ampliado em 2026-09-11 pra paridade mais próxima do Outlook):

1. Suporte a **qualquer provedor de e-mail via IMAP/SMTP genérico** — não travado em Gmail/Outlook.
2. **Pastas reais**: customizadas, possivelmente aninhadas, substituindo as 6 fixas hardcoded.
3. **Motor de regras/filtros**: condições sobre e-mail recebido → ações automáticas.
4. **Resposta automática funcional** (terminar o que já existe pela metade).
5. **Agendamento de envio**.
6. **Threading de conversa** (agrupar mensagens por assunto/thread).
7. Correção de bugs reais encontrados na revisão de 2026-09-11, já corrigidos nesta sessão (ver seção 5.1, "já corrigido"): responder a todos não incluía os destinatários originais do campo "Para"; anexos nunca eram enviados de fato (nem no composer, nem no builder MIME do Gmail, nem no payload do Graph); imagens embutidas (`cid:`) sempre viravam um gif transparente em branco, nunca resolviam pro dado real.
8. **Categorias/etiquetas coloridas**, múltiplas por mensagem, cor + nome livre (estilo Gmail labels).
9. **Delegação de acesso** entre contas pessoais (um usuário concede acesso à própria caixa a outro usuário, com nível de permissão) — não é caixa compartilhada institucional.
10. **Integração de calendário**: Google Calendar e Microsoft/Outlook Calendar para contas OAuth, calendário interno (Postgres, sem sincronização externa) para contas IMAP e eventos manuais; convites de reunião (`.ics`) ganham ações Aceitar/Recusar/Talvez na leitura do e-mail.
11. **Notificação push mobile via Web Push/PWA** — o app ganha service worker + manifest; não existe app nativo hoje e não é criado nesta fase.
12. **Modo "foco"**: separação heurística (sem ML) de e-mail importante vs. newsletter/promoção, com correção manual persistida por remetente.
13. **Sync quase em tempo real**: Gmail (`users.watch`/Pub/Sub) e Microsoft (Graph subscriptions) via webhook, funcionando em qualquer modo de deploy; IMAP IDLE (conexão persistente) só no modo VPS (`server.ts`) — no modo serverless (`server.vercel.ts`), contas IMAP usam polling rápido (30–60s) em vez de IDLE.

**Fora do escopo** (por decisão explícita do usuário):

- **Conteúdo/corpo dos e-mails continua em memória** (`emailCache.ts`), não migra para Postgres. Only *configuração* (contas, pastas, regras, categorias, delegações, eventos de calendário, inscrições push, overrides de foco) é persistida — ver ADR-7.
- Caixa compartilhada **institucional** (múltiplos usuários numa conta corporativa tipo `contato@empresa.com` com papéis) — o que entrou no escopo foi delegação pessoal (item 9), não isso.
- App mobile nativo — o item 11 cobre só web push via PWA.
- Anexos em rascunhos (`_api/email/draft.ts`) — tem a mesma lacuna de anexos que o envio tinha, mas não foi pedido; registrado como item de paridade futura na seção 8.

## 2. Decisões de arquitetura (ADR)

| # | Decisão | Motivo |
|---|---|---|
| ADR-1 | Cliente IMAP via **`imapflow`**, cliente SMTP via **`nodemailer`** (ambos npm, bem mantidos, TypeScript-friendly). Novos arquivos `_api/lib/imapClient.ts` + `_api/lib/smtpClient.ts`. | Padrão de mercado pra Node.js; `imapflow` tem suporte nativo a IDLE (near-realtime) que pode substituir parte do polling no futuro, mas nesta fase só cobrimos paridade funcional com fetch periódico, igual ao Gmail/Microsoft hoje. |
| ADR-2 | `imapClient.ts`/`smtpClient.ts` espelham a **assinatura pública** de `gmailClient.ts`/`microsoftClient.ts` (`listMessages`, `getMessage`, `sendMessage`, `createDraft`, `updateDraft`, `deleteDraft`, `modifyMessage`/ações de flag, `getAttachment`). | Todo o código consumidor (`emailSync.ts`, `messages.ts`, `search.ts`, `send.ts`, `draft.ts`, `action.ts`) já ramifica por provider — adicionar um 3º branch (`if (provider === 'imap')`) é mudança cirúrgica se a interface bater, em vez de reescrever cada rota. |
| ADR-3 | `EmailAccount.provider` (TS) e a coluna `email_accounts.provider` deixam de ser união fechada de 2 valores e passam a aceitar `'gmail' \| 'microsoft' \| 'imap'`. Contas IMAP guardam config de conexão em colunas novas (`imapHost`, `imapPort`, `imapSecure`, `smtpHost`, `smtpPort`, `smtpSecure`, `username`) + senha criptografada reaproveitando `emailEncryption.ts` (`accessToken` reaproveitado como campo genérico de "credencial criptografada" em vez de token OAuth — ver seção 4). `accessToken`/`refreshToken`/`tokenExpiry` passam a ser nullable (contas IMAP não têm OAuth). | Contas IMAP autenticam com usuário/senha (ou senha de app), não OAuth — precisam de um formulário "configuração avançada" (host/porta/TLS), como o Outlook desktop tem pra contas não-Microsoft. |
| ADR-4 | Pastas passam a ser uma entidade real e persistida: nova tabela **`email_folders`** (`id, accountId, name, parentFolderId nullable, type: 'system'\|'custom', providerFolderId nullable`). Pastas de sistema (inbox/sent/drafts/trash/spam/archive) são auto-criadas na primeira sincronização de cada conta, espelhando a estrutura real do provedor quando possível (Gmail: labels reais, não só as 6 fixas; Microsoft: `mailFolders` reais via Graph; IMAP: árvore real via `LIST`). Pastas customizadas: criar/renomear/apagar é uma operação por provedor (Gmail → cria label; Microsoft → `POST /me/mailFolders`; IMAP → comando `CREATE`), mas o modelo de dados e a UI são unificados. | É impossível ter pastas customizadas de verdade com o esquema hardcoded de 6 pastas atual — essa é a mudança estrutural que desbloqueia tudo o resto (inclusive regras, que precisam de "mover para pasta X" como ação). |
| ADR-5 | Motor de regras roda **do lado da aplicação** (não depende de filtros nativos do Gmail/Outlook), nova tabela **`email_rules`** (`id, userId, accountId nullable (null = todas as contas do usuário), name, conditions jsonb, matchType: 'all'\|'any', actions jsonb, enabled, order`). Avaliado a cada sincronização (`emailSync.ts`), depois de importar mensagens novas: para cada mensagem nova, roda as regras habilitadas em ordem e aplica as ações que baterem. | Regras nativas de cada provedor (Gmail filters API, Outlook inbox rules via Graph) não existem pra IMAP genérico — um motor próprio dá comportamento uniforme pros 3 provedores, e reaproveita a mesma pipeline de sync que já existe. |
| ADR-6 | Resposta automática: corrigir `_api/email/settings.ts` pra persistir `autoReply` de verdade, e implementar o disparo real dentro do loop de sync — depois de importar mensagens novas do INBOX, se `autoReply.enabled`, responde automaticamente (usando o caminho de envio do próprio provedor da conta) pra remetentes que ainda não receberam resposta dentro de uma janela de cooldown (evita loop infinito/spam). Dedup de cooldown fica em memória (`Map` simples, mesmo padrão do `emailCache.ts`), não em Postgres — consistente com ADR-7. | A UI e a coluna já existem; falta só a metade que faz a coisa funcionar. Cooldown em memória é aceitável (pior caso: um reinício do servidor dentro da janela de cooldown pode causar uma resposta automática duplicada — risco baixo, mesmo tipo de trade-off já aceito pro cache de e-mail inteiro). |
| ADR-7 | **Conteúdo dos e-mails continua em memória** (`emailCache.ts`, inalterado). Só *configuração* — contas (`email_accounts`, já era Postgres), pastas (`email_folders`), regras (`email_rules`), categorias (`email_categories`/`email_message_categories`), delegações (`email_account_delegates`), eventos de calendário (`calendar_events`), inscrições push (`push_subscriptions`) e overrides de foco (`email_focus_overrides`) — é persistida no Postgres. | Decisão explícita do usuário (2026-09-11): manter conteúdo de e-mail em memória, só adicionar estrutura/configuração por cima. Pasta, regra, categoria, delegação, evento e override são *configuração do usuário*, não conteúdo de e-mail — perder isso a cada reinício do servidor seria uma regressão de UX inaceitável (equivalente a perder as configurações de conta hoje, que ninguém aceitaria). A linha divisória é: conteúdo/corpo/anexo de e-mail = efêmero (já é assim hoje); estrutura/config que o usuário criou = durável (já é assim hoje pra contas e settings). |
| ADR-8 | `imapClient.ts` usa **conexão sob demanda** (abre, faz a operação, fecha) em vez de manter uma conexão IMAP persistente por conta, na Fase 1 (paridade funcional com polling, igual Gmail/Microsoft hoje). A conexão persistente com IDLE só entra na Fase 7 (ADR-16), e mesmo assim só no modo VPS. | Simplicidade > desempenho na primeira versão; entregar IMAP com paridade de polling primeiro, depois evoluir pra IDLE numa fase separada, isola o risco de cada mudança. |
| ADR-9 | **Agendamento de envio**: nova tabela `email_scheduled_sends` (`id, accountId, userId, payload jsonb` — o mesmo shape de `SendEmailBody`, `sendAt timestamptz, status: 'pending'\|'sent'\|'failed'\|'cancelled', error`). Um job recorrente (reaproveita o mesmo `setInterval` já usado pelo `scheduleEmailSync`, ou um segundo timer próprio de 1 min) varre `pending` com `sendAt <= now()` e chama a mesma lógica de `_api/email/send.ts` (extraída pra uma função reaproveitável, não duplicada). Cancelável enquanto `status='pending'`. | Precisa ser Postgres (não em memória) — perder um e-mail agendado num reinício do servidor é inaceitável, diferente do trade-off aceito pro cache de conteúdo (ADR-7). É configuração/intenção do usuário, não conteúdo de caixa de entrada. |
| ADR-10 | **Threading de conversa**: agrupamento feito **no cliente/frontend**, não no backend — usa o `threadId` que os 3 provedores já fornecem (Gmail: `threadId` nativo; Microsoft: `conversationId`; IMAP: sem equivalente nativo confiável, agrupar por `References`/`In-Reply-To` header + assunto normalizado como fallback). `EmailList.tsx` agrupa mensagens com o mesmo `threadId` numa única linha expansível (como Gmail), mantendo a lista de mensagens individuais como já existe hoje por baixo. | Threading é fundamentalmente uma questão de apresentação sobre dados que já existem (`threadId` já é capturado em `parseGmailMessage`/`parseMicrosoftMessage` hoje, só não é usado pra agrupar) — não precisa de mudança de schema nem de sync, só de UI. |
| ADR-11 | **Categorias/etiquetas coloridas**: definição (nome + cor, por usuário) é configuração → tabela nova `email_categories`. Aplicação na mensagem usa o mecanismo nativo do provedor quando existe: Gmail → label real (cor via API de labels, reaproveitando a pipeline de labels do ADR-4 com uma flag `type: 'folder'\|'category'` pra não confundir os dois usos); Microsoft → campo `categories` nativo do Graph (paleta de cores fixa do Outlook); IMAP → sem equivalente nativo, associação persistida em `email_message_categories` (`accountId, messageId, categoryId`). Múltiplas categorias por mensagem. | Usar o recurso nativo onde ele existe evita reinventar o que Gmail/Outlook já fazem, e mantém a categoria visível mesmo se o usuário abrir o Gmail/Outlook direto fora do nosso sistema; IMAP precisa de tabela própria por não ter conceito nativo de categoria multi-valor com cor. |
| ADR-12 | **Delegação de acesso**: nova tabela `email_account_delegates` (`accountId, delegateUserId, permission: 'read'\|'send'\|'full', createdAt`). Dono da conta concede acesso a outro usuário do sistema; o delegado passa a ver essa conta no seletor de contas dele, com ações limitadas pela permissão (`read` = só visualizar; `send` = também enviar/responder; `full` = também gerenciar pastas/regras/categorias da conta). Envio como delegado usa o mesmo caminho de envio do dono (From = endereço do dono) — é delegação **a nível de aplicação**, não a delegação nativa do Gmail/Exchange. | Delegação nativa do Gmail exige configuração dentro do próprio Gmail e a do Microsoft exige permissão de mailbox a nível de Exchange/tenant — ambas fora do nosso controle e possivelmente fora do acesso administrativo do usuário. Implementar a nível de aplicação dá o mesmo resultado prático sem essa dependência externa. |
| ADR-13 | **Calendário**: nova tabela `calendar_events` (`id, userId, accountId nullable, provider: 'google'\|'microsoft'\|'internal', providerEventId nullable, title, description, location, startAt, endAt, allDay, attendees jsonb, recurrenceRule nullable, status, createdAt, updatedAt`). Contas Gmail/Microsoft sincronizam de verdade com Google Calendar API / Graph `/me/calendar` — exige adicionar escopo de calendário ao OAuth (`calendar` no Google, `Calendars.ReadWrite` no Graph) e **reautorizar contas já conectadas**, já que o token atual não tem esse escopo. Contas IMAP e eventos criados manualmente usam só o Postgres (`provider: 'internal'`), sem sync externo. Convites (`.ics`/`text/calendar` no corpo do e-mail) são parseados na leitura da mensagem e viram um evento pendente com ações Aceitar/Recusar/Talvez. | É o item mais próximo de um domínio novo dentro do módulo de e-mail, mas reaproveitar o OAuth já existente (com escopo adicional) é mais simples que uma segunda pipeline de autenticação; calendário interno cobre contas IMAP, que nunca teriam paridade real de calendário nativo de qualquer forma. |
| ADR-14 | **Push mobile**: adiciona `public/manifest.json` + service worker ao app web (não existe hoje). Nova tabela `push_subscriptions` (`id, userId, endpoint, keysP256dh, keysAuth, createdAt`). Backend usa VAPID (pacote `web-push`) pra empurrar notificação quando o sync detecta mensagem nova na Inbox de uma conta do usuário. | Não existe app mobile nativo no projeto (confirmado por grep — zero React Native/Capacitor/service worker). Web Push via PWA dá notificação no celular sem publicar app em loja, ao custo de exigir que o usuário "instale" o site na tela inicial (limitação do iOS Safari, ver risco 9). |
| ADR-15 | **Modo foco**: pontuação calculada no próprio ciclo de sync, no mesmo ponto onde regras/autoreply já rodam — sinais: já houve resposta anterior pro remetente (cruza com Enviados), remetente está nos contatos/CRM do sistema, presença do header `List-Unsubscribe`, palavras de marketing no assunto. Resultado (`focused`\|`other`) fica em memória junto da mensagem, recalculado a cada sync — sem schema novo (ADR-7). Correção manual do usuário ("sempre focado pra esse remetente") persiste em tabela pequena `email_focus_overrides` (`userId, senderEmail, classification, createdAt`), porque isso é configuração do usuário, não conteúdo de e-mail. | Heurística por regras é previsível, explicável e sem custo de API/latência de modelo de IA — adequado pro volume de e-mail de um sistema interno, sem justificar a complexidade extra de ML. |
| ADR-16 | **Sync quase em tempo real**: Gmail via `users.watch` (Cloud Pub/Sub, renovação a cada 7 dias) e Microsoft via Graph subscriptions (renovação antes de ~3 dias) — ambos são só um endpoint HTTPS recebendo POST, funcionam igual em `server.ts` (VPS) ou `server.vercel.ts` (Vercel Functions). IMAP via `imapflow` IDLE **exige conexão persistente por conta**, incompatível com function serverless de vida curta — IDLE só é ativado quando o processo roda em modo VPS (`server.ts`); no modo Vercel, contas IMAP continuam em polling, só que mais rápido (30–60s em vez de 5 min). | Webhook nativo do Gmail/Microsoft é a forma correta de near-realtime e não tem restrição de infraestrutura; IMAP IDLE é o único dos três que teria regressão real se forçado em serverless (a conexão cairia a cada invocação) — a restrição precisa ficar explícita em vez de fingir paridade total entre os 3 provedores nesse ponto. |
| ADR-17 | **Revisão da Fase 2 (2026-09-13)**: a árvore de pastas **não ganha a tabela `email_folders` da ADR-4 nesta etapa** — continua sendo buscada ao vivo do provedor a cada troca de conta (`GET /api/email/folders`, já implementado: `listLabels` no Gmail, `listFolders` no Microsoft, `listFoldersTree` no IMAP), sem persistência no Postgres. Sobre essa base, ganham operações novas, todas batendo direto no provedor: criar/renomear/excluir pasta (Gmail → `POST`/`PATCH`/`DELETE /users/me/labels`; Microsoft → `POST`/`PATCH`/`DELETE /me/mailFolders`; IMAP → `CREATE`/`RENAME`/`DELETE`), mover mensagem pra pasta arbitrária (nova ação `move` em `_api/email/action.ts`, com `targetFolderId` — Microsoft e IMAP já tinham `moveMessage(id/uid, destino)` genérico; Gmail ganha um helper que troca o label de pasta via `modifyMessage`), "não é lixo eletrônico" (ação `notjunk`, mesma mecânica de `restore` hoje, com rótulo próprio na UI), esvaziar pasta e marcar pasta inteira como lida (loop paginado sobre `listMessages` aplicando a ação por mensagem nos 3 provedores; IMAP usa `STORE`/`EXPUNGE` em lote quando possível, mais eficiente que loop por UID), e drag-and-drop na UI (cada linha de `EmailList` vira `draggable`, cada pasta em `FolderNav` vira drop target, chamando a ação `move`). | Implementar a tabela persistida da ADR-4 agora adicionaria uma camada inteira de sincronização/reconciliação (Postgres ↔ provedor) sem nenhum consumidor que precise de ID de pasta estável — a Fase 3 (regras com ação "mover pra pasta X") é o primeiro caso de uso real pra isso, e só nesse ponto vale decidir se a tabela é necessária ou se referenciar o ID do provedor direto nas regras já resolve. YAGNI: entregar o que foi pedido (CRUD de pasta, mover, esvaziar, marcar lida, drag-and-drop, não é lixo eletrônico) sem essa complexidade extra agora. O backend roda hoje em processo contínuo (Railway, `server.ts`), não em função serverless — por isso o loop de esvaziar/marcar-lida pode processar uma pasta inteira numa única requisição, sem risco de timeout tipo Vercel Function. |

## 3. Modelo de dados (Postgres/Drizzle)

### 3.1 `email_accounts` — alterações

```ts
// _api/db/schema/campaigns-email.ts — emailAccounts, campos alterados/adicionados
accessToken: text('access_token'),        // era .notNull() — agora nullable (IMAP não usa OAuth)
refreshToken: text('refresh_token'),      // era .notNull() — agora nullable
// tokenExpiry já era nullable, sem mudança

// Novas colunas (todas nullable — só preenchidas para provider === 'imap'):
imapHost: text('imap_host'),
imapPort: integer('imap_port'),
imapSecure: boolean('imap_secure').notNull().default(true),
smtpHost: text('smtp_host'),
smtpPort: integer('smtp_port'),
smtpSecure: boolean('smtp_secure').notNull().default(true),
username: text('username'),               // login IMAP/SMTP, pode diferir do campo `email`
passwordEncrypted: text('password_encrypted'), // criptografado via emailEncryption.ts, mesmo padrão de accessToken hoje
```

### 3.2 `email_folders` — nova tabela

```ts
export const emailFolders = pgTable('email_folders', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => emailAccounts.id),
  organizationId: text('organization_id').references(() => organizations.id),
  name: text('name').notNull(),
  parentFolderId: text('parent_folder_id'), // auto-referência, sem FK formal (evita ciclo de criação)
  type: text('type').notNull(), // 'system' | 'custom'
  systemKind: text('system_kind'), // 'inbox'|'sent'|'drafts'|'trash'|'spam'|'archive' — só quando type='system'
  providerFolderId: text('provider_folder_id'), // label id (Gmail) | folder id (Graph) | mailbox path (IMAP)
  unreadCount: integer('unread_count').notNull().default(0), // cache leve, atualizado no sync
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_email_folders_account').on(t.accountId),
]);
```

### 3.3 `email_rules` — nova tabela

```ts
export const emailRules = pgTable('email_rules', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').references(() => organizations.id),
  accountId: text('account_id').references(() => emailAccounts.id), // null = aplica a todas as contas do usuário
  name: text('name').notNull(),
  conditions: jsonb('conditions').notNull(), // [{ field: 'from'|'to'|'subject'|'body', op: 'contains'|'equals'|'startsWith', value: string }]
  matchType: text('match_type').notNull().default('all'), // 'all' | 'any'
  actions: jsonb('actions').notNull(), // [{ type: 'move'|'markRead'|'star'|'forward'|'delete', folderId?: string, forwardTo?: string }]
  enabled: boolean('enabled').notNull().default(true),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_email_rules_user').on(t.userId),
]);
```

### 3.4 `email_settings.autoReply` — sem mudança de schema, só de comportamento

A coluna já existe (`autoReply jsonb`). Mudança é 100% em `_api/email/settings.ts` (persistir o campo) e `_api/lib/emailSync.ts` (executar de fato).

### 3.5 `email_scheduled_sends` — nova tabela

```ts
export const emailScheduledSends = pgTable('email_scheduled_sends', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => emailAccounts.id),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').references(() => organizations.id),
  payload: jsonb('payload').notNull(), // shape de SendEmailBody (to/cc/bcc/subject/bodyHtml/attachments)
  sendAt: timestamp('send_at', { withTimezone: true, mode: 'string' }).notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'sent' | 'failed' | 'cancelled'
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_email_scheduled_pending').on(t.status, t.sendAt),
]);
```

### 3.6 `email_categories` — nova tabela

```ts
export const emailCategories = pgTable('email_categories', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').references(() => organizations.id),
  name: text('name').notNull(),
  color: text('color').notNull(), // hex, ou nome da paleta fixa do Outlook quando accountId aponta pra conta microsoft
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const emailMessageCategories = pgTable('email_message_categories', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => emailAccounts.id), // só populado pra provider='imap'; gmail/microsoft usam o mecanismo nativo do provedor
  messageId: text('message_id').notNull(), // id da mensagem no provedor, não FK (conteúdo é efêmero — ADR-7)
  categoryId: text('category_id').notNull().references(() => emailCategories.id),
}, (t) => [
  index('idx_email_msg_categories_msg').on(t.accountId, t.messageId),
]);
```

### 3.7 `email_account_delegates` — nova tabela

```ts
export const emailAccountDelegates = pgTable('email_account_delegates', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => emailAccounts.id),
  delegateUserId: text('delegate_user_id').notNull(),
  permission: text('permission').notNull(), // 'read' | 'send' | 'full'
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_email_delegates_account').on(t.accountId),
  index('idx_email_delegates_user').on(t.delegateUserId),
]);
```

### 3.8 `calendar_events` — nova tabela

```ts
export const calendarEvents = pgTable('calendar_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').references(() => organizations.id),
  accountId: text('account_id').references(() => emailAccounts.id), // null quando provider='internal' e não veio de uma conta específica
  provider: text('provider').notNull(), // 'google' | 'microsoft' | 'internal'
  providerEventId: text('provider_event_id'), // null quando provider='internal'
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  startAt: timestamp('start_at', { withTimezone: true, mode: 'string' }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true, mode: 'string' }).notNull(),
  allDay: boolean('all_day').notNull().default(false),
  attendees: jsonb('attendees'), // [{ email, name, responseStatus: 'needsAction'|'accepted'|'declined'|'tentative' }]
  recurrenceRule: text('recurrence_rule'), // RRULE, nullable
  status: text('status').notNull().default('confirmed'), // 'confirmed' | 'cancelled'
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_calendar_events_user').on(t.userId, t.startAt),
]);
```

### 3.9 `push_subscriptions` — nova tabela

```ts
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  keysP256dh: text('keys_p256dh').notNull(),
  keysAuth: text('keys_auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_push_subs_user').on(t.userId),
]);
```

### 3.10 `email_focus_overrides` — nova tabela

```ts
export const emailFocusOverrides = pgTable('email_focus_overrides', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  senderEmail: text('sender_email').notNull(),
  classification: text('classification').notNull(), // 'focused' | 'other'
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_email_focus_overrides_user').on(t.userId, t.senderEmail),
]);
```

## 4. Fluxo de nova conta IMAP (visão de UX)

Espelha o "Configuração avançada" do Outlook desktop:

1. Usuário clica "Adicionar conta" → escolhe "Gmail" / "Outlook" (fluxos OAuth existentes, inalterados) / **"Outro (IMAP)"** (novo).
2. Formulário: e-mail, senha (ou senha de app — texto de ajuda explicando que provedores como Gmail/Yahoo exigem senha de app quando 2FA está ativo), com opção de digitar host/porta manualmente, e um botão "Detecção automática" (tenta portas/hosts comuns baseados no domínio do e-mail — `imap.<dominio>`, `smtp.<dominio>`, portas 993/587 — como Thunderbird faz, best-effort, sempre permitindo edição manual).
3. Backend testa a conexão (login IMAP + login SMTP) antes de salvar — erro claro se falhar, nunca salva uma conta que não conecta.
4. Salva em `email_accounts` (provider='imap'), dispara sync inicial igual às contas OAuth.

## 5. Motor de regras (visão de UX)

Tela nova (`EmailRulesPage.tsx` ou aba dentro de `EmailSettingsPage.tsx`): lista de regras (nome, condição resumida, ação resumida, toggle habilitado/desabilitado, arrastar para reordenar), botão "Nova regra" abre um formulário: condições (campo + operador + valor, múltiplas com E/OU), ações (mover para pasta / marcar como lida / destacar / encaminhar para / apagar).

## 5.1 Bugs reais já corrigidos (2026-09-11, antes de qualquer tarefa de IMAP/pastas/regras)

Encontrados investigando os relatos do usuário ("responder a todos", "anexos que estava faltando", "imagens não estava abrindo direito") — corrigidos diretamente nesta sessão, fora da sequência de fases (são bugs do sistema atual, não features novas):

- **Responder a todos** (`EmailComposer.tsx`): só incluía o remetente original + CC — nunca incluía os outros destinatários do campo "Para" original. Corrigido pra unir `from` + `to` + `cc` (menos o próprio usuário), sem duplicados.
- **Anexos no envio**: três bugs em cadeia. (1) `EmailComposer.tsx` anexava arquivos na UI mas `handleSend` nunca os incluía na chamada de envio. (2) `EmailService.sendEmail()` tinha assinatura de tipo incompatível com o que o backend espera (`attachments?: string[]` em vez de `{filename,mimeType,data}[]`); `sendEmailWithFiles()` existia mas nunca era chamada por ninguém (código morto) e usava `multipart/form-data`, formato que o backend nunca soube processar. (3) mesmo se os dados chegassem certos, `buildMimeMessage()` (Gmail) e `buildMicrosoftPayload()` (Microsoft) nunca incluíam os anexos no MIME/payload — só marcavam `hasAttachments: true` no cache, cosmético. Corrigido: composer converte `File[]` pra base64 e envia no mesmo JSON; builder do Gmail agora monta `multipart/mixed` com uma parte por anexo; payload do Graph agora inclui `attachments: [{'@odata.type': 'fileAttachment', contentBytes, ...}]`.
- **Imagens embutidas (`cid:`) sempre em branco**: `htmlSanitize.ts` trocava toda `src="cid:..."` por um gif transparente, sem nunca resolver pro dado real — o parser MIME do Gmail (`gmailClient.ts`) nunca capturava o header `Content-ID` de cada parte, e o parser do Graph (`microsoftClient.ts`) descartava `contentId`/`contentBytes` que a própria API já retorna. Corrigido: ambos os parsers agora resolvem `cid:X` pro `data:mimetype;base64,...` real antes de cachear a mensagem — o fallback pro gif transparente no sanitizador continua existindo, mas só age nos casos raros (imagem embutida grande, sem os bytes disponíveis na mesma resposta) que não são resolvidos nesta etapa.

Anexos em **rascunhos** (`_api/email/draft.ts`) têm a mesma lacuna estrutural (nunca foram implementados), mas isso não foi reportado como quebrado — registrado como item de paridade futura na seção 8, não corrigido nesta sessão.

## 5.2 Ações de pasta e mensagem (complemento à Fase 2 — ADR-17)

Pedido do usuário em 2026-09-13: criar/renomear/excluir pasta, mover e-mail entre pastas (inclusive por drag-and-drop), esvaziar pasta, marcar todos os itens de uma pasta como lidos, marcar mensagem individual como lida/não lida, e marcar mensagem como "não é lixo eletrônico".

**API (`_api/email/folders.ts` e `_api/email/action.ts`)**

| Endpoint | Body | Efeito |
|---|---|---|
| `POST /api/email/folders` | `{accountId, name, parentId?}` | Cria pasta customizada (Gmail: label; Microsoft: `mailFolders`; IMAP: `CREATE`) |
| `PATCH /api/email/folders/:id` | `{accountId, name}` | Renomeia — só permitido em pastas `type: 'custom'` (pastas de sistema não podem ser renomeadas) |
| `DELETE /api/email/folders/:id` | `{accountId}` (query) | Exclui — só em pastas customizadas |
| `POST /api/email/folders/:id/empty` | `{accountId}` | Esvazia (regra abaixo) |
| `POST /api/email/folders/:id/read-all` | `{accountId}` | Marca todas as mensagens da pasta como lidas |
| `POST /api/email/action` (existente) | `{accountId, messageId, action: 'move', targetFolderId}` | Move mensagem pra qualquer pasta (fixa ou customizada) |
| `POST /api/email/action` (existente) | `{accountId, messageId, action: 'notjunk'}` | "Não é lixo eletrônico" — mesma mecânica de `restore` (move pra Inbox), rótulo próprio na UI, só oferecido dentro da pasta Spam |

**Regra de esvaziar pasta** (confirmada com o usuário): esvaziar a Lixeira ou o Spam **exclui definitivamente** as mensagens (com confirmação na UI antes de executar); esvaziar qualquer outra pasta **move** todas as mensagens pra Lixeira.

**Restrições de pasta de sistema**: Inbox/Enviados/Rascunhos/Lixeira/Spam/Arquivados podem ser esvaziadas e ter "marcar tudo como lido", mas não podem ser renomeadas nem excluídas — mesma regra do Outlook/Gmail/outlook.com.

**Frontend**

- `FolderNav.tsx`: menu de contexto (clique direito) por pasta — "Nova subpasta" (sempre disponível), "Renomear"/"Excluir" (só pastas customizadas), "Esvaziar pasta"/"Marcar tudo como lido" (todas as pastas).
- `EmailListItem.tsx`: alterna lido/não lido por item (ícone ao passar o mouse, sem precisar abrir a mensagem — hoje só existe via seleção + botão do ribbon); menu de contexto ganha "Mover para..." (submenu com a árvore de pastas) e, só dentro da pasta Spam, "Não é lixo eletrônico".
- Drag-and-drop: cada linha de `EmailList` fica `draggable`; cada pasta em `FolderNav` é um drop target (`onDragOver`/`onDrop`) que dispara a ação `move` pro id da pasta; feedback visual (destaque da pasta) enquanto o item é arrastado por cima.

## 6. Registro de riscos

| # | Risco | Mitigação |
|---|---|---|
| 1 | `emailEncryption.ts` tem uma chave de fallback hardcoded no código se `EMAIL_ENCRYPTION_KEY` não estiver definida — achado de segurança de passagem, não é objeto deste projeto. | Registrado aqui pra visibilidade; recomendação de corrigir separadamente (falhar explicitamente em vez de usar fallback, igual ao padrão já adotado em `scripts/deploy-vps.mjs`). |
| 2 | Detecção automática de host/porta IMAP/SMTP por domínio é heurística (nem todo provedor segue o padrão `imap.dominio.com`) — pode falhar silenciosamente pra provedores menos comuns. | Sempre permitir edição manual dos campos; testar a conexão antes de salvar (seção 4, passo 3) garante que nunca se salva uma config que não funciona, mesmo que a detecção automática erre. |
| 3 | Rodar o motor de regras a cada sync (5 min, todas as contas) pode ficar lento se o usuário tiver muitas regras ou muitas mensagens novas por ciclo. | Regras são avaliadas só sobre mensagens *novas* daquele ciclo de sync (não reprocessa a caixa toda), e a lista de regras por conta normalmente é pequena (dezenas, não milhares) — sem otimização especial nesta fase; registrar como ponto de atenção se o uso real mostrar lentidão. |
| 4 | Resposta automática com dedup em memória: um reinício do servidor dentro da janela de cooldown pode enviar uma resposta duplicada pro mesmo remetente. | Aceito conscientemente (ADR-6) — mesmo trade-off já aceito pro cache de e-mail inteiro (ADR-9 do projeto de migração de banco). Cooldown sugerido de 24h torna a janela de risco pequena na prática. |
| 5 | Widening de `provider` (união de 2 → 3 valores) toca em bastante código existente (`EmailService.ts`, `email.types.ts`, todo `_api/email/**`) — risco de regressão nos caminhos Gmail/Microsoft já funcionando. | Cada fase de execução testa explicitamente que Gmail/Microsoft continuam funcionando sem alteração de comportamento antes de considerar a fase concluída (mesmo padrão de verificação usado no projeto de migração de banco). |
| 6 | Calendário exige reautorizar contas OAuth já conectadas pra adicionar escopo de calendário — usuário existente vai ver uma tela de consentimento de novo, pode causar confusão ("por que preciso logar de novo?"). | Copy explicativo na UI antes de redirecionar pro consentimento; reautorização é por conta, acontece uma vez só, e é opcional — quem não reautorizar mantém e-mail funcionando normalmente, só não ganha calendário sincronizado. |
| 7 | Delegação de acesso é só a nível de aplicação, não a nível do provedor — se o delegado acessar o Gmail/Outlook diretamente fora do nosso sistema, não tem acesso nenhum, só dentro do nosso app. | Documentar isso claramente na UI de "conceder acesso" pra não criar expectativa errada no usuário (ver ADR-12). |
| 8 | IMAP IDLE só funciona no modo VPS (`server.ts`) — se o ambiente de produção migrar pra Vercel serverless (`server.vercel.ts`) no futuro, a funcionalidade de near-realtime pra contas IMAP regride silenciosamente pra polling rápido. | Dependência de modo de deploy documentada explicitamente aqui (ADR-16) e um log de aviso no backend quando IDLE não pode ser ativado no ambiente atual. |
| 9 | Web Push no iOS Safari só funciona se o usuário "instalar" o site na tela inicial — notificação nunca chega pro usuário que só usa o site pelo navegador normal, sem aviso. | Prompt de UX explicando o passo de instalação quando o usuário habilitar notificações num dispositivo iOS (ver ADR-14). |
| 10 | Categorias aplicadas via Gmail label reaproveitam a mesma pipeline de pastas (ADR-4) — risco de um label ser tratado como pasta e categoria ao mesmo tempo se a distinção não for feita corretamente. | Flag explícita (`type: 'folder'\|'category'`) decidida na primeira sincronização de cada label, editável pelo usuário se a heurística inicial errar (ver ADR-11). |
| 11 | Esvaziar/marcar-tudo-como-lido (ADR-17) processa mensagem por mensagem em loop, sem tabela local com IDs — uma pasta muito grande (milhares de mensagens) gera muitas chamadas sequenciais ao provedor, sujeitas a rate limit (Gmail/Graph) mesmo sem timeout de execução. | IMAP usa operação nativa em lote (`STORE`/`EXPUNGE`) em vez de loop por UID. Gmail/Microsoft ficam sujeitos ao rate limit normal da API (mesmo já aceito hoje no sync); se isso se mostrar um problema real de uso, é o gatilho concreto pra revisitar a persistência da ADR-4 com paginação/retry, não uma otimização especulativa agora. |

## 7. Fases de execução

Ordem definida por dependência técnica e risco, não por prioridade de negócio — cada fase parte de uma base estável deixada pela anterior. Cada fase vira um plano executável próprio em `docs/superpowers/plans/2026-09-11-email-upgrade-NN-*.md`.

- **Fase 0 — já concluída**: os 3 bugs corrigidos nesta sessão (responder a todos, anexos no envio, imagens `cid:` — seção 5.1). Base estável antes de qualquer mudança estrutural.
- **Fase 1 — Fundação multi-provedor**: IMAP/SMTP genérico (ADR-1, ADR-2, ADR-3) + correção do fallback hardcoded de `EMAIL_ENCRYPTION_KEY` (risco 1). Tudo que vem depois precisa funcionar nos 3 provedores — fazer essa base primeiro evita retrabalho.
- **Fase 2 — Pastas reais** (ADR-4, revisada pela ADR-17): substitui as 6 pastas fixas por descoberta ao vivo do provedor (sem tabela `email_folders` nesta etapa — ver ADR-17) e adiciona CRUD de pasta, mover mensagem, esvaziar, marcar pasta como lida, marcar mensagem lida/não lida por item e drag-and-drop (seção 5.2). Pré-requisito direto da Fase 3 (regra "mover pra pasta X") e da Fase 4 (distinguir label-pasta de label-categoria no Gmail).
- **Fase 3 — Regras + resposta automática + modo foco** (ADR-5, ADR-6, ADR-15): as três rodam no mesmo ponto do pipeline de sync (depois de importar mensagens novas) — implementar juntas evita reabrir o mesmo trecho de `emailSync.ts` três vezes.
- **Fase 4 — Categorias/etiquetas coloridas** (ADR-11): depende da Fase 2 pra não confundir label-pasta com label-categoria no Gmail.
- **Fase 5 — Agendamento de envio + threading de conversa** (ADR-9, ADR-10): baixo risco, independentes entre si e do resto — bom intervalo pra entregar valor visível rápido entre fases mais pesadas.
- **Fase 6 — Delegação de acesso** (ADR-12): mexe em autorização; melhor com contas/permissões já estáveis das fases anteriores.
- **Fase 7 — Sync quase em tempo real** (ADR-16): troca o gatilho de sync de polling pra webhook/IDLE. Fazer por último entre as mudanças de pipeline garante que regras/autoreply/foco/categorias (Fases 3-4) já foram validadas rodando sobre polling normal antes de mudar o que dispara o próprio sync — mais fácil isolar bug se algo quebrar.
- **Fase 8 — Calendário** (ADR-13): a maior e mais isolada das fases — domínio novo, exige reautorização OAuth, tela nova inteira. Não bloqueia nem é bloqueada pelas fases anteriores; fica pro fim por ser a mais cara.
- **Fase 9 — Notificação push mobile** (ADR-14): depende do sync já disparando de forma confiável (Fases 1-7) pra saber quando notificar. Menor valor incremental dos itens novos — última fase.

Cada fase segue o mesmo fluxo: plano de implementação (writing-plans) → execução → verificação de que Gmail/Microsoft não regrediram (risco 5) → próxima fase.

## 8. Fora do escopo desta fase, candidatos a fase futura

Agendamento de envio, threading, categorias, delegação, calendário, push mobile, modo foco e sync near-realtime foram todos movidos pra dentro do escopo (ver seção 1, ADRs 9-16). O que continua de fora, por não ter sido pedido:

- Anexos em rascunhos (`_api/email/draft.ts`) — mesma lacuna estrutural que o envio tinha, ver seção 5.1.
- Caixa compartilhada institucional e app mobile nativo — ver seção 1, "Fora do escopo".
- Categorias/etiquetas coloridas **fora** de mensagem (ex: categorizar contatos ou eventos de calendário) — o escopo do ADR-11 cobre só categorias de e-mail.
- IMAP IDLE / near-realtime quando o processo roda em modo Vercel serverless — ver risco 8.
