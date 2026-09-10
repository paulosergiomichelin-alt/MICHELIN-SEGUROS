# Fase 6 — Cutover em Produção e Decomissionamento do Firestore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar os dados de produção de verdade, ligar `USE_POSTGRES=true` em produção, operar em observação, e só então remover o código/caminho Firestore — nesta ordem, nunca invertida.

**Architecture:** Mesma da spec (ADR-1 a ADR-10) já implementada nas Fases 0-5; esta fase é operacional, não de arquitetura nova.

**Tech Stack:** mesmo das fases anteriores.

**Spec:** `docs/db-migration/SPEC.md` §9 (Plano de rollback).

## Global Constraints

- **Ordem não pode ser invertida**: migrar dados → flag ligada → período de observação → só então remover código Firestore. Cada etapa só avança depois da anterior confirmada estável.
- Nenhuma tarefa desta fase é reversível com a mesma facilidade das fases 0-5 (que tinham `USE_POSTGRES=false` como saída instantânea) — a partir do momento em que o código Firestore é removido (Task 4), o rollback exigiria reverter o commit e reimplantar, não só trocar uma env var.

---

### Task 1: Migração de dados de produção (execução final)

**Files:** nenhum arquivo novo — reexecução do script da Fase 5 contra o Neon de produção

- [ ] **Passo 1: Primeira passada completa**

Run: `DATABASE_URL=<neon-producao> npx tsx scripts/migrate-firestore-to-postgres.ts --write`
Expected: mesma verificação de contagem da Fase 5 Task 5, agora contra o banco de produção real.

- [ ] **Passo 2: Comunicar uma janela curta de baixo tráfego (não precisa ser downtime — o Firestore continua sendo a fonte de verdade até o Passo 4)**

Escolher um horário de baixo uso (ex.: madrugada) para minimizar a quantidade de escritas que acontecem entre a Task 1 e a Task 2 (flip da flag).

- [ ] **Passo 3: Segunda passada (captura o delta desde a primeira)**

Run: o mesmo comando do Passo 1, imediatamente antes do Task 2 — idempotente por `ON CONFLICT DO UPDATE`, então só atualiza o que mudou desde a primeira passada.

- [ ] **Passo 4: Confirmação final de contagem**

Repetir a verificação de contagem (Fase 5 Task 5 Passo 3) uma última vez contra produção. Só prosseguir para a Task 2 deste plano se todas as contagens baterem.

---

### Task 2: Ativar `USE_POSTGRES=true` em produção

**Files:**
- Modify: variáveis de ambiente da VPS (`USE_POSTGRES=true`) e do build do frontend na Vercel (`VITE_USE_POSTGRES=true`)

- [ ] **Passo 1: Configurar na VPS**

Atualizar o `.env` de produção na VPS (`143.95.211.30`) com `USE_POSTGRES=true` e a `DATABASE_URL` de produção do Neon (a mesma usada na Task 1). Reiniciar o processo `server.ts` (via o mecanismo de deploy existente, `scripts/deploy-vps.mjs`).

- [ ] **Passo 2: Configurar na Vercel**

Via `vercel env add VITE_USE_POSTGRES production` (valor `true`) — ou skill `vercel:env` deste ambiente. Disparar um novo build/deploy do frontend para que o valor seja embutido no bundle (`VITE_*` é resolvido em build time, não runtime).

- [ ] **Passo 3: Smoke test em produção**

Repetir manualmente um subconjunto pequeno dos testes manuais das Fases 2-4 (criar um lead de teste, mandar uma mensagem de teste, ver o Kanban atualizar em tempo real) diretamente em produção, confirmando nos logs do `server.ts` (`log.info`) que `Feature flag USE_POSTGRES { value: true }` aparece e que não há erro 5xx nas rotas `/api/data/*`.

- [ ] **Passo 4: Observação**

Monitorar logs de erro (`log.error`/`log.warn` já instrumentados em `server.ts`) e o dashboard do Neon (uso de storage, latência de query) por um período mínimo de **2 semanas** (sugestão da spec §9) antes de avançar para a Task 3. Este é um passo de espera ativa, não uma tarefa de código.

---

### Task 3: Confirmação final antes de remover Firestore

**Files:** nenhum — checklist de confirmação

- [ ] **Passo 1: Revisar `docs/db-migration/INVENTORY.md` inteiro**

Todo checkbox das seções A, B, C deve estar marcado `[x]`. Qualquer item ainda `[ ]` significa que existe código em produção ainda dependente do Firestore — não prosseguir enquanto houver algum.

- [ ] **Passo 2: Confirmar com o usuário explicitamente**

Este é o ponto de não-retorno prático (remover código é reversível via git, mas exige um novo deploy, não uma env var) — obter confirmação explícita antes da Task 4, mesmo que as 2 semanas de observação tenham corrido bem.

---

### Task 4: Remover o caminho Firestore do código

**Files:**
- Modify: `src/services/DataService.ts` (remover blocos `if (USE_POSTGRES) {...}` — o bloco vira o único caminho; remover o `else`/código Firestore abaixo dele)
- Modify: todos os arquivos das Fases 2-4 que tinham guarda `USE_POSTGRES`
- Modify: `src/lib/firebase.ts` (remover `getFirestore`/`initializeFirestore` e os imports de `firebase/firestore` — manter `getAuth`/`getStorage`)
- Delete: `_api/lib/adminFirebase.ts` (substituído por `pgData.ts` na Fase 4)
- Review: `firestore.rules`, `firebase.json` — decidir remoção ou manutenção por segurança residual

- [ ] **Passo 1: Remover as guardas `USE_POSTGRES` de `DataService.ts`**

Para cada método tocado nas Fases 2-3 (`get`, `list`, `listPaginated`, `create`, `update`, `delete`, `save`, `subscribe`, `subscribeCollection`, `getFromServer`, `listFromServer`, `updateAggregates`): remover o `if (USE_POSTGRES) { ...; return; }` e apagar todo o código abaixo dele (o caminho Firestore antigo), deixando só o corpo que antes estava dentro do `if`.

- [ ] **Passo 2: Repetir para os serviços da Fase 3** (`EmpresaService`, `ClienteService`, `TemplateService`, `NfseService`, `LockService`, `leadAutomation`, `MigrationRunnerService`, `TenantIsolationService`, `RelacionamentosTab.tsx`, e os 4 adicionados numa revisão de correção na Fase 3 Task 11: `LoggerService.ts`, `MetricsService.ts`, `BatchCoordinatorService.ts`, `AdminTools.tsx`) e para as rotas `_api/**` da Fase 4 (se alguma manteve um `if (USE_POSTGRES)` explícito em vez de já ter trocado 100% para `pgData.ts` — confirmar caso a caso).

- [ ] **Passo 3: Limpar `src/lib/firebase.ts`**

```diff
  import { initializeApp } from 'firebase/app';
  import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
- import { getFirestore, doc, getDoc, getDocFromServer, initializeFirestore, enableNetwork } from 'firebase/firestore';
  import { getStorage } from 'firebase/storage';
  import firebaseConfig from '../../firebase-applet-config.json';

  const app = initializeApp(firebaseConfig);
-
- export const db = initializeFirestore(app, { ... }, firebaseConfig.firestoreDatabaseId);

  export const auth = getAuth(app);
  export const storage = getStorage(app);
  export const googleProvider = new GoogleAuthProvider();
  export { onAuthStateChanged, signInWithPopup, signOut };
```

- [ ] **Passo 4: Remover `_api/lib/adminFirebase.ts` e a feature flag**

```bash
git rm _api/lib/adminFirebase.ts
```

Remover `USE_POSTGRES`/`VITE_USE_POSTGRES` de `src/lib/featureFlags.ts`, `.env.example`, e do log em `server.ts` (Fase 0 Task 5) — não são mais necessários, o caminho Postgres é o único.

- [ ] **Passo 5: Build completo e typecheck**

Run: `npm run build`
Expected: sem erro. Nenhum arquivo deve mais importar `firebase/firestore` (estático ou dinâmico) — confirmar com:
```bash
grep -rl "firebase/firestore" src _api
grep -rl "await import('firebase/firestore')" src _api
```
(esperado: ambos vazios — o segundo grep existe por causa do `src/domains/leads/LeadForm.tsx`, que usava import dinâmico e não aparece no primeiro padrão).

- [ ] **Passo 6: Decidir sobre `firestore.rules`/`firebase.json`**

Se nenhuma coleção Firestore continua em uso (confirmado pelo grep do Passo 5), manter `firestore.rules` restritivo (negar tudo) por segurança residual em vez de deletar — o console do Firebase continua existindo para o projeto até que o Firestore seja desativado manualmente lá, e regras permissivas esquecidas são um risco desnecessário mesmo sem código apontando para lá.

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "chore: remove caminho Firestore — Postgres/Neon é a única fonte de dados"
```

- [ ] **Passo 8: Deploy final e smoke test completo**

Deploy da VPS (`server.ts`) + novo build/deploy do frontend na Vercel. Repetir um smoke test amplo (login, Kanban de leads, mensagens, clientes/apólices, campanhas, e-mail, NFS-e, WhatsApp) confirmando que tudo funciona sem qualquer fallback Firestore disponível.

---

## Self-Review desta fase

- Ordem de execução é estritamente sequencial e cada Task depende da anterior estar confirmada — não há paralelismo possível aqui por natureza (é a fase de corte real, ao contrário das Fases 0-5 que convivem com o sistema antigo).
- O ponto de não-retorno (Task 4) só ocorre depois de confirmação explícita do usuário (Task 3, Passo 2) e 2 semanas de observação estável (Task 2, Passo 4) — nunca antes.
- Ao final desta fase, `docs/db-migration/INVENTORY.md` deve ter 100% dos itens marcados e este documento é o último do projeto de migração — não há Fase 7.
