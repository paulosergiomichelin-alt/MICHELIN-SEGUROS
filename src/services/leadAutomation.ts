import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Lead, Message, AgentConfig } from '../types';
import { DataService } from './DataService';
import { metricsService } from './MetricsService';
import { MessageCacheService } from './MessageCacheService';
import { OrchestratorService } from './OrchestratorService';
import { logger } from './LoggerService';
import { IdempotencyService } from './IdempotencyService';
import { LockService } from './LockService';
import { BatchCoordinatorService } from './BatchCoordinatorService';

/**
 * LeadAutomationService: Porta de entrada única para mensagens.
 * Responsável por: Idempotência, Isolamento e Delegação.
 */
export class LeadAutomationService {
  private localProcessing = new Set<string>();

  public async processNewMessage(msg: Message, agentConfig: AgentConfig) {
    // 1. IDEMPOTÊNCIA GLOBAL (Anti-duplicidade de texto)
    if (msg.text && await IdempotencyService.isDuplicate(IdempotencyService.getMessageKey(msg.leadId, msg.text))) {
      return;
    }

    // 2. CACHE INSTANTÂNEO (UxE)
    MessageCacheService.append(msg.leadId, msg);

    // 3. EXECUÇÃO DETERMINÍSTICA
    await this.executeProcessing(msg, agentConfig);
  }

  private async executeProcessing(msg: Message, agentConfig: AgentConfig) {
    const totalTimer = metricsService.startTimer();
    const msgRef = doc(db, 'messages', msg.id);
    const orgId = msg.organizationId || 'default';
    
    // Prevent re-processing in same instance
    if (this.localProcessing.has(msg.id)) return;
    this.localProcessing.add(msg.id);

    try {
      // 1. TRANSACTIONAL LOCK (Firestore Side)
      const isAlreadyClaimed = await runTransaction(db, async (transaction) => {
        const mSnap = await transaction.get(msgRef);
        if (!mSnap.exists()) return true; 

        const mData = mSnap.data() as Message;
        if (mData.aiProcessed) return true;
        
        transaction.update(msgRef, { 
          aiProcessed: true, 
          aiProcessingStartedAt: new Date().toISOString() 
        });
        return false;
      });

      if (isAlreadyClaimed) return;

      // 2. DISTRIBUTED LOCK (Orchestration Level)
      const hasLock = await LockService.getInstance().acquireLock(msg.leadId, 'orchestration', orgId);
      if (!hasLock) return;

      try {
        const lead = await DataService.get('leads', msg.leadId) as Lead;
        if (!lead) return;

        // 3. BATCHED UPDATES (Avoid individual updateDoc calls)
        const hasAttachments = !!(msg.attachments && msg.attachments.length > 0);
        const updates: any = {
          lastInteraction: msg.timestamp,
          lastMessageText: msg.text,
          lastMessageSender: msg.sender,
          updatedAt: new Date().toISOString()
        };

        if (hasAttachments) {
          updates.aiStatus = 'uploaded';
        }

        if (!lead.status || lead.status === 'Novo Lead') {
          updates.status = 'Em Atendimento';
        }

        await BatchCoordinatorService.execute([{
          type: 'update',
          collection: 'leads',
          id: msg.leadId,
          data: updates
        }], 'AUTOMATION');

        // 4. DELEGAÇÃO AO ORCHESTRATOR
        if (agentConfig.isActive) {
          await OrchestratorService.handleIncomingMessage(msg, agentConfig);
        }

      } finally {
        await LockService.getInstance().releaseLock(msg.leadId, 'orchestration', orgId);
      }

      totalTimer.stop('total_processing_latency', { leadId: msg.leadId });
    } catch (err) {
      metricsService.track('processing_error', 1, { leadId: msg.leadId });
      logger.error('AUTOMATION', `Error processing lead ${msg.leadId}`, err);
    } finally {
      this.localProcessing.delete(msg.id);
    }
  }
}

export const leadAutomationService = new LeadAutomationService();
