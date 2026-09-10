import { DataService } from './DataService';
import {
  AgentTemplate,
  TenantAgentConfig,
  UniversalGuardrails,
  ResolvedAgentConfig,
  BusinessContext,
  AgentPersona,
  SalesBlocks,
  AgentHardRules,
} from '../types';
import { logger } from './LoggerService';
import { AGENT_TEMPLATES } from './seeds/agentTemplates.seed';
import { PLATFORM_GUARDRAILS } from './seeds/platformGuardrails.seed';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class SimpleCache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = CACHE_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

export class TemplateService {
  private static instance: TemplateService;
  private cache = new SimpleCache();

  private constructor() {}

  public static getInstance(): TemplateService {
    if (!this.instance) this.instance = new TemplateService();
    return this.instance;
  }

  // ─── Template reads ─────────────────────────────────────────────────────────

  async listTemplates(): Promise<AgentTemplate[]> {
    const cached = this.cache.get<AgentTemplate[]>('templates:all');
    if (cached) return cached;

    try {
      const result = await DataService.list('platform_agent_templates') as AgentTemplate[];
      if (result.length > 0) {
        this.cache.set('templates:all', result);
        return result;
      }
    } catch (err) {
      logger.warn('TEMPLATE_SERVICE', 'Backend unavailable, using seed templates', err);
    }

    this.cache.set('templates:all', AGENT_TEMPLATES);
    return AGENT_TEMPLATES;
  }

  async getTemplate(templateId: string): Promise<AgentTemplate | null> {
    const cacheKey = `templates:${templateId}`;
    const cached = this.cache.get<AgentTemplate>(cacheKey);
    if (cached) return cached;

    try {
      const result = await DataService.get('platform_agent_templates', templateId) as AgentTemplate | null;
      if (result) {
        this.cache.set(cacheKey, result);
        return result;
      }
    } catch (err) {
      logger.warn('TEMPLATE_SERVICE', `Backend get failed for template ${templateId}`, err);
    }

    const seed = AGENT_TEMPLATES.find(t => t.id === templateId) ?? null;
    if (seed) this.cache.set(cacheKey, seed);
    return seed;
  }

  async getGuardrails(): Promise<UniversalGuardrails> {
    const cached = this.cache.get<UniversalGuardrails>('guardrails:universal');
    if (cached) return cached;

    try {
      const result = await DataService.get('platform_guardrails', 'universal') as UniversalGuardrails | null;
      if (result) {
        this.cache.set('guardrails:universal', result);
        return result;
      }
    } catch (err) {
      logger.warn('TEMPLATE_SERVICE', 'Could not fetch guardrails from backend', err);
    }

    this.cache.set('guardrails:universal', PLATFORM_GUARDRAILS);
    return PLATFORM_GUARDRAILS;
  }

  // ─── Tenant config ──────────────────────────────────────────────────────────

  async getTenantConfig(organizationId: string): Promise<TenantAgentConfig | null> {
    const cacheKey = `tenant:${organizationId}:config`;
    const cached = this.cache.get<TenantAgentConfig>(cacheKey);
    if (cached) return cached;

    try {
      const result = await DataService.get('tenant_agent_configs', organizationId) as TenantAgentConfig | null;
      if (result) {
        this.cache.set(cacheKey, result);
        return result;
      }
    } catch (err) {
      logger.warn('TEMPLATE_SERVICE', `Could not fetch tenant config for ${organizationId}`, err);
    }

    return null;
  }

  async updateCustomizations(
    organizationId: string,
    updates: Partial<Pick<TenantAgentConfig, 'customPersona' | 'customSalesBlocks' | 'customHardRules' | 'businessContext'>>,
    updatedBy: string
  ): Promise<void> {
    await DataService.update('tenant_agent_configs', organizationId, {
      ...updates, updatedAt: new Date().toISOString(), updatedBy,
    });
    this.cache.invalidate(`tenant:${organizationId}:config`);
    this.cache.invalidate(`tenant:${organizationId}:resolved`);
  }

  async isOnboardingComplete(organizationId: string): Promise<boolean> {
    try {
      const config = await DataService.get('tenant_agent_configs', organizationId);
      // Não existe → tenant é anterior a este recurso, pula o wizard
      if (!config) return true;
      return (config as any)?.onboarding?.completed === true;
    } catch (_) {
      // Erro de permissão/rede → pula o wizard (conservador)
      return true;
    }
  }

  // ─── 3-layer config resolution ───────────────────────────────────────────────
  // Layer 1: Platform guardrails (always applied — platform_admin only can change)
  // Layer 2: Template defaults (segment-specific defaults)
  // Layer 3: Tenant customizations (within non-locked fields)

  async resolveConfig(organizationId: string): Promise<ResolvedAgentConfig | null> {
    const cacheKey = `tenant:${organizationId}:resolved`;
    const cached = this.cache.get<ResolvedAgentConfig>(cacheKey);
    if (cached) return cached;

    const [tenantConfig, guardrails] = await Promise.all([
      this.getTenantConfig(organizationId),
      this.getGuardrails(),
    ]);

    if (!tenantConfig) return null;

    const template = await this.getTemplate(tenantConfig.templateId);
    if (!template) {
      logger.error('TEMPLATE_SERVICE', `Template ${tenantConfig.templateId} not found for org ${organizationId}`);
      return null;
    }

    // Layer 2: template defaults
    const persona: AgentPersona = { ...template.defaultPersona };
    const salesBlocks: SalesBlocks = { ...template.defaultSalesBlocks };
    const hardRules: AgentHardRules = { ...template.defaultHardRules };

    // Layer 3: tenant customizations (skip locked fields)
    const locked = new Set(template.lockedFields);

    if (tenantConfig.customPersona) {
      for (const [k, v] of Object.entries(tenantConfig.customPersona)) {
        if (!locked.has(`persona.${k}`)) (persona as any)[k] = v;
      }
    }

    if (tenantConfig.customSalesBlocks) {
      for (const [k, v] of Object.entries(tenantConfig.customSalesBlocks)) {
        if (!locked.has(`salesBlocks.${k}`)) (salesBlocks as any)[k] = v;
      }
    }

    if (tenantConfig.customHardRules) {
      for (const [k, v] of Object.entries(tenantConfig.customHardRules)) {
        if (!locked.has(`hardRules.${k}`)) (hardRules as any)[k] = v;
      }
    }

    const resolved: ResolvedAgentConfig = {
      persona,
      salesBlocks,
      hardRules,
      businessContext: tenantConfig.businessContext ?? {},
      segment: tenantConfig.segment,
      templateId: tenantConfig.templateId,
      templateVersion: tenantConfig.templateVersion,
      guardrails,
      funnelSteps: template.funnelSteps,
      lockedFields: template.lockedFields,
    };

    this.cache.set(cacheKey, resolved);
    return resolved;
  }

  // ─── Apply template to tenant ────────────────────────────────────────────────

  async applyTemplate(
    organizationId: string,
    templateId: string,
    businessContext: BusinessContext,
    updatedBy: string
  ): Promise<void> {
    const template = await this.getTemplate(templateId);
    if (!template) throw new Error(`Template ${templateId} not found`);

    const tenantConfig: TenantAgentConfig = {
      organizationId,
      templateId,
      templateVersion: template.version,
      segment: template.segment,
      businessContext,
      onboarding: {
        completed: false,
        wizardVersion: 1,
      },
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    await DataService.save('tenant_agent_configs', organizationId, tenantConfig);

    this.cache.invalidatePrefix(`tenant:${organizationId}`);
    logger.info('TEMPLATE_SERVICE', `Template ${templateId} applied to ${organizationId}`);
  }

  async completeOnboarding(organizationId: string, updatedBy: string): Promise<void> {
    // `onboarding` é uma coluna jsonb única — sem dot-notation de update parcial como
    // no Firestore, precisa ler o objeto atual, mesclar e regravar por completo.
    const current = await DataService.get('tenant_agent_configs', organizationId);
    const onboarding = {
      ...(current?.onboarding ?? {}),
      completed: true,
      completedAt: new Date().toISOString(),
    };
    await DataService.update('tenant_agent_configs', organizationId, {
      onboarding,
      updatedAt: new Date().toISOString(),
      updatedBy,
    });
    this.cache.invalidatePrefix(`tenant:${organizationId}`);
  }

  // ─── Wizard state ────────────────────────────────────────────────────────────

  async saveWizardState(organizationId: string, state: object): Promise<void> {
    await DataService.save('tenant_onboarding_wizard_state', organizationId, {
      ...state, updatedAt: new Date().toISOString(),
    });
  }

  async getWizardState(organizationId: string): Promise<object | null> {
    try {
      return await DataService.get('tenant_onboarding_wizard_state', organizationId);
    } catch (err) {
      logger.warn('TEMPLATE_SERVICE', `Could not fetch wizard state for ${organizationId}`, err);
      return null;
    }
  }

  // ─── Seed backend ────────────────────────────────────────────────────────────

  async seedTemplates(): Promise<void> {
    logger.info('TEMPLATE_SERVICE', 'Seeding platform templates and guardrails');

    try {
      await DataService.save('platform_guardrails', 'universal', PLATFORM_GUARDRAILS);
      logger.info('TEMPLATE_SERVICE', 'Guardrails seeded');
    } catch (err) {
      logger.warn('TEMPLATE_SERVICE', 'Guardrails seed failed', err);
    }

    for (const template of AGENT_TEMPLATES) {
      try {
        await DataService.save('platform_agent_templates', template.id, template);
        logger.info('TEMPLATE_SERVICE', `Seeded template: ${template.id}`);
      } catch (err) {
        logger.warn('TEMPLATE_SERVICE', `Template ${template.id} seed failed`, err);
      }
    }

    this.cache.invalidatePrefix('templates:');
    this.cache.invalidate('guardrails:universal');
    logger.info('TEMPLATE_SERVICE', 'Seeding complete');
  }
}

export const templateService = TemplateService.getInstance();
