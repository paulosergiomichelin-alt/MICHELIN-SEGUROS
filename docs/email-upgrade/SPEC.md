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
- **Chave de criptografia de tokens tem fallback hardcoded** (`emailEncryption.ts`): se `EMAIL_ENCRYPTION_KEY` não estiver definida, usa uma string literal fixa no código — risco de segurança real, fora do escopo original mas fica registrado no risco 1 da seção 8.
- `docs/db-migration/SPEC.md` §4.10 está **desatualizado**: ainda descreve `oauth_tokens jsonb`, mas o schema real usa colunas de nível superior (`accessToken`/`refreshToken`/`tokenExpiry`). Não é bug de código, é a documentação da fase anterior que não foi atualizada — corrigir de passagem.

## 1. Escopo

**Dentro do escopo** (pedido explícito do usuário: "colocar qualquer e-mail" + "pastas, regras, resposta automática e tudo mais"):

1. Suporte a **qualquer provedor de e-mail via IMAP/SMTP genérico** — não travado em Gmail/Outlook.
2. **Pastas reais**: customizadas, possivelmente aninhadas, substituindo as 6 fixas hardcoded.
3. **Motor de regras/filtros**: condições sobre e-mail recebido → ações automáticas.
4. **Resposta automática funcional** (terminar o que já existe pela metade).
5. Melhorias adicionais de paridade com Outlook, priorizadas depois do core (ver seção 7 — categorias, agendamento de envio, threading de conversa).

**Fora do escopo** (por decisão explícita do usuário, 2026-09-11):

- **Conteúdo/corpo dos e-mails continua em memória** (`emailCache.ts`), não migra para Postgres. Only *configuração* (contas, pastas, regras) é persistida — ver ADR-7.
- Caixas compartilhadas, integração de calendário, notificação push mobile — não pedidos, não incluídos.

## 2. Decisões de arquitetura (ADR)

| # | Decisão | Motivo |
|---|---|---|
| ADR-1 | Cliente IMAP via **`imapflow`**, cliente SMTP via **`nodemailer`** (ambos npm, bem mantidos, TypeScript-friendly). Novos arquivos `_api/lib/imapClient.ts` + `_api/lib/smtpClient.ts`. | Padrão de mercado pra Node.js; `imapflow` tem suporte nativo a IDLE (near-realtime) que pode substituir parte do polling no futuro, mas nesta fase só cobrimos paridade funcional com fetch periódico, igual ao Gmail/Microsoft hoje. |
| ADR-2 | `imapClient.ts`/`smtpClient.ts` espelham a **assinatura pública** de `gmailClient.ts`/`microsoftClient.ts` (`listMessages`, `getMessage`, `sendMessage`, `createDraft`, `updateDraft`, `deleteDraft`, `modifyMessage`/ações de flag, `getAttachment`). | Todo o código consumidor (`emailSync.ts`, `messages.ts`, `search.ts`, `send.ts`, `draft.ts`, `action.ts`) já ramifica por provider — adicionar um 3º branch (`if (provider === 'imap')`) é mudança cirúrgica se a interface bater, em vez de reescrever cada rota. |
| ADR-3 | `EmailAccount.provider` (TS) e a coluna `email_accounts.provider` deixam de ser união fechada de 2 valores e passam a aceitar `'gmail' \| 'microsoft' \| 'imap'`. Contas IMAP guardam config de conexão em colunas novas (`imapHost`, `imapPort`, `imapSecure`, `smtpHost`, `smtpPort`, `smtpSecure`, `username`) + senha criptografada reaproveitando `emailEncryption.ts` (`accessToken` reaproveitado como campo genérico de "credencial criptografada" em vez de token OAuth — ver seção 4). `accessToken`/`refreshToken`/`tokenExpiry` passam a ser nullable (contas IMAP não têm OAuth). | Contas IMAP autenticam com usuário/senha (ou senha de app), não OAuth — precisam de um formulário "configuração avançada" (host/porta/TLS), como o Outlook desktop tem pra contas não-Microsoft. |
| ADR-4 | Pastas passam a ser uma entidade real e persistida: nova tabela **`email_folders`** (`id, accountId, name, parentFolderId nullable, type: 'system'\|'custom', providerFolderId nullable`). Pastas de sistema (inbox/sent/drafts/trash/spam/archive) são auto-criadas na primeira sincronização de cada conta, espelhando a estrutura real do provedor quando possível (Gmail: labels reais, não só as 6 fixas; Microsoft: `mailFolders` reais via Graph; IMAP: árvore real via `LIST`). Pastas customizadas: criar/renomear/apagar é uma operação por provedor (Gmail → cria label; Microsoft → `POST /me/mailFolders`; IMAP → comando `CREATE`), mas o modelo de dados e a UI são unificados. | É impossível ter pastas customizadas de verdade com o esquema hardcoded de 6 pastas atual — essa é a mudança estrutural que desbloqueia tudo o resto (inclusive regras, que precisam de "mover para pasta X" como ação). |
| ADR-5 | Motor de regras roda **do lado da aplicação** (não depende de filtros nativos do Gmail/Outlook), nova tabela **`email_rules`** (`id, userId, accountId nullable (null = todas as contas do usuário), name, conditions jsonb, matchType: 'all'\|'any', actions jsonb, enabled, order`). Avaliado a cada sincronização (`emailSync.ts`), depois de importar mensagens novas: para cada mensagem nova, roda as regras habilitadas em ordem e aplica as ações que baterem. | Regras nativas de cada provedor (Gmail filters API, Outlook inbox rules via Graph) não existem pra IMAP genérico — um motor próprio dá comportamento uniforme pros 3 provedores, e reaproveita a mesma pipeline de sync que já existe. |
| ADR-6 | Resposta automática: corrigir `_api/email/settings.ts` pra persistir `autoReply` de verdade, e implementar o disparo real dentro do loop de sync — depois de importar mensagens novas do INBOX, se `autoReply.enabled`, responde automaticamente (usando o caminho de envio do próprio provedor da conta) pra remetentes que ainda não receberam resposta dentro de uma janela de cooldown (evita loop infinito/spam). Dedup de cooldown fica em memória (`Map` simples, mesmo padrão do `emailCache.ts`), não em Postgres — consistente com ADR-7. | A UI e a coluna já existem; falta só a metade que faz a coisa funcionar. Cooldown em memória é aceitável (pior caso: um reinício do servidor dentro da janela de cooldown pode causar uma resposta automática duplicada — risco baixo, mesmo tipo de trade-off já aceito pro cache de e-mail inteiro). |
| ADR-7 | **Conteúdo dos e-mails continua em memória** (`emailCache.ts`, inalterado). Só *configuração* — contas (`email_accounts`, já era Postgres), pastas (`email_folders`, nova) e regras (`email_rules`, nova) — é persistida no Postgres. | Decisão explícita do usuário (2026-09-11): manter em memória, só adicionar IMAP/pastas/regras por cima. Mas pasta e regra são *configuração do usuário*, não conteúdo de e-mail — perder isso a cada reinício do servidor seria uma regressão de UX inaceitável (equivalente a perder as configurações de conta hoje, que ninguém aceitaria). A linha divisória é: conteúdo/corpo/anexo de e-mail = efêmero (já é assim hoje); estrutura/config que o usuário criou = durável (já é assim hoje pra contas e settings). |
| ADR-8 | `imapClient.ts` usa **conexão sob demanda** (abre, faz a operação, fecha) em vez de manter uma conexão IMAP persistente por conta — mais simples, evita gerenciar pool de conexões de longa duração num processo Node que já reinicia com frequência (deploys). IDLE (near-realtime) fica registrado como melhoria futura fora desta fase (ver seção 7). | Simplicidade > desempenho nesta primeira versão; o polling de 5 min já é o padrão atual pros outros 2 provedores, manter paridade. |

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

## 4. Fluxo de nova conta IMAP (visão de UX)

Espelha o "Configuração avançada" do Outlook desktop:

1. Usuário clica "Adicionar conta" → escolhe "Gmail" / "Outlook" (fluxos OAuth existentes, inalterados) / **"Outro (IMAP)"** (novo).
2. Formulário: e-mail, senha (ou senha de app — texto de ajuda explicando que provedores como Gmail/Yahoo exigem senha de app quando 2FA está ativo), com opção de digitar host/porta manualmente, e um botão "Detecção automática" (tenta portas/hosts comuns baseados no domínio do e-mail — `imap.<dominio>`, `smtp.<dominio>`, portas 993/587 — como Thunderbird faz, best-effort, sempre permitindo edição manual).
3. Backend testa a conexão (login IMAP + login SMTP) antes de salvar — erro claro se falhar, nunca salva uma conta que não conecta.
4. Salva em `email_accounts` (provider='imap'), dispara sync inicial igual às contas OAuth.

## 5. Motor de regras (visão de UX)

Tela nova (`EmailRulesPage.tsx` ou aba dentro de `EmailSettingsPage.tsx`): lista de regras (nome, condição resumida, ação resumida, toggle habilitado/desabilitado, arrastar para reordenar), botão "Nova regra" abre um formulário: condições (campo + operador + valor, múltiplas com E/OU), ações (mover para pasta / marcar como lida / destacar / encaminhar para / apagar).

## 6. Registro de riscos

| # | Risco | Mitigação |
|---|---|---|
| 1 | `emailEncryption.ts` tem uma chave de fallback hardcoded no código se `EMAIL_ENCRYPTION_KEY` não estiver definida — achado de segurança de passagem, não é objeto deste projeto. | Registrado aqui pra visibilidade; recomendação de corrigir separadamente (falhar explicitamente em vez de usar fallback, igual ao padrão já adotado em `scripts/deploy-vps.mjs`). |
| 2 | Detecção automática de host/porta IMAP/SMTP por domínio é heurística (nem todo provedor segue o padrão `imap.dominio.com`) — pode falhar silenciosamente pra provedores menos comuns. | Sempre permitir edição manual dos campos; testar a conexão antes de salvar (seção 4, passo 3) garante que nunca se salva uma config que não funciona, mesmo que a detecção automática erre. |
| 3 | Rodar o motor de regras a cada sync (5 min, todas as contas) pode ficar lento se o usuário tiver muitas regras ou muitas mensagens novas por ciclo. | Regras são avaliadas só sobre mensagens *novas* daquele ciclo de sync (não reprocessa a caixa toda), e a lista de regras por conta normalmente é pequena (dezenas, não milhares) — sem otimização especial nesta fase; registrar como ponto de atenção se o uso real mostrar lentidão. |
| 4 | Resposta automática com dedup em memória: um reinício do servidor dentro da janela de cooldown pode enviar uma resposta duplicada pro mesmo remetente. | Aceito conscientemente (ADR-6) — mesmo trade-off já aceito pro cache de e-mail inteiro (ADR-9 do projeto de migração de banco). Cooldown sugerido de 24h torna a janela de risco pequena na prática. |
| 5 | Widening de `provider` (união de 2 → 3 valores) toca em bastante código existente (`EmailService.ts`, `email.types.ts`, todo `_api/email/**`) — risco de regressão nos caminhos Gmail/Microsoft já funcionando. | Cada fase de execução testa explicitamente que Gmail/Microsoft continuam funcionando sem alteração de comportamento antes de considerar a fase concluída (mesmo padrão de verificação usado no projeto de migração de banco). |

## 7. Fora do escopo desta fase, candidatos a fase futura ("e tudo mais")

Recursos adicionais de paridade com Outlook mencionados genericamente pelo usuário mas não detalhados — ficam registrados como backlog, a priorizar depois do core (IMAP + pastas + regras + resposta automática):

- Agendamento de envio (enviar às X horas).
- Threading de conversa (agrupar mensagens por assunto/thread, como o Gmail faz nativamente e o Outlook faz por conversa).
- Categorias/etiquetas coloridas (além de pastas).
- IMAP IDLE / Gmail Pub/Sub / Graph subscriptions — sync quase em tempo real em vez de polling de 5 min.
- Modo "foco" (separar e-mail importante de newsletter/promo automaticamente).
