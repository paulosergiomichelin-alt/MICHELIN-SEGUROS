
export type LeadStatus = 
  | 'Novo Lead' 
  | 'Em Atendimento' 
  | 'Aguardando Documento'
  | 'Em Cotação'
  | 'Proposta Enviada'
  | 'Negociação'
  | 'Fechado' 
  | 'Perdido';

export type LeadTemperature = 'quente' | 'morno' | 'frio';

export type UserRole = 'admin' | 'gestor' | 'atendente';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  userType: 'HUMAN' | 'AI' | 'IA_SYSTEM' | 'BOT_OPERACIONAL';
  profileId?: string; 
  permissions: Permissions;
  cargo?: string;
  photoURL?: string;
  status: 'active' | 'inactive' | 'suspended' | 'pending_setup';
  onboardingCompleted?: boolean;
  
  metrics?: {
    totalLeads: number;
    totalVendas: number;
    conversionRate: number;
    performanceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    lastUpdated: string;
  };

  activity?: {
    lastAccess: any;
    status: 'ONLINE' | 'AWAY' | 'OFFLINE';
  };

  createdAt: string;
  updatedAt: string;
  lastAccess?: string; // ISO
  theme?: Theme;
  chatPreferences?: ChatPreferences;
  organizationId?: string;
  superadmin?: boolean;
}

export interface SystemUser extends UserProfile {
  id?: string;
  activity?: {
    lastAccess: any;
    status: 'ONLINE' | 'AWAY' | 'OFFLINE';
  };
  metrics?: {
    totalLeads: number;
    totalVendas: number;
    conversionRate: number;
    performanceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    lastUpdated: string;
  };
  status: 'active' | 'inactive' | 'suspended' | 'pending_setup';
}

export enum DocumentProcessingStage {
  IDLE = 'idle',
  UPLOADED = 'uploaded',
  OCR_PROCESSING = 'ocr_processing',
  OCR_COMPLETED = 'ocr_completed',
  VALIDATION_PENDING = 'validation_pending',
  VALIDATION_OPEN = 'validation_open',
  VALIDATION_CONFIRMED = 'validation_confirmed',
  FIRESTORE_SYNCED = 'firestore_synced',
  HYDRATED = 'hydrated',
  FINALIZED = 'finalized',
  FAILED = 'failed'
}

export interface LeadDocument {
  id?: string;
  url: string;
  storagePath: string;
  fileName: string;
  uploadedAt: string;
  extractedData?: any;
  aiStatus?: string;
  documentType?: string;
  processingStage?: DocumentProcessingStage;
  validationSessionId?: string;
  validatedAt?: string;
  validatedBy?: string;
  updatedAt?: string;
  finalizedAt?: string;
}

export interface Lead {
  id: string;
  createdAt: string;
  updatedAt?: string;
  status: LeadStatus;
  temperature?: LeadTemperature;
  score?: number; // 0-10
  classificationReason?: string;
  lastInteraction?: string; // ISO
  nextAction?: string;
  stuckSince?: string; // ISO - para alertas de lead parado
  
  // Insurance info
  hasInsurance: boolean;
  insurer?: string;
  startDate?: string;
  insuranceExpiry?: string;
  
  // Personal info
  name: string;
  phone: string;
  phone2?: string;
  email?: string;
  cpf: string;
  birthDate: string;
  civilStatus: string;
  rg?: string;
  rgDataExpedicao?: string;
  rgOrgaoEmissor?: string;

  // Vehicle info
  plate: string;
  chassis: string;
  renavam?: string;
  brandModel?: string;
  zipCodeOvernight: string;
  addressOvernight?: string;
  numberOvernight?: string;
  isDifferentResidenceZip: boolean;
  zipCodeResidence?: string;
  addressResidence?: string;
  numberResidence?: string;
  fiduciaryAlienation: boolean;
  
  // Usage info
  serviceUsage: boolean; // 2+ days/week
  youngDriverHousehold: boolean; // 18-24 years
  
  // Owner info
  isOwnerDriver: boolean;
  ownerName?: string;
  ownerCpfCnpj?: string;
  
  // Documents (URLs or base64 for simulation)
  documents: {
    crv?: LeadDocument;
    cnh?: LeadDocument;
    policy?: LeadDocument;
    crvMetadata?: any;
    cnhMetadata?: any;
    policyMetadata?: any;
  };

  // Source info
  origin: string; // WhatsApp, Cadastro manual, Importação, Facebook, Instagram, etc.
  originDetails?: string; // Campanha específica, UTM, etc.

  // Commercial Intelligence
  vendedorId?: string; // ID do usuário que está atendendo
  ownerId?: string; // Alias para vendedorId
  insuranceType?: string; // Tipo de seguro (Auto, Vida, etc)
  closedAt?: string; // ISO - data de fechamento
  averageResponseTime?: number; // em minutos
  lastMessageText?: string;
  lastMessageSender?: 'user' | 'lead' | 'ai';
  isTest?: boolean;
  iaActive?: boolean; // Se true, a IA responde automaticamente. Se false, atendimento manual.
  version?: number; // Para controle de concorrência e consistência de eventos
  organizationId?: string;
  model?: string;
  city?: string;
  processingDocument?: boolean; // Lock global para evitar que a IA responda antes da extração de documentos
  documentStatus?: 'pendente' | 'em_processamento' | 'extraido_sucesso' | 'erro_qualidade' | 'erro_extracao';
  extractionCompletedAt?: string; // ISO
  aiStatus?: 'uploaded' | 'processing' | 'processed' | 'failed';
  licenseExpiry?: string;
  licenseCategory?: string;

  // Agent / Follow-up Responsibility
  responsibleAgentId?: string;
  responsibleAgentType?: 'ia' | 'humano' | 'IA_SYSTEM' | 'BOT_OPERACIONAL';
  responsibleAgentName?: string;
  nextReturnAt?: string; // ISO - para agenda de retorno integrada
  proximoRetorno?: string; // Alias para nextReturnAt

  // Michelin Seguros CRM specific fields (mappings or new)
  maritalStatus?: string;
  cepPernoite?: string;
  enderecoAuto?: string;
  logradouroPernoite?: string;
  numeroPernoite?: string;
  bairroPernoite?: string;
  cidadePernoite?: string;
  estadoPernoite?: string;
  statusLead?: LeadStatus;
  temperatura?: LeadTemperature;
  perfilLead?: string;
  iaEnabled?: boolean;
  justificativa?: string;
  chassi?: string;
  possuiSeguro?: boolean;
  perfilUso?: {
    comercial?: boolean;
    condutorJovem?: boolean;
  };
  proprietarioEhCondutor?: boolean;
  nomeProprietario?: string;
  cpfProprietario?: string;
  alienacaoFiduciaria?: boolean;
  financialInstitution?: string;
  restrictionType?: string;
  brokerName?: string;
  brokerSusep?: string;
  brokerPhone?: string;
  brokerEmail?: string;
  responsibleUserId?: string;
  cotacaoFiles?: {
    url: string;
    fileName: string;
    uploadedAt: string;
  }[];

  profileType?: 'residencial' | 'comercial' | 'frota' | 'direto' | 'indeciso' | 'desconfiado';
  contextSummary?: string;
  isRenewal?: boolean;

  // Seção 7 — Cotação Apresentada ao Cliente
  quoteAttachment?: {
    url: string;
    fileName: string;
    mimeType: string;
    uploadedBy: string;
    uploadedAt: string;
  };

  // Vínculo com módulo Clientes
  clienteId?: string;
}

export type NotificationType = 
  | 'lead_pronto_cotacao'
  | 'lead_quente'
  | 'lead_parado'
  | 'acao_necessaria'
  | 'erro_sistema'
  | 'oportunidade_venda'
  | 'geral';

export type NotificationPriority = 'baixa' | 'media' | 'alta' | 'critica';

export interface AppNotification {
  id: string;
  user_id: string; // recipient
  lead_id?: string; // optional lead reference
  leadName?: string; // Cache lead name for rendering links
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  read: boolean;
  created_at: string; // ISO
  created_by: 'ai' | 'sistema';
  organizationId?: string;
}

export type Theme = 'dark' | 'light';

export interface Permissions {
  canReadAllLeads: boolean;
  canWriteAllLeads: boolean;
  canDelete: boolean;
  canAccessSettings: boolean;
  canManageUsers: boolean;
  query?: boolean;
}

export interface UserMetrics {
  totalLeads: number;
  totalVendas: number;
  conversionRate: number;
  performanceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  lastUpdated: string;
}

export type LeadVisibility = 'own' | 'all';

export interface MenuPermission {
  menuItemKey: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface FieldPermission {
  menuItemKey: string;
  fieldKey: string;
  canView: boolean;
  canEdit: boolean;
}

export interface AccessProfile {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  leadVisibility: LeadVisibility;
  /** Mantido por compatibilidade — computado automaticamente a partir de menuPermissions */
  permissions: Permissions;
  menuPermissions: MenuPermission[];
  fieldPermissions: FieldPermission[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatPreferences {
  fontSize: number;
  chatZoom: number;
  messageSpacing: number;
  bubbleSize: number;
  leftWidth: number;
  rightWidth: number;
  theme?: Theme;
}

export interface VisualIdentityConfig {
  logoDark?: string;
  logoLight?: string;
  companyFaviconUrl?: string;
  primaryColor?: string;
  companyName: string;
  theme?: Theme; // Global default theme
  updatedAt?: string;
  updatedBy?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string; // ISO
  userId: string;
  userName?: string;
  ip?: string;
  userAgent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  browser?: string;
  os?: string;
  location?: string;
  action: string;
  category: 'auth' | 'leads' | 'team' | 'security' | 'intelligence' | 'system';
  entity: string; // lead, user, config, profile, notification, etc
  entityId?: string;
  before?: any; // Dados antes da alteração
  after?: any;  // Dados depois da alteração
  origin: 'ai' | 'USUARIO' | 'sistema';
  details?: string;
  status?: string;
  result?: 'success' | 'denied' | 'error';
  context?: string; // rota/página onde a ação ocorreu
  metadata?: any;
  organizationId?: string;
}

// ─── Módulo Clientes ──────────────────────────────────────────────────────────

export type ClienteStatus = 'ativo' | 'renovacao_proxima' | 'renovacao_vencida' | 'inativo';

export type ProdutoSeguro =
  | 'Automóvel' | 'Moto' | 'Caminhão' | 'Frota'
  | 'Residencial' | 'Empresarial' | 'Condomínio' | 'Equipamentos'
  | 'Vida Individual' | 'Vida Empresarial' | 'Saúde' | 'Odontológico'
  | 'RC Profissional' | 'Transporte' | 'Garantia Estendida'
  | 'Fiança Locatícia' | 'Consórcio' | 'Previdência Privada';

export const PRODUTOS_SEGURO: ProdutoSeguro[] = [
  'Automóvel','Moto','Caminhão','Frota',
  'Residencial','Empresarial','Condomínio','Equipamentos',
  'Vida Individual','Vida Empresarial','Saúde','Odontológico',
  'RC Profissional','Transporte','Garantia Estendida',
  'Fiança Locatícia','Consórcio','Previdência Privada',
];

export type ClienteDocumentoTipo = 'rg' | 'cpf' | 'cnh' | 'rc' | 'outros';

export interface ClienteDocumento {
  tipo: ClienteDocumentoTipo;
  url: string;
  path: string;
  nome: string;
  uploadedAt: string;
}

export interface Cliente {
  id: string;
  nome: string;
  cpf: string;
  rg?: string;
  rgDataExpedicao?: string;
  rgOrgaoEmissor?: string;
  dataNascimento?: string;
  estadoCivil?: string;
  profissao?: string;
  telefone: string;
  whatsapp?: string;
  email?: string;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  responsavelId?: string;
  observacoes?: string;
  leadOrigemId?: string;
  status: ClienteStatus;
  seguradoraAtualId?: string;
  produtoAtual?: ProdutoSeguro;
  dataRenovacao?: string;
  documentos?: ClienteDocumento[];
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ApoliceStatus = 'ativo' | 'cancelado' | 'expirado' | 'em_renovacao';

export type ApoliceAnexoTipo = 'carta_verde' | 'carteirinha' | 'boleto' | 'outros';

export interface ApoliceAnexo {
  url: string;
  path: string;
  nome: string;
  tipo: ApoliceAnexoTipo;
  uploadedAt: string;
}

export interface Apolice {
  id: string;
  clienteId: string;
  produto: ProdutoSeguro;
  seguradoraId: string;
  numeroApolice: string;
  inicioVigencia: string;
  fimVigencia: string;
  dataRenovacao: string;
  premioLiquido: number;
  valorTotal: number;
  comissao: number;
  comissaoPct?: number;
  corretoraOrigem?: string;
  observacoes?: string;
  status: ApoliceStatus;
  documentoUrl?: string;
  documentoPath?: string;
  documentoFileName?: string;
  documentoUploadedAt?: string;
  anexos?: ApoliceAnexo[];
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClienteHistoricoItem {
  id: string;
  clienteId: string;
  tipo: 'criado' | 'convertido' | 'apolice_criada' | 'apolice_renovada' | 'observacao' | 'status_alterado' | 'editado';
  descricao: string;
  usuarioId?: string;
  usuarioNome?: string;
  dadosExtras?: any;
  createdAt: string;
}

// ─── WhatsApp QR Code Integration (Evolution API) ────────────────────────────

export type WhatsAppSessionStatus = 'open' | 'connecting' | 'close' | 'qr';

export interface WhatsAppSession {
  id: string;
  userId: string;
  sessionName: string;
  phoneNumber?: string;
  profileName?: string;
  profilePicture?: string;
  status: WhatsAppSessionStatus;
  qrBase64?: string;
  qrCode?: string;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppConversation {
  id: string;
  sessionId: string;
  sessionName: string;
  phone: string;
  contactName: string;
  contactPicture?: string;
  leadId?: string;
  clienteId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastMessageDirection?: 'inbound' | 'outbound';
  unreadCount: number;
  presence?: 'available' | 'composing' | 'recording' | 'paused' | 'unavailable';
  organizationId?: string;
  updatedAt: string;
}

export interface WhatsAppMessage {
  id: string;
  conversationId: string;
  sessionId: string;
  direction: 'inbound' | 'outbound';
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | string;
  body?: string;
  phone?: string;
  contactName?: string;
  mediaUrl?: string;
  mediaPath?: string;
  mimeType?: string;
  fileName?: string;
  transcription?: string;
  timestamp: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | string;
  evolutionId?: string;
  organizationId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface IntegrationConfig {
  webhookUrl: string;
  apiKey: string;
  whatsappApiUrl: string;
  openrouterApiKey: string;
  metaVerifyToken?: string;
  metaAppSecret?: string;
  metaAccessToken?: string;
  whatsappPhoneId?: string;
  lastSync?: string;
}

export interface Message {
  id: string;
  leadId: string;
  sender: 'user' | 'lead' | 'ai';
  text: string;
  attachments?: {
    url: string;
    path?: string;
    type: 'image' | 'video' | 'file' | 'audio';
    mimeType: string;
    name?: string;
    transcription?: string;
  }[];
  timestamp: string;
  isTest?: boolean;
  aiProcessed?: boolean;
  aiProcessingStartedAt?: string;
  organizationId?: string;
}

export interface Flow {
  id: string;
  name: string;
  description: string; // Interpretação semântica da IA
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  layer?: "core" | "decision" | "sales" | "behavior";
  activationScore?: number;
  compressedDescription?: string;
  applicableStatus?: LeadStatus[];
  organizationId?: string;
}

// ─── Agent Brain Types ────────────────────────────────────────────────────────

export type LeadStep =
  | 'NOVO_LEAD'
  | 'COLETAR_NOME'
  | 'IDENTIFICAR_INTENCAO'
  | 'SOLICITAR_CNH'
  | 'SOLICITAR_CRLV'
  | 'SOLICITAR_APOLICE'
  | 'AGUARDANDO_COTACAO'
  | 'APRESENTAR_PROPOSTA'
  | 'NEGOCIACAO'
  | 'FECHAMENTO'
  | 'REENGAJAMENTO'
  | 'OCR_FALHOU';

export type SalesBlockKey =
  | 'quebra_de_gelo'
  | 'primeiro_atendimento'
  | 'reducao_atrito'
  | 'gatilhos_mentais'
  | 'objecoes'
  | 'venda_por_cenario'
  | 'urgencia_suave'
  | 'fechamento';

export interface AgentPersona {
  name: string;
  role: string;
  tone: string;
  usesFormalTreatment: boolean;
}

export interface AgentLLMConfig {
  provider: 'anthropic' | 'openrouter';
  model: string;
  maxTokens: number;
  temperature: number;
}

export type SalesBlocks = Record<SalesBlockKey, string>;

export interface AgentHardRules {
  blockExpiredLicense: boolean;
  requireCrlvForQuote: boolean;
  maxInactivityHours: number;
  escalateToHumanScore: number;
}

export interface TenantConfig {
  name: string;
  insurers: string[];
  organizationId: string;
}

// ─── Multi-Tenant Agent Templates ──────────────────────────────────────────────

export type BusinessSegment =
  | 'corretora_seguros'
  | 'imobiliaria'
  | 'clinica_odontologica'
  | 'concessionaria'
  | 'custom';

export interface FunnelStep {
  key: string;
  label: string;
  objective: string;
  requiredFields: string[];
  salesBlockKey?: SalesBlockKey;
  fallbackMessage: string;
}

export interface LeadFieldConfig {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'date' | 'select' | 'phone' | 'cpf';
  options?: string[];
}

export interface BusinessContext {
  insurers?: string[];
  insuranceTypes?: string[];
  propertyTypes?: string[];
  operationTypes?: ('venda' | 'aluguel')[];
  specialties?: string[];
  planTypes?: string[];
  brands?: string[];
  vehicleTypes?: string[];
  serviceAreas?: string[];
  workingHours?: string;
  website?: string;
  [key: string]: any;
}

export interface WizardQuestion {
  id: string;
  label: string;
  type: 'text' | 'select' | 'multiselect' | 'textarea' | 'toggle';
  placeholder?: string;
  options?: string[];
  required: boolean;
  segment?: BusinessSegment;
  contextKey: keyof BusinessContext;
  helpText?: string;
}

export interface PreviewMessage {
  sender: 'ai' | 'user';
  text: string;
  step?: LeadStep;
}

export interface WizardState {
  currentStep: number;
  completedSteps: number[];
  segment?: BusinessSegment;
  templateId?: string;
  persona: Partial<AgentPersona>;
  businessContext: Partial<BusinessContext>;
  tone?: string;
  completed: boolean;
  startedAt: string;
  completedAt?: string;
  lastSavedStep: number;
}

export interface AgentTemplate {
  id: string;
  segment: BusinessSegment;
  name: string;
  description: string;
  version: number;
  publishedAt: string;
  publishedBy: string;
  defaultPersona: AgentPersona;
  defaultSalesBlocks: SalesBlocks;
  defaultHardRules: AgentHardRules;
  funnelSteps: FunnelStep[];
  leadFields: LeadFieldConfig[];
  wizardQuestions: WizardQuestion[];
  previewConversation: PreviewMessage[];
  lockedFields: string[];
  suggestedInsurers?: string[];
}

export interface TenantAgentConfig {
  organizationId: string;
  templateId: string;
  templateVersion: number;
  segment: BusinessSegment;
  customPersona?: Partial<AgentPersona>;
  customSalesBlocks?: Partial<SalesBlocks>;
  customHardRules?: Partial<AgentHardRules>;
  businessContext: BusinessContext;
  onboarding: {
    completed: boolean;
    completedAt?: string;
    wizardVersion: number;
  };
  updatedAt: string;
  updatedBy: string;
}

export interface UniversalGuardrails {
  hardProhibitions: string[];
  hardRequirements: string[];
  maxResponseLength: number;
  maxQuestionsPerMessage: number;
  forbiddenPhrases: string[];
  version: number;
  updatedAt: string;
}

export interface ResolvedAgentConfig {
  persona: AgentPersona;
  salesBlocks: SalesBlocks;
  hardRules: AgentHardRules;
  businessContext: BusinessContext;
  segment: BusinessSegment;
  templateId: string;
  templateVersion: number;
  guardrails: UniversalGuardrails;
  funnelSteps: FunnelStep[];
  lockedFields: string[];
}

export interface AgentConfig {
  // Legacy fields (kept for backward compat with extraction config)
  name: string;
  persona: string;
  instructions: string;
  isActive: boolean;
  provider: 'openrouter';
  model: string;
  whatsappEnabled: boolean;
  openrouterApiKey?: string;

  // New: Structured persona (AgentBrain uses this)
  agentPersona?: AgentPersona;

  // New: LLM settings
  llm?: AgentLLMConfig;

  // New: Sales behavior blocks
  salesBlocks?: SalesBlocks;

  // New: Hard validation rules
  hardRules?: AgentHardRules;

  // New: feature flag — activates AgentBrain instead of deterministic strings
  useLLMAgent?: boolean;

  // Extraction specific config
  extraction: {
    name: string;
    persona: string;
    instructions: string;
    provider: 'openrouter';
    model: string;
  };

  // Follow-up & Scheduling
  followUps: {
    id: string;
    description: string;
    daysDelay: number;
    hoursDelay: number;
    condition: string;
    template: string;
    windows: {
      start: string;
      end: string;
      label: string;
    }[];
  }[];

  scheduling: {
    timezone: string;
    enabled: boolean;
  };

  // Legacy Sales Intelligence
  classificationRules?: string;
  automaticActions?: string;
  version?: number;
}

export type FollowUpStatus = 'pending' | 'executed' | 'cancelled';
export type FollowUpOrigin = 'ai' | 'manual';

export interface FollowUp {
  id: string;
  leadId: string;
  scheduledAt: string; // ISO
  status: FollowUpStatus;
  origin: FollowUpOrigin;
  contextSummary: string; // Resumo do contexto para retomada
  executedAt?: string;
  createdAt: string;
  updatedAt: string;
  organizationId?: string;
}

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  instructions: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
  totalLeads: number;
  sentCount: number;
  errorCount: number;
  respondedCount: number;
  createdAt: string;
  updatedAt: string;
  limit?: number;
  interval?: number; // em segundos
  filters?: {
    status?: LeadStatus[];
    temperature?: LeadTemperature[];
    origin?: string[];
    dateRange?: { start: string; end: string };
    noResponseOnly?: boolean;
  };
  organizationId?: string;
}

export interface CampaignLog {
  id: string;
  campaignId: string;
  leadId: string;
  leadName: string;
  status: 'sent' | 'error' | 'pending';
  message: string;
  error?: string;
  timestamp: string;
}

export interface LearningMemory {
  id: string;
  status: LeadStatus | string;
  temperature: string;
  profile: string;
  objectionType: string;
  argumentUsed: string;
  step: string;
  outcome: 'fechado' | 'perdido';
  timestamp: string; // ISO
  organizationId?: string;
}

export type PlanSaas = 'basico' | 'profissional' | 'enterprise';

export type StatusEmpresa = 'trial' | 'ativo' | 'suspenso' | 'inadimplente' | 'cancelado';

export interface Empresa {
  id: string;
  nomeRazaoSocial: string;
  nomeFantasia?: string;
  cnpj: string;
  emailCorporativo: string;
  telefone?: string;
  slug: string;
  logoUrl?: string;
  planoSaas: PlanSaas;
  limiteUsuarios: number;
  limiteLeadsMes: number;
  limiteStorageMb: number;
  status: StatusEmpresa;
  trialExpiraEm?: string;
  configuracoes?: Record<string, unknown>;
  timezone: string;
  idioma: string;
  ownerUserId?: string;
  organizationId: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface EmpresaMetricas {
  totalUsuarios: number;
  totalLeadsMes: number;
  limiteUsuarios: number;
  limiteLeadsMes: number;
  limiteStorageMb: number;
  planoSaas: PlanSaas;
  status: StatusEmpresa;
  trialExpiraEm?: string;
  diasRestantesTrial?: number;
}
