import { Lead, Message } from "../types";
import { logger } from "./LoggerService";
import { DataService } from "./DataService";
import { OrchestratorService } from "./OrchestratorService";

export class DeterministicAgentService {
  private static instance: DeterministicAgentService;
  private constructor() {}

  public static getInstance(): DeterministicAgentService {
    if (!this.instance) this.instance = new DeterministicAgentService();
    return this.instance;
  }

  /**
   * INTERFACE OBRIGATÓRIA - DETERMINÍSTICA
   */

  public async processLead(leadId: string, context: any): Promise<void> {
    logger.info('AGENT', `Processing lead ${leadId} deterministic...`);
    // Logic moved from Orchestrator orchestration
  }

  public determineNextStep(lead: Lead): string {
    return OrchestratorService.getInstance().getNextStep(lead);
  }

  public async generateReply(lead: Lead, messages: Message[]): Promise<string> {
    const step = this.determineNextStep(lead);
    return OrchestratorService.getInstance().generateForcedResponse(step);
  }

  public validateLead(lead: Lead): boolean {
    const hasName = !!lead.name && lead.name.length > 5;
    const hasCnh = !!lead.cpf && !!lead.documents?.cnh;
    return hasName && hasCnh;
  }

  public async routeFlow(lead: Lead): Promise<string> {
    const step = this.determineNextStep(lead);
    return step;
  }

  // LEGACY SUPPORT (will be removed once all callers updated)
  public async generateResponse(lead: Lead, messages: Message[]): Promise<{ text: string }> {
    const text = await this.generateReply(lead, messages);
    return { text };
  }
}

export const agentService = DeterministicAgentService.getInstance();
