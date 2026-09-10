# Inventário de call-sites Firebase/Firestore — checklist de migração

> Todo arquivo que toca Firestore/Firebase no projeto (excluindo `.claude/worktrees/` — cópia de worktree obsoleta — e `dist/` — build output). Fonte: leitura completa de `src/**`, `_api/**`, `api/index.js`. Cada linha aqui deve terminar marcada `[x]` quando a fase correspondente for concluída. Nada nesta lista pode ser "esquecido" — se um arquivo não aparece aqui, ele não foi migrado.

## A. Camada genérica (`DataService`) — Fase 2

- [ ] `src/services/DataService.ts` — reescrever interior de `get/list/listPaginated/create/update/delete/save/subscribe/subscribeCollection/getFromServer/listFromServer/updateAggregates` para chamar a nova API HTTP + Socket.IO. Interface pública **não muda**. Inclui as coleções `settings`/`config` (ID composto `{orgId}::{id}`, ver SPEC.md §4.13) — não têm arquivo próprio, passam só por aqui.
- [ ] `src/lib/queryConstraints.ts` — **novo arquivo**, substitui `where/orderBy/limit/startAfter` de `firebase/firestore`.
- [ ] Trocar import `firebase/firestore` → `../lib/queryConstraints` (mecânico, um grep) em todos os arquivos abaixo que hoje só usam constraint builders (não Firestore direto):
  - [ ] `src/contexts/WhatsAppContext.tsx`
  - [ ] `src/contexts/ClienteRealtimeContext.tsx`
  - [ ] `src/contexts/LeadRealtimeContext.tsx`
  - [ ] `src/contexts/NotificationContext.tsx`
  - [ ] `src/contexts/ChatContext.tsx`
  - [ ] `src/domains/leads/MensagensAtivas.tsx`
  - [ ] `src/domains/leads/LeadForm.tsx`
  - [ ] `src/domains/leads/FollowUpManagement.tsx`
  - [ ] `src/domains/whatsapp/ContactSidePanel.tsx`
  - [ ] `src/domains/settings/SystemHealth.tsx`
  - [ ] `src/domains/settings/FlowEngine.tsx`
  - [ ] `src/domains/admin/UserManagement.tsx`
  - [ ] `src/domains/admin/UserLogsView.tsx`
  - [ ] `src/domains/admin/AccessProfileManagement.tsx`
  - [ ] `src/components/UserProfileModal.tsx`
  - [ ] `src/components/NotificationBell.tsx`
  - [ ] `src/services/OrchestratorService.ts`
  - [ ] `src/services/TemplateService.ts` *(também tem chamadas Firestore diretas — ver seção B)*
  - [ ] `src/services/DocumentationService.ts`
  - [ ] `src/services/policy/DataPolicyService.ts` — importa só `where`/`QueryConstraint` (tipo).
  - [ ] `src/services/PreloadService.ts` — importa `where`/`orderBy`/`limit`/`QueryConstraint`.
  - [ ] `src/services/QueryFingerprintService.ts` — importa só o **tipo** `QueryConstraint` (nenhuma chamada de função) — o import muda de `firebase/firestore` para `src/lib/queryConstraints.ts` do mesmo jeito, já que o tipo existe lá também.
  - [ ] `src/services/SubscriptionRegistry.ts` — importa só o **tipo** `Unsubscribe` (não `QueryConstraint`). `queryConstraints.ts` não define esse tipo — trocar por um tipo local `type Unsubscribe = () => void;` neste arquivo (ou reexportar de `dataApiClient.ts`/`realtimeSocket.ts` na Fase 2), não por um import de `queryConstraints.ts`.
  - [ ] `src/domains/leads/LeadForm.tsx` — **atenção**: o import não é uma linha estática `import {...} from 'firebase/firestore'` — é um **import dinâmico** `const { where } = await import('firebase/firestore');` dentro de uma função (ver uso). O grep de verificação da Fase 2 Task 6 (`grep -rn "from 'firebase/firestore'"`) **não pega esse padrão** — trocar manualmente para `await import('../../lib/queryConstraints')` e confirmar com `grep -rn "await import('firebase/firestore')"` como checagem adicional.
  - [ ] (Reconfirmar esta lista por grep antes de fechar a Fase 2 — verificado numa revisão de correção: 39 arquivos em `src/**` batem em `firebase/firestore` hoje, excluindo `.claude/worktrees`. Todos os 39 estão contabilizados entre esta seção A e a seção B abaixo — qualquer um não listado em nenhuma das duas é um gap deste inventário.)

## B. Serviços que ignoram o `DataService` (Firestore direto do browser) — Fase 3

- [ ] `src/services/EmpresaService.ts` — CRUD empresas + onboarding (cria Firebase Auth user com app secundário) + `onSnapshot` em `empresas/{id}`.
- [ ] `src/services/ClienteService.ts` — CRUD clientes + subcoleções `apolices`/`historico` + `collectionGroup(db,'apolices')` + 3 `onSnapshot`.
- [ ] `src/services/TemplateService.ts` — `platform_agent_templates`, `platform_guardrails`, `tenants/{orgId}/config/agent_config`, `tenants/{orgId}/onboarding/wizard_state`.
- [ ] `src/domains/nfse/services/NfseService.ts` — `organizations/{orgId}/nfse`, `organizations/{orgId}/nfse_logs`.
- [ ] `src/domains/nfse/hooks/useNfse.ts` — consumidor do acima, confirmar se chama Firestore direto ou só via `NfseService`.
- [ ] `src/services/LockService.ts` — `processing_locks` via `runTransaction`.
- [ ] `src/services/MigrationRunnerService.ts` — `migration_logs` + leitura de coleções órfãs (ferramenta interna, não confundir com a migração de banco deste projeto).
- [ ] `src/services/TenantIsolationService.ts` — auditoria de isolamento, lê várias coleções org-scoped.
- [ ] `src/services/SecurityService.ts` — usa Firestore só para gerar IDs aleatórios (`generateId`) — trocar por `nanoid`/`uuid`, sem relação com dados.
- [ ] `src/services/leadAutomation.ts` — `runTransaction` para claim idempotente de mensagem de lead.
- [ ] `src/domains/clientes/RelacionamentosTab.tsx` — `cliente_relacionamentos`, grava 2 docs por vínculo, `onSnapshot`.
- [ ] `src/services/LoggerService.ts` — **adicionado numa revisão de correção, faltava no inventário original.** `import { collection, serverTimestamp, writeBatch, doc } from 'firebase/firestore'`, grava em `system_logs` via `writeBatch(db)` direto, sem passar pelo `DataService`.
- [ ] `src/services/MetricsService.ts` — **idem.** `import { writeBatch, doc, increment, serverTimestamp, collection } from 'firebase/firestore'`, grava em `metrics_users`, `metrics_daily`, `metrics_raw` direto.
- [ ] `src/services/BatchCoordinatorService.ts` — **idem.** `import { writeBatch, doc } from 'firebase/firestore'` — helper genérico de escrita atômica multi-coleção (`writeBatch(db)` + `doc(db, op.collection, op.id)` por operação recebida). É o consumidor natural do endpoint `POST /api/data/_batch` referenciado (mas nunca definido em código) nas Fases 3 (Tasks 8 e 10) — ver Fase 3 Task 11.
- [ ] `src/domains/admin/AdminTools.tsx` — **reclassificado**: estava na seção A (import-swap only) no inventário original, mas `import { doc, updateDoc } from 'firebase/firestore'` seguido de `updateDoc(doc(db, 'users', uid), { superadmin: true })` é uma escrita direta que bypassa o `DataService`, não um constraint builder. Pertence aqui, não na seção A.

## C. Rotas de API / serviços VPS (`_api/**`, `server.ts`) — Fase 4

- [ ] `_api/lib/adminFirebase.ts` — cliente REST caseiro (`fsGet/fsSet/fsUpdate/fsDelete/fsQuery/fsQueryFull`). Substituir por módulo Drizzle equivalente; manter as mesmas assinaturas de função para minimizar o diff nos call-sites abaixo.
- [ ] `_api/webhook/whatsapp.ts` — webhook Meta Cloud API (`messages`, `leads`).
- [ ] `_api/webhook/evolution.ts` — webhook Evolution API (`whatsapp_sessions`, `leads`).
- [ ] `_api/evolution/qr.ts`
- [ ] `_api/evolution/send.ts`
- [ ] `_api/evolution/sessions.ts`
- [ ] `_api/evolution/sync.ts`
- [ ] `_api/evolution/reconcile.ts`
- [ ] `_api/evolution/conversation.ts`
- [ ] `_api/evolution/conversations.ts`
- [ ] `_api/evolution/messages.ts`
- [ ] `_api/evolution/media.ts`
- [ ] `_api/evolution/stats.ts`
- [ ] `_api/evolution/sendMedia.ts`
- [ ] `_api/evolution/avatar.ts`
- [ ] `_api/evolution/contacts.ts`
- [ ] `_api/meta/send.ts`
- [ ] `_api/meta/status.ts`
- [ ] `_api/meta/messages.ts`
- [ ] `_api/meta/conversations.ts`
- [ ] `_api/campaigns/start.ts`
- [ ] `_api/campaigns/pause.ts`
- [ ] `_api/email/accounts.ts`
- [ ] `_api/email/auth/gmail.ts`
- [ ] `_api/email/auth/microsoft.ts`
- [ ] `_api/email/messages.ts`
- [ ] `_api/email/send.ts`
- [ ] `_api/email/action.ts`
- [ ] `_api/email/draft.ts`
- [ ] `_api/email/sync.ts`
- [ ] `_api/email/search.ts`
- [ ] `_api/email/settings.ts`
- [ ] `_api/email/stats.ts`
- [ ] `_api/lib/emailSync.ts`
- [ ] `_api/lib/gmailClient.ts`
- [ ] `_api/lib/microsoftClient.ts`
- [ ] **Verificação obrigatória antes de tocar em qualquer item acima**: `api/index.js` é build artifact de `_api/server.ts` (via `build-server.mjs`) ou foi editado manualmente em algum ponto? Se manual, reconciliar/apagar duplicação antes de migrar — senão a versão duplicada continua servindo Firestore em produção sem que ninguém note.

### Estado efêmero em memória (decisão ADR-9 — confirmar com usuário antes da Fase 4)

- [ ] `_api/lib/conversationCache.ts` — hoje só em `Map`; decisão: promover para `whatsapp_conversations`/`whatsapp_messages` reais (schema já definido na SPEC) ou manter em memória.
- [ ] `_api/lib/emailCache.ts` — idem, para e-mails/threads (não há tabela definida na SPEC ainda — só criar se a decisão for "promover").
- [ ] `_api/lib/messageQueue.ts` — avaliar se depende do cache acima. **Resolução explícita (Fase 4 Task 3, Passo 1)**: a mesma pergunta de decisão feita para `conversationCache.ts` cobre este arquivo — se a decisão for "promover", confirmar durante a implementação se a fila de envio pendente também precisa sobreviver a restart, ou se é aceitável continuar em memória (fila de processamento de curta duração, não dado de negócio em repouso). Não é uma decisão separada, mas também não pode ser esquecida.
- [ ] `_api/lib/sentMessageIds.ts` — dedupe de mensagens recebidas (Set com TTL) — provavelmente fica em memória mesmo (não é dado de negócio), mas revisar.
- [ ] `_api/lib/socketRegistry.ts` — infraestrutura de Socket.IO, **reaproveitado** pela Fase 1 (`emitDataChanged`), não migra, só ganha um uso novo.

## D. Frontend — inicialização e config (não migram, ficam Firebase) — apenas referência

- `src/lib/firebase.ts` — Auth + Storage continuam aqui; só a inicialização do Firestore (`getFirestore`/`initializeFirestore`) deixa de ser usada por ninguém após a Fase 3 — remover a importação de Firestore deste arquivo é a última tarefa da Fase 6 (cutover), não antes.
- `firebase-applet-config.json`, `firebase.json`, `firestore.rules` — revisar na Fase 6 se `firestore.rules` ainda precisa proteger alguma coleção (provavelmente não, se tudo migrou) antes de decidir se são removidos ou mantidos por segurança residual.

## E. Contagem de verificação

Total de arquivos distintos com alguma forma de acesso a Firebase/Firestore/Auth/Storage identificados: **~63** (revisado — o levantamento original tinha ~60; uma revisão de correção posterior, cruzando `grep -rl "firebase/firestore" src` diretamente contra este documento, encontrou e adicionou `LoggerService.ts`, `MetricsService.ts`, `BatchCoordinatorService.ts`, além de reclassificar `AdminTools.tsx` da seção A para a B). Este documento deve conter uma entrada para cada um. Se, ao longo da execução, um `grep -r "firebase\|firestore" src _api api` retornar um arquivo não listado aqui, ele é um gap deste inventário — pare e adicione antes de continuar a fase em andamento.
