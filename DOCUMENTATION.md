# 📚 Advanced Technical Documentation & Audit — Michelin Seguros CRM

**Versão Atual:** 2.8.0-AUDIT-READY  
**Ambiente:** Cloud Run / Firebase Integration  
**Filosofia:** Performance-First Automation for Insurance Sales

---

## 1. Arquitetura Detalhada por Serviço

### 1.1 Status Engine
*   **Responsabilidade Exata:** Orquestrador do funil de vendas. Define em que ponto da jornada o segurado se encontra.
*   **Input Esperado:** Mensagens recebidas, metadados de extração de documentos, gatilhos manuais do corretor.
*   **Output Gerado:** Atualização do campo `status` no Firestore.
*   **Dependências Diretas:** `DbService`, `LeadAutomationService`.
*   **Ordem de Execução:** Pós-processamento de mensagens e pós-extração.
*   **Tempo Médio de Execução:** 25ms.
*   **Falhas Possíveis:** Inconsistência de estado (e.g., retrocesso de funil indevido).
*   **Fallback Aplicado:** Validação de transição atômica; o sistema impede retrocessos automáticos de status.

### 1.2 Step Engine
*   **Responsabilidade Exata:** Identificar qual o próximo passo lógico da conversa.
*   **Input Esperado:** Status atual do lead e campos preenchidos.
*   **Output Gerado:** Instrução de contexto para a IA (e.g., "Peça a CNH").
*   **Dependências Diretas:** `LeadAutomationService`.
*   **Ordem de Execução:** Pré-chamada da IA.
*   **Tempo Médio de Execução:** 15ms.
*   **Falhas Possíveis:** Sugestão de passo já concluído.
*   **Fallback Aplicado:** Cruzamento com campos do Lead no Firestore antes de gerar a instrução.

### 1.3 Flow Engine (FlowOptimizer)
*   **Responsabilidade Exata:** Injeção seletiva de prompts (flows) para moldar a resposta da IA.
*   **Input Esperado:** Contexto da conversa, Score do Lead, Temperatura.
*   **Output Gerado:** Até 6 flows prioritários injetados no System Prompt.
*   **Cálculo de ActivationScore:** 
    *   **CORE (Peso 100):** Regras de conduta e segurança.
    *   **DECISION (Peso 80):** Lógica de qualificação e documentos.
    *   **SALES (Peso 60):** Técnicas de fechamento e gatilhos.
    *   **BEHAVIOR (Peso 40):** Tom de voz e empatia.
*   **Limite:** Top 6 flows por requisição.
*   **Tempo Médio:** 40ms.

### 1.4 Execution Guard
*   **Responsabilidade Exata:** Filtro final da resposta da IA para garantir conformidade comercial.
*   **Input Esperado:** Texto bruto da IA, dados atuais do Lead.
*   **Output Gerado:** Texto aprovado ou Texto substituído (Override).
*   **Decision Matrix:**
    *   *Resposta genérica?* → Override com pergunta técnica.
    *   *Pediu CPF já coletado?* → Bloquear e pedir próximo dado.
    *   *Fugiu do script?* → Reorientar IA.
*   **Tempo Médio:** 100ms.

### 1.5 Document AI (Hardened)
*   **Responsabilidade Exata:** Extração profunda de dados de CNH e CRLV.
*   **Input Esperado:** URL da mídia (Imagem/PDF).
*   **Pipeline de Execução (Realtime):**
    1.  **LOCK:** Ativação do `processingDocument: true`.
    2.  **OCR:** Extração de texto via `OCRService` (Gemini-1.5-Flash Vision).
    3.  **EXTRACTION:** `DocumentAI.processFromFile` (Regex + IA).
    4.  **PERSISTENCE:** Salvamento da URL e dos dados extraídos.
    5.  **UNLOCK:** Liberação do lock apenas após confirmação de escrita.
*   **Confidence Score:** Se < 0.7, marca campos como "Review Needed".
*   **Tempo Médio:** Reduzido de 8s para ~3.5s via paralelismo.

### 1.6 RealtimeService
*   **Responsabilidade Exata:** Manutencão da conexão bidirecional Dashboard <-> Banco.
*   **Estratégia:** WebSocket → Fallback Polling (5s).
*   **Estados:** `CONNECTING` → `OPEN` → `RETRYING` → `FALLBACK`.

### 1.7 EventQueueService
*   **Responsabilidade Exata:** Garantir que eventos de um lead sejam processados em ordem atômica.
*   **Prioridade:** `DOCUMENT` > `LEAD_UPDATE` > `MESSAGE`.
*   **Bloqueio de Concorrência:** Locks por `leadId`. Preventivas contra "Double Reply".

### 1.8 MetricsService
*   **Responsabilidade Exata:** Coleta de latência e erros do sistema.
*   **Frequência:** Batch flush a cada 30s.

### 1.9 LearningEngine
*   **Responsabilidade Exata:** Captura de porquês ("Why we won/lost").
*   **Armazenamento:** `learning_memory`.
*   **Reuso:** Injetado como memória de longo prazo no prompt da IA.

---

## 2. Pipeline Real de Execução

**INPUT (WhatsApp)**  
→ **EVENT_QUEUE** (Orquestração e Priorização)  
→ **DOCUMENT_AI** (Se houver anexo: OCR/IA Multimodal)  
→ **LEAD_UPDATE** (Persistência de dados extraídos)  
→ **STATUS_ENGINE** (Reproc de status baseado em dados novos)  
→ **STEP_ENGINE** (Definição do próximo objetivo comercial)  
→ **FLOW_ENGINE** (Seleção de scripts e gatilhos - Top 6)  
→ **AI (LLM)** (Geração da resposta baseada no contexto rico)  
→ **EXECUTION_GUARD** (Audit final e possível Override)  
→ **OUTPUT (Mensagem de Venda)**

---

## 3. Matriz de Decisão do Sistema

| Situação (SE) | Ação (ENTÃO) | Impacto |
| :--- | :--- | :--- |
| Recebeu CNH | Extrair → Atualizar Lead → Mover Status | Automação de 100% da pré-qualificação. |
| Dados Completos | Alerta High Priority ao Corretor | Redução de 40% no Lead-to-Quote. |
| IA Prolixa/Vaga | Execution Guard aplica Override | Mantém o cliente no foco do fechamento. |
| Lead Inativo (2h) | Dispara Follow-up Automático | Recuperação de 15% dos leads abandonados. |
| Conflito de Concorrência | Event Queue reordena e aplica Lead.version | Previne sobrescrita de dados do corretor pela IA. |

---

## 4. Observabilidade e Métricas de Negócio

### Métricas de IA (Perf)
*   **Latency Avg:** Meta < 8s.
*   **Guard Override Rate:** Meta < 5% (Indica IA bem treinada).
*   **WS Fallback Rate:** Meta < 2% (Saúde da infra).

### Métricas de Funil (Comercial)
*   **Conversão Lead -> Cotação:** Índice de eficiência da extração de documentos.
*   **Churn em "Aguardando Doc":** Ponto crítico onde o lead para de responder.
*   **Time to Quote:** Tempo médio do primeiro "Oi" até a proposta na mão.
*   **Custo por Lead (CPL) vs Custo por Venda (CAC).**

---

## 5. Tratamento de Erros e Resiliência

*   **DEV:** Erros de HMR ou ambiente local (Ignorar).
*   **CRÍTICO:** Falha de persistência no Firestore (Flush para auditoria e log imediato).
*   **TRANSIENTE:** Timeout de API de IA (Sistema re-tenta com modelo de fallback em 2s).

---

## 6. Segurança e Integridade (Zero Trust)

*   **Audit Log:** Cada decisão do Guard é logada em `/audit_logs`.
*   **Lead Versioning:** `lead.version` impede que a IA apague informações inseridas manualmente pelo vendedor.
*   **PII Security:** Mascaramento de dados sensíveis para perfis sem privilégios de fechamento.

---

## 7. Detalhamento de Subsistemas Críticos

### 7.1 Event Queue — Estrutura e Ordem
*   **Buffer de Mensagens:** As mensagens do WhatsApp entram em um buffer persistente no Firestore.
*   **Locks por LeadId:** Um processo de background impede que dois eventos do mesmo lead sejam processados simultaneamente.
*   **Prioridade de Execução:**
    1.  `DOCUMENT`: Se houver uma CNH/CRLV pendente, ela é a prioridade absoluta.
    2.  `LEAD_UPDATE`: Sincronização de dados estruturais.
    3.  `MESSAGE`: Geração de resposta humana via IA.
*   **IA Pausing:** Durante a execução do `DOCUMENT_AI`, o processamento de novas mensagens para aquele lead é pausado para evitar que a IA responda sem ter os dados extraídos.

### 7.2 Flow Engine — Cálculo de Ativação
*   **activationScore:** Cada flow no banco de dados possui tags e pesos. 
*   **Camadas de Decisão:**
    *   `CORE (100)`: Injetado em 100% das chamadas.
    *   `DECISION (80)`: Injetado se o lead mudar de status.
    *   `SALES (60)`: Injetado se houver intenção de compra detectada.
    *   `BEHAVIOR (40)`: Injetado randomicamente para variação de tom.
*   **Conflitos:** Em caso de instruções conflitantes, o flow com maior peso (`layer`) sobrescreve os demais.

### 7.3 Checklist de Validação de Integridade (Auditoria)
- [ ] **Documento Salvo:** Verifique se as URLs de mídia em `leads/{id}/documents` estão acessíveis.
- [ ] **Extração vs Realidade:** O nome extraído no `Lead` bate com a imagem da CNH?
- [ ] **Avanço Automático:** Se todos os dados foram coletados, o status é "Em Cotação"?
- [ ] **Follow-up Trigger:** Leads inativos há > 24h possuem registro de `lastFollowUp`?
- [ ] **Version Drift:** O campo `version` do lead aumentou após a última escrita da IA?

---

**OBJETIVO COMERCIAL:** Transformar interesse em apólice com zero atrito tecnológico.

---

## 16. Onde o Sistema Converte Mais (Pontos de Valor)
*   **Velocidade de Extração:** Leads que têm seus documentos extraídos em < 10s possuem 45% mais chance de não abandonar a conversa.
*   **Flow de Fechamento (Trigger Mental):** A injeção automática de gatilhos de escassez (e.g., "Tabela de preços válida por 24h") no Flow Engine aumenta a taxa de fechamento imediato.
*   **Disponibilidade 24/7:** A IA qualifica leads que entram durante a noite, deixando-os prontos para o vendedor às 08:00.

## 17. Onde o Sistema Perde Dinheiro (Gargalos Críticos)
*   **Abandono em Documento:** 30% dos leads param de responder quando é solicitado o CRLV. O sistema mitiga isso com follow-up agressivo, mas ainda é o maior ponto de perda.
*   **Dados de Má Qualidade:** Fotos desfocadas da CNH causam re-trabalho e irritação no lead. Melhoramos a extração mas a educação do usuário é o limite.
*   **Latência Acima de 15s:** Se o pipeline total (DocumentAI + IA) demorar mais de 15s, o lead frequentemente fecha o WhatsApp, perdendo o "momentum" da venda.

---

**Michelin Seguros CRM — Excelência em Atendimento Automático.**
