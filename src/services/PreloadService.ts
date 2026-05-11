import { Lead, Message, LeadStatus } from '../types';
import { DataService } from './DataService';
import { CacheManager } from './CacheManager';
import { MessageCacheService } from './MessageCacheService';
import { metricsService } from './MetricsService';
import { logger } from './LoggerService';
import { where, orderBy, limit, QueryConstraint } from 'firebase/firestore';

export class PreloadService {
  private static isPreloading = false;
  private static lastPreload: number = 0;
  private static PRELOAD_DEBOUNCE = 30000; // 30 seconds

  /**
   * Main entry point for preloading system data.
   * Runs in background to avoid blocking UI.
   * STAGED APPROACH: Priority items first, rest on demand or much later.
   */
  static async preloadInitialData(): Promise<number> {
    const now = Date.now();
    if (this.isPreloading || (now - this.lastPreload < this.PRELOAD_DEBOUNCE)) {
      return 0;
    }

    this.isPreloading = true;
    let totalItems = 0;
    const timer = metricsService.startTimer();
    logger.info('PRELOAD', 'Starting STAGED preload sequence...');

    try {
      // Stage 1: Absolute Critical Recent Leads (Strict Limit: 5)
      const recent = await this.preloadRecentLeads(5);
      totalItems += recent;
      
      // Stage 2: Background hydration of other status (Delayed significantly)
      // This part runs without waiting for user, but we use setTimeout to let UI settle
      setTimeout(async () => {
        try {
          const hot = await this.preloadHotLeads(5);
          logger.info('PRELOAD', `Background Stage 2 completed: ${hot} hot leads.`);
        } catch (e) {
          console.warn('[PRELOAD] Stage 2 background failed', e);
        }
      }, 10000); // 10 seconds delay

      this.lastPreload = Date.now();
      timer.stop('preload_total_latency');
      logger.info('PRELOAD', `Critical Stage 1 completed. Items: ${totalItems}`);
      return totalItems;
    } catch (error) {
      logger.error('PRELOAD', 'Failed to complete preload sequence', error);
      return totalItems;
    } finally {
      this.isPreloading = false;
    }
  }

  /**
   * Priority 1: Recent leads (Strictly small set)
   */
  private static async preloadRecentLeads(count: number = 5): Promise<number> {
    try {
      const leads = await DataService.list('leads', [
        orderBy('updatedAt', 'desc'),
        limit(count)
      ]) as Lead[];

      CacheManager.set('leads:recent', leads);
      // Only preload FIRST 2 details to save heavily on reads
      const topLeads = leads.slice(0, 2);
      await Promise.all(topLeads.map(l => this.preloadLeadDetails(l.id)));
      
      metricsService.track('preload_batch_recent', leads.length);
      return leads.length;
    } catch (e) {
      logger.warn('PRELOAD', 'Failed to preload recent leads', e);
      return 0;
    }
  }

  /**
   * Priority 2: Hot leads (Negociação / Proposta Enviada)
   */
  private static async preloadHotLeads(count: number = 5): Promise<number> {
    try {
      const leads = await DataService.list('leads', [
        where('status', 'in', ['Negociação', 'Proposta Enviada']),
        limit(count)
      ]) as Lead[];

      CacheManager.set('leads:hot', leads);
      // NO details preloading here – wait for user click or scroll
      metricsService.track('preload_batch_hot', leads.length);
      return leads.length;
    } catch (e) {
      logger.warn('PRELOAD', 'Failed to preload hot leads', e);
      return 0;
    }
  }

  /**
   * Priority 3: Quote leads (Em Cotação)
   */
  private static async preloadQuoteLeads(): Promise<number> {
    try {
      const leads = await DataService.list('leads', [
        where('status', '==', 'Em Cotação'),
        limit(15)
      ]) as Lead[];

      CacheManager.set('leads:quote', leads);
      await this.parallelPreloadDetails(leads);
      metricsService.track('preload_batch_quote', leads.length);
      return leads.length;
    } catch (e) {
      logger.warn('PRELOAD', 'Failed to preload quote leads', e);
      return 0;
    }
  }

  /**
   * Preloads specific details for a lead (messages + lead data)
   */
  public static async preloadLeadDetails(leadId: string): Promise<void> {
    if (CacheManager.get(`leads:${leadId}`)) return;

    try {
      const [lead, messages] = await Promise.all([
        DataService.get('leads', leadId) as Promise<Lead>,
        DataService.list('messages', [
          where('leadId', '==', leadId),
          orderBy('timestamp', 'desc'),
          limit(10)
        ]) as Promise<Message[]>
      ]);

      if (lead) CacheManager.set(`leads:${leadId}`, lead);
      if (messages) MessageCacheService.set(leadId, messages.reverse());
      
      metricsService.track('preload_lead_details_hit', 1, { leadId });
    } catch (e) {
      // Background task, fail silently but log
      logger.warn('PRELOAD', `Failed to preload details for lead ${leadId}`, e);
    }
  }

  /**
   * Smart Preload: Preloads neighbors in a list to anticipate user navigation
   */
  public static async preloadNeighbors(leads: Lead[], currentIndex: number, buffer: number = 3): Promise<void> {
    const toPreload = leads.slice(currentIndex + 1, currentIndex + 1 + buffer);
    for (const lead of toPreload) {
      this.preloadLeadDetails(lead.id);
    }
  }

  /**
   * Helper to fetch details in parallel for a batch of leads
   */
  private static async parallelPreloadDetails(leads: Lead[]): Promise<void> {
    // We only preload details for the top 5 of each batch to avoid network storms
    const topLeads = leads.slice(0, 5);
    await Promise.all(topLeads.map(l => this.preloadLeadDetails(l.id)));
  }
}
