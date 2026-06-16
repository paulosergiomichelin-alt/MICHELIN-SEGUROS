import { where, orderBy, limit, QueryConstraint } from 'firebase/firestore';
import { Lead, Message, AgentConfig, TenantConfig } from '../types';
import { DataService } from './DataService';
import { agentService } from './agentService';
import { metricsService } from './MetricsService';
import { logger } from './LoggerService';
import { OCRService } from './OCRService';
import { standardizeLeadData } from '../lib/lead-utils';
import { LockService } from './LockService';
import { SecurityService } from './SecurityService';
import { ExecutionGuard } from './ExecutionGuard';
import { DeadLetterQueue } from './DeadLetterQueue';
import { getStepContext } from './StepRouter';
import { generateReply as agentBrainReply } from './AgentBrain';
import { updateContextSummary } from './ContextSummarizer';

export enum OrchestratorAction {
  PROCESS_DOCUMENT = 'PROCESS_DOCUMENT',
  SEND_MESSAGE = 'SEND_MESSAGE',
  UPDATE_LEAD = 'UPDATE_LEAD',
  WAIT = 'WAIT',
  FALLBACK = 'FALLBACK',
  TERMINATE = 'TERMINATE'
}

export enum LeadFlowState {
  ACOLHIMENTO = 'acolhimento',
  COLETAR_NOME = 'coletar_nome',
  SOLICITAR_CNH = 'solicitar_cnh',
  SOLICITAR_CRV = 'solicitar_crv',
  SOLICITAR_APOLICE = 'solicitar_apolice',
  AGUARDAR_COTACAO = 'aguardar_cotacao',
  PRONTO_PARA_COTACAO = 'pronto_para_cotacao',
  FECHAMENTO = 'fechamento_proposta',
  ERRO_DOC = 'erro_doc'
}

export interface OrchestrationContext {
  lead: Lead;
  messages: Message[];
  lastMessage: Message;
  nextStep: string;
  hasDocuments: boolean;
  timestamp: string;
  depth: number; 
}

export class OrchestratorService {
  private static instance: OrchestratorService;
  private static readonly MAX_ORCHESTRATION_DEPTH = 3;

  private constructor() {}

  public static getInstance(): OrchestratorService {
    if (!this.instance) this.instance = new OrchestratorService();
    return this.instance;
  }

  public getNextStep(lead: Lead): string {
    if (!lead) return LeadFlowState.ACOLHIMENTO;

    const hasCnh = !!lead.documents?.cnh || (!!lead.cpf && !!lead.name);
    const hasCrv = (lead.documents as any)?.crv || !!lead.plate;
    const hasName = !!lead.name && !lead.name.match(/^\d+$/);

    if (lead.documentStatus === 'erro_extracao') return LeadFlowState.ERRO_DOC;
    if (!hasName) return LeadFlowState.COLETAR_NOME;
    if (!hasCnh) return LeadFlowState.SOLICITAR_CNH;
    if (!hasCrv) return LeadFlowState.SOLICITAR_CRV;

    if (lead.insuranceType === 'Renovação' && !lead.documents?.policy) {
      return LeadFlowState.SOLICITAR_APOLICE;
    }

    if (lead.status === 'Em Cotação') return LeadFlowState.AGUARDAR_COTACAO;
    return LeadFlowState.PRONTO_PARA_COTACAO;
  }

  public generateForcedResponse(step: string): string {
    switch (step) {
      case LeadFlowState.COLETAR_NOME:
        return "Perfeito 👍 pode me informar seu nome completo?";
      case LeadFlowState.ERRO_DOC:
        return "Não consegui ler o documento corretamente. Pode me enviar uma foto mais nítida ou a CNH aberta?";
      case LeadFlowState.SOLICITAR_CNH:
        return "Para eu te passar o valor agora e já buscar o melhor preço nas seguradoras, me manda a foto da CNH 👍";
      case LeadFlowState.SOLICITAR_CRV:
        return "Ótimo! Agora me envia o documento do veículo (CRLV) para eu seguir com o cálculo exato 🚗💰";
      case LeadFlowState.SOLICITAR_APOLICE:
        return "Consegue me mandar uma foto da sua última apólice?";
      case LeadFlowState.AGUARDAR_COTACAO:
        return "Perfeito 👍 já vou calcular nas 15 seguradoras parceiras.";
      default:
        return "Como posso ajudar com seu seguro hoje?";
    }
  }

  static async handleIncomingMessage(msg: Message, agentConfig: AgentConfig): Promise<void> {
    const service = OrchestratorService.getInstance();
    const lead = await DataService.get('leads', msg.leadId) as Lead;
    if (!lead) return;

    const organizationId = lead.organizationId || 'default';
    const hasLock = await LockService.getInstance().acquireLock(msg.leadId, 'orchestration', organizationId);
    
    if (!hasLock) return;

    try {
      let currentLead = lead;
      let depth = 0;

      while (depth < this.MAX_ORCHESTRATION_DEPTH) {
        depth++;
        const context = await service.buildContext(currentLead, msg, depth);
        const decision = service.decideNextAction(context, agentConfig);
        
        if (decision.action === OrchestratorAction.TERMINATE) break;

        const result = await service.executeAction(decision.action, context, agentConfig, decision);
        if (result?.updatedLead) currentLead = result.updatedLead;
        if ([OrchestratorAction.SEND_MESSAGE, OrchestratorAction.FALLBACK, OrchestratorAction.WAIT].includes(decision.action)) break;
      }
    } catch (err) {
      logger.error('ORCHESTRATOR', 'Fail in orchestration', err);
    } finally {
      await LockService.getInstance().releaseLock(msg.leadId, 'orchestration', organizationId);
    }
  }

  private async buildContext(lead: Lead, lastMessage: Message, depth: number): Promise<OrchestrationContext> {
    const nextStep = this.getNextStep(lead);
    const hasDocuments = !!lastMessage?.attachments?.some(a => 
      ['image', 'application/pdf'].includes(a.type || '') || a.mimeType?.startsWith('image/')
    );

    const messages = (await DataService.list('messages', [
      where('leadId', '==', lead.id) as QueryConstraint,
      orderBy('timestamp', 'desc') as QueryConstraint,
      limit(50) as QueryConstraint,
    ]) as Message[]).reverse();

    return {
      lead, messages, lastMessage,
      nextStep,
      hasDocuments,
      timestamp: new Date().toISOString(),
      depth
    };
  }

  private decideNextAction(context: OrchestrationContext, config: AgentConfig) {
    const isDocProcessing = context.lead.documentStatus === 'em_processamento';
    const hasNewDocs = context.hasDocuments && !isDocProcessing && context.lead.documentStatus !== 'extraido_sucesso';
    
    if (hasNewDocs) return { action: OrchestratorAction.PROCESS_DOCUMENT, reason: 'Docs detected' };
    if (isDocProcessing) return { action: OrchestratorAction.WAIT, reason: 'Processing' };

    const nextStep = context.nextStep;
    if (context.lead.status === 'Aguardando Documento' && nextStep === LeadFlowState.PRONTO_PARA_COTACAO) {
      return { action: OrchestratorAction.UPDATE_LEAD, updates: { status: 'Em Cotação' } };
    }

    return { action: OrchestratorAction.FALLBACK, reason: 'Deterministic Reply' };
  }

  public static async processMessage(lead: Lead, text: string): Promise<void> {
    const msg: Message = {
      id: SecurityService.generateId('messages'),
      leadId: lead.id,
      sender: 'user',
      text: text,
      timestamp: new Date().toISOString(),
      organizationId: lead.organizationId
    };
    
    await DataService.create('messages', msg, 'USUARIO');
    
    await DataService.update('leads', lead.id, { 
      lastInteraction: msg.timestamp,
      lastMessageText: text,
      lastMessageSender: 'user',
      updatedAt: msg.timestamp
    }, 'USUARIO');
  }

  private async executeAction(action: OrchestratorAction, context: OrchestrationContext, config: AgentConfig, decision?: any): Promise<{ updatedLead?: Lead } | void> {
    switch (action) {
      case OrchestratorAction.PROCESS_DOCUMENT:
        return await this.handleDocumentExtraction(context);
      case OrchestratorAction.UPDATE_LEAD:
        await DataService.update('leads', context.lead.id, decision.updates, 'ai');
        return { updatedLead: { ...context.lead, ...decision.updates } };
      case OrchestratorAction.FALLBACK: {
        let text: string;

        if (config.useLLMAgent) {
          // ── AgentBrain path (LLM-generated, guardrail-validated) ──
          const stepCtx = getStepContext(context.lead, config);
          const tenantConfig: TenantConfig = {
            name: (config as any).tenantName || 'Michelin Seguros',
            insurers: (config as any).tenantInsurers || [],
            organizationId: context.lead.organizationId || 'default',
          };

          const output = await agentBrainReply({
            lead: context.lead,
            step: stepCtx.step,
            stepContext: stepCtx,
            recentMessages: context.messages.slice(-5),
            agentConfig: config,
            tenantConfig,
          });

          text = output.message;
          logger.info('ORCHESTRATOR', 'AgentBrain reply', {
            step: stepCtx.step,
            fallbackUsed: output.fallbackUsed,
            tokens: output.tokensUsed,
            latency: output.latencyMs,
          });

          // Update context summary after LLM interaction
          try {
            const newSummary = await updateContextSummary(
              context.lead,
              context.messages.slice(-5),
              config.openrouterApiKey,
              config.llm?.model ?? config.model
            );
            if (newSummary) {
              await DataService.update('leads', context.lead.id, { contextSummary: newSummary }, 'ai');
            }
          } catch (err) {
            logger.warn('ORCHESTRATOR', 'ContextSummarizer failed (non-critical)', err);
          }
        } else {
          // ── Legacy path (deterministic strings) ──
          text = await agentService.generateReply(context.lead, context.messages);
        }

        await this.sendResponse(context.lead, text);
        break;
      }
    }
  }

  private async handleDocumentExtraction(context: OrchestrationContext): Promise<{ updatedLead: Lead }> {
    const attachments = context.lastMessage.attachments || [];
    await DataService.update('leads', context.lead.id, { documentStatus: 'em_processamento' as any }, 'ai');

    const updates: Partial<Lead> = {
      documentStatus: 'extraido_sucesso',
      updatedAt: new Date().toISOString()
    };

    let anyExtraction = false;
    for (const att of attachments) {
      if (!att.url) continue;
      try {
        const result = await OCRService.getInstance().processDocument(att.url, {
           mimeType: att.mimeType,
           leadId: context.lead.id
        });
        
        if (result && result.structuredData && Object.keys(result.structuredData).length > 0) {
          anyExtraction = true;
          Object.assign(updates, standardizeLeadData(result.structuredData));
          
          const docs = { ...(context.lead.documents || {}) } as any;
          const docBase = {
            url: att.url,
            uploadedAt: new Date().toISOString(),
            documentType: result.type,
            extractedData: result.structuredData
          };

          if (result.type === 'cnh') docs.cnh = docBase;
          if (result.type === 'crlv') docs.crv = docBase;
          if (result.type === 'policy') docs.policy = docBase;
          updates.documents = docs;
        }
      } catch (err: any) {
        logger.error('ORCHESTRATOR', 'Extraction fail', err);
      }
    }

    if (!anyExtraction) updates.documentStatus = 'erro_extracao';
    await DataService.update('leads', context.lead.id, updates, 'ai');
    await this.sendResponse(context.lead, '📄 Documentos analisados!');
    return { updatedLead: { ...context.lead, ...updates } };
  }

  private async sendResponse(lead: Lead, text: string): Promise<void> {
    const msg: Message = {
      id: SecurityService.generateId('messages'),
      leadId: lead.id,
      sender: 'ai',
      text,
      timestamp: new Date().toISOString(),
      organizationId: lead.organizationId
    };

    await DataService.create('messages', msg, 'ai');
    
    await DataService.update('leads', lead.id, {
      lastInteraction: msg.timestamp,
      lastMessageText: text,
      lastMessageSender: 'ai',
      updatedAt: msg.timestamp,
      iaActive: true
    }, 'ai');
  }
}
