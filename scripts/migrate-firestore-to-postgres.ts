// Migração única Firestore → Postgres (Neon). Só leitura no Firestore, só escrita no
// Postgres (nunca o contrário) — ver docs/db-migration/SPEC.md §9 (rollback) e
// docs/superpowers/plans/2026-09-10-pg-migration-05-data-migration.md.
//
// Uso:
//   npx tsx scripts/migrate-firestore-to-postgres.ts                    # dry-run, tudo
//   npx tsx scripts/migrate-firestore-to-postgres.ts --write            # grava de fato, tudo
//   npx tsx scripts/migrate-firestore-to-postgres.ts --dry-run --collection=leads
import 'dotenv/config';
import { sql, getTableColumns } from 'drizzle-orm';
import { fsQueryFull, fsQueryFullSubcollection, fsGet } from '../_api/lib/adminFirebase';
import { getDb } from '../_api/lib/db';
import { pkColumn, pkPropertyName } from '../_api/data/entityMap';
import * as schema from '../_api/db/schema';

const WRITE = process.argv.includes('--write');
const ONLY = process.argv.find((a) => a.startsWith('--collection='))?.split('=')[1];
const CHUNK = 200;

// Firestore (via _api/lib/adminFirebase.ts) só guarda datas como string ISO — nunca o
// tipo Timestamp nativo (toValue()/fromFirestoreValue() não têm branch pra isso porque a
// escrita nunca produz um). Todas as colunas timestamp/date do schema usam mode:'string',
// então o valor certo pra passar é a própria string ISO, sem envolver em `new Date()`.
function isoStr(v: any): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function toDateOnly(v: any): string | null {
  return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null;
}

// Muitos registros reais (clientes, leads, cliente_relacionamentos) foram gravados com o
// literal "default" em organizationId em vez do id real da organização (bug histórico, de
// antes da organização real existir) — decisão do usuário (2026-09-10): remapear "default"
// para o id real, já que só existe uma organização em todo o sistema. Resolvido uma vez no
// início de main() e usado por toda transform que lê organizationId.
let DEFAULT_ORG_ID = 'default';

// Ausência do campo organizationId (undefined) é tratada igual ao literal "default": só
// existe uma organização real no sistema, e vários registros (messages, notifications,
// flows, email_accounts, campaigns) nunca gravaram organizationId no Firestore — sem esse
// fallback, orgScopeWhere() esconde esses registros de qualquer usuário não-superadmin
// depois do cutover (confirmado em produção: 54/56 mensagens e 12/12 notificações
// invisíveis). Ver docs/db-migration/SPEC.md §9.1.
function resolveOrgId(raw: any): string | null {
  if (raw === undefined || raw === null || raw === 'default') return DEFAULT_ORG_ID;
  return raw;
}

async function resolveDefaultOrgId(): Promise<string> {
  const orgs = await fsQueryFull('empresas', [], 100000);
  if (orgs.length !== 1) {
    console.warn(`[migrate] ${orgs.length} organizações encontradas (esperado exatamente 1) — mantendo organizationId="default" literal, que vai falhar a FK até isso ser resolvido manualmente.`);
    return 'default';
  }
  console.log(`[migrate] organizationId="default" será remapeado para "${orgs[0].id}" (única organização real do sistema)`);
  return orgs[0].id;
}

// Padrão oficial do Drizzle para upsert em lote: "set" precisa referenciar a pseudo-tabela
// `excluded` (o valor que seria inserido), não a própria coluna (`set: { col: table.col }`
// seria um UPDATE col = col, um no-op) — sem isso, reexecutar o script depois de editar um
// documento no Firestore nunca atualizaria a linha já migrada, quebrando a idempotência.
function buildConflictUpdateColumns(table: any, columnKeys: string[]) {
  const cols = getTableColumns(table);
  return columnKeys.reduce((acc: Record<string, any>, key) => {
    acc[key] = sql.raw(`excluded.${cols[key].name}`);
    return acc;
  }, {} as Record<string, any>);
}

// Tabelas fora da superfície do router genérico (_api/data/entityMap.ts) não têm entrada
// em PK_COLUMN — resolver a PK localmente pra essas em vez de poluir o mapa compartilhado.
const LOCAL_PK: Record<string, string> = {
  cliente_apolices: 'id',
  cliente_historico: 'id',
  lead_status_counts: 'status',
  system_metrics_dashboard: 'id',
};

function resolvePkProp(name: string): string {
  return LOCAL_PK[name] ?? pkPropertyName(name);
}

function resolvePkColumn(name: string, table: any): any {
  return table[resolvePkProp(name)];
}

async function insertRows(name: string, table: any, rows: Record<string, any>[], db: any): Promise<void> {
  if (rows.length === 0) return;
  const pkProp = resolvePkProp(name);
  const target = resolvePkColumn(name, table);
  // Migração roda contra o Firestore de produção AINDA EM USO (sem freeze de escrita) —
  // uma coleção sendo escrita entre duas leituras pode fazer a mesma PK aparecer 2x no
  // resultado (confirmado ao vivo em `settings`, cujo conteúdo mudou entre duas inspeções
  // de segundos de diferença). Um único INSERT com a mesma PK duas vezes no VALUES quebra
  // com "ON CONFLICT DO UPDATE command cannot affect row a second time" — dedupe mantendo
  // a última ocorrência (leitura mais recente) antes de montar os lotes.
  const deduped = new Map<any, Record<string, any>>();
  for (const row of rows) deduped.set(row[pkProp], row);
  const uniqueRows = [...deduped.values()];
  if (uniqueRows.length < rows.length) {
    console.warn(`[migrate] ${name}: ${rows.length - uniqueRows.length} linha(s) com PK duplicada dentro do lote (escrita concorrente em produção durante a leitura) — mantendo a última ocorrência de cada.`);
  }
  for (let i = 0; i < uniqueRows.length; i += CHUNK) {
    const chunk = uniqueRows.slice(i, i + CHUNK);
    const updateColumns = Object.keys(chunk[0]).filter((k) => k !== pkProp);
    await db.insert(table).values(chunk).onConflictDoUpdate({
      target,
      set: buildConflictUpdateColumns(table, updateColumns),
    });
    console.log(`[migrate] ${name}: ${Math.min(i + CHUNK, uniqueRows.length)}/${uniqueRows.length}`);
  }
}

type Migration = {
  name: string;
  table: any;
  fetch: () => Promise<Array<Record<string, any>>>;
  transform: (doc: any) => Record<string, any>;
};

async function migrateOne(m: Migration, db: any = getDb()): Promise<number> {
  console.log(`[migrate] Lendo Firestore/${m.name}...`);
  const docs = await m.fetch();
  console.log(`[migrate] ${docs.length} documentos encontrados em ${m.name}`);
  if (!WRITE) {
    console.log('[dry-run] Nenhuma escrita realizada.');
    return docs.length;
  }
  await insertRows(m.name, m.table, docs.map(m.transform), db);
  return docs.length;
}

// ── Transform: leads (schema híbrido — colunas promovidas + resto em `data jsonb`) ──────

const LEAD_PROMOTED_FIELDS = new Set([
  'id', 'organizationId', 'status', 'temperature', 'score', 'vendedorId', 'ownerId',
  'responsibleAgentId', 'responsibleAgentType', 'clienteId', 'origin', 'isTest', 'iaActive',
  'name', 'phone', 'email', 'cpf', 'plate', 'chassis', 'insurer', 'insuranceType',
  'closedAt', 'lastInteraction', 'nextReturnAt', 'stuckSince', 'version', 'createdAt', 'updatedAt',
]);

function transformLead(d: any): Record<string, any> {
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(d)) if (!LEAD_PROMOTED_FIELDS.has(k)) data[k] = v;
  const createdAt = isoStr(d.createdAt) ?? new Date().toISOString();
  return {
    id: d.id, organizationId: resolveOrgId(d.organizationId), status: d.status, temperature: d.temperature ?? null,
    score: d.score ?? null, vendedorId: d.vendedorId ?? null, ownerId: d.ownerId ?? null,
    responsibleAgentId: d.responsibleAgentId ?? null, responsibleAgentType: d.responsibleAgentType ?? null,
    clienteId: d.clienteId ?? null, origin: d.origin, isTest: !!d.isTest, iaActive: d.iaActive ?? null,
    name: d.name, phone: d.phone, email: d.email ?? null, cpf: d.cpf, plate: d.plate ?? null, chassis: d.chassis ?? null,
    insurer: d.insurer ?? null, insuranceType: d.insuranceType ?? null, closedAt: isoStr(d.closedAt),
    lastInteraction: isoStr(d.lastInteraction), nextReturnAt: isoStr(d.nextReturnAt ?? d.proximoRetorno),
    stuckSince: isoStr(d.stuckSince), version: d.version ?? 1, data,
    createdAt, updatedAt: isoStr(d.updatedAt) ?? createdAt,
  };
}

// ── Transforms diretos (1 coleção Firestore → 1 tabela) ──────────────────────────────────

const MIGRATIONS: Migration[] = [
  {
    name: 'empresas', table: schema.organizations,
    fetch: () => fsQueryFull('empresas', [], 100000),
    transform: (d) => ({
      id: d.id, nomeRazaoSocial: d.nomeRazaoSocial, nomeFantasia: d.nomeFantasia ?? null, cnpj: d.cnpj,
      emailCorporativo: d.emailCorporativo, telefone: d.telefone ?? null, slug: d.slug, logoUrl: d.logoUrl ?? null,
      planoSaas: d.planoSaas, limiteUsuarios: d.limiteUsuarios, limiteLeadsMes: d.limiteLeadsMes,
      limiteStorageMb: d.limiteStorageMb, status: d.status, trialExpiraEm: isoStr(d.trialExpiraEm),
      timezone: d.timezone, idioma: d.idioma, ownerUserId: d.ownerUserId ?? null,
      configuracoes: d.configuracoes ?? {}, fiscalSettings: d.fiscalSettings ?? null, certificate: d.certificate ?? null,
      fiscalServices: d.fiscalServices ?? null, createdAt: isoStr(d.criadoEm) ?? new Date().toISOString(),
      updatedAt: isoStr(d.atualizadoEm) ?? isoStr(d.criadoEm) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'seguradoras', table: schema.seguradoras,
    // A coleção Firestore 'seguradoras' está vazia em produção — nunca foi formalmente
    // cadastrada. `clientes.seguradoraAtualId`/`cliente_apolices.seguradoraId` guardam
    // slugs de texto livre (ex.: "allianz", "hdi") como se fossem FK pra ela. Sem isso, o
    // insert de clientes/apólices falha com FK violation. Cria um registro sintético
    // (id=nome=slug) pra cada seguradora realmente referenciada, preservando o dado
    // original (o slug) em vez de descartá-lo ou inventar um nome bonito que não existe.
    fetch: async () => {
      const real = await fsQueryFull('seguradoras', [], 100000);
      const realIds = new Set(real.map((d) => d.id));
      const usedIds = new Set<string>();
      const clientesDocs = await fsQueryFull('clientes', [], 100000);
      for (const c of clientesDocs) {
        if (c.seguradoraAtualId) usedIds.add(c.seguradoraAtualId);
        const apolices = await fsQueryFullSubcollection('clientes', c.id, 'apolices');
        for (const a of apolices) if (a.seguradoraId) usedIds.add(a.seguradoraId);
      }
      const synthetic = [...usedIds].filter((id) => !realIds.has(id)).map((id) => ({ id, nome: id }));
      if (synthetic.length > 0) {
        console.warn(`[migrate] seguradoras: ${synthetic.length} seguradora(s) referenciadas por clientes/apólices sem cadastro real no Firestore — criando registro sintético pra satisfazer a FK: ${synthetic.map((s) => s.id).join(', ')}`);
      }
      return [...real, ...synthetic];
    },
    transform: (d) => ({ id: d.id, nome: d.nome ?? d.name ?? d.id }),
  },
  {
    name: 'users', table: schema.users,
    // 2 dos 3 docs reais em produção estão corrompidos/incompletos: um é um duplicado
    // obsoleto sem email com organizationId="default" (não existe organização com esse
    // id), o outro é um doc-lixo cujo id literal é ".fieldPaths=superadmin" (artefato de
    // algum chamada antiga de fsUpdate('users', <id vazio/undefined>, {...}) — o id vazio
    // vira parte da querystring da URL, que o Firestore aceitou como nome de documento).
    // Nenhum dos dois é um usuário real (sem email, não dá pra logar) — pular com aviso em
    // vez de inventar um email ou deixar a constraint NOT NULL travar a migração inteira.
    fetch: async () => {
      const docs = await fsQueryFull('users', [], 100000);
      return docs.filter((d) => {
        if (!d.email) {
          console.warn(`[migrate] users: pulando doc "${d.id}" sem email (dado corrompido/incompleto no Firestore) — name=${d.name ?? '(vazio)'}, organizationId=${d.organizationId ?? '(vazio)'}`);
          return false;
        }
        return true;
      });
    },
    transform: (d) => ({
      id: d.id ?? d.uid, organizationId: resolveOrgId(d.organizationId), email: d.email, name: d.name, phone: d.phone ?? null,
      role: d.role, userType: d.userType, profileId: d.profileId ?? null, permissions: d.permissions ?? [], cargo: d.cargo ?? null,
      photoURL: d.photoURL ?? null, status: d.status, onboardingCompleted: d.onboardingCompleted ?? null, metrics: d.metrics ?? null,
      activity: d.activity ?? null, theme: d.theme ?? null, chatPreferences: d.chatPreferences ?? null, superadmin: !!d.superadmin,
      lastAccess: isoStr(d.lastAccess), createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'access_profiles', table: schema.accessProfiles,
    fetch: () => fsQueryFull('access_profiles', [], 100000),
    transform: (d) => ({
      id: d.id, name: d.name, description: d.description ?? null, isActive: d.isActive ?? true,
      leadVisibility: d.leadVisibility, permissions: d.permissions ?? [], menuPermissions: d.menuPermissions ?? [],
      fieldPermissions: d.fieldPermissions ?? [], createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'leads', table: schema.leads,
    fetch: () => fsQueryFull('leads', [], 100000),
    transform: transformLead,
  },
  {
    name: 'clientes', table: schema.clientes,
    fetch: () => fsQueryFull('clientes', [], 100000),
    transform: (d) => ({
      id: d.id, organizationId: resolveOrgId(d.organizationId), nome: d.nome, cpf: d.cpf, rg: d.rg ?? null,
      rgDataExpedicao: d.rgDataExpedicao ?? null, rgOrgaoEmissor: d.rgOrgaoEmissor ?? null,
      dataNascimento: toDateOnly(d.dataNascimento), estadoCivil: d.estadoCivil ?? null,
      profissao: d.profissao ?? null, sexo: d.sexo ?? null, telefone: d.telefone, whatsapp: d.whatsapp ?? null,
      email: d.email ?? null, cep: d.cep ?? null, rua: d.rua ?? null, numero: d.numero ?? null,
      complemento: d.complemento ?? null, bairro: d.bairro ?? null, cidade: d.cidade ?? null, estado: d.estado ?? null,
      responsavelId: d.responsavelId ?? null, observacoes: d.observacoes ?? null,
      leadOrigemId: d.leadOrigemId ?? null, status: d.status, seguradoraAtualId: d.seguradoraAtualId ?? null,
      produtoAtual: d.produtoAtual ?? null, dataRenovacao: toDateOnly(d.dataRenovacao), documentos: d.documentos ?? null,
      createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'cliente_relacionamentos', table: schema.clienteRelacionamentos,
    fetch: () => fsQueryFull('cliente_relacionamentos', [], 100000),
    transform: (d) => ({
      id: d.id, clienteId: d.clienteId, relatedClienteId: d.relatedClienteId,
      relatedClienteNome: d.relatedClienteNome, relatedClienteTelefone: d.relatedClienteTelefone ?? null,
      relatedClienteWhatsapp: d.relatedClienteWhatsapp ?? null, relatedClienteCPF: d.relatedClienteCPF ?? null,
      tipoRelacionamento: d.tipoRelacionamento, organizationId: resolveOrgId(d.organizationId),
      createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'messages', table: schema.messages,
    fetch: () => fsQueryFull('messages', [], 100000),
    transform: (d) => ({
      id: d.id, organizationId: resolveOrgId(d.organizationId), leadId: d.leadId, sender: d.sender, text: d.text,
      attachments: d.attachments ?? null, isTest: !!d.isTest, aiProcessed: d.aiProcessed ?? null,
      aiProcessingStartedAt: isoStr(d.aiProcessingStartedAt),
      timestamp: isoStr(d.timestamp) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
      createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'notifications', table: schema.notifications,
    fetch: () => fsQueryFull('notifications', [], 100000),
    transform: (d) => ({
      id: d.id, organizationId: resolveOrgId(d.organizationId), user_id: d.user_id, lead_id: d.lead_id ?? null,
      leadName: d.leadName ?? null, title: d.title, message: d.message, type: d.type, priority: d.priority,
      read: !!d.read, created_by: d.created_by, created_at: isoStr(d.created_at) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'follow_ups', table: schema.followUps,
    fetch: () => fsQueryFull('follow_ups', [], 100000),
    transform: (d) => ({
      id: d.id, organizationId: resolveOrgId(d.organizationId), leadId: d.leadId,
      scheduledAt: isoStr(d.scheduledAt) ?? new Date().toISOString(), status: d.status, origin: d.origin,
      contextSummary: d.contextSummary ?? null, executedAt: isoStr(d.executedAt),
      createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'flows', table: schema.flows,
    fetch: () => fsQueryFull('flows', [], 100000),
    transform: (d) => ({
      id: d.id, organizationId: resolveOrgId(d.organizationId), name: d.name, description: d.description,
      priority: d.priority, isActive: d.isActive ?? true, layer: d.layer ?? null,
      activationScore: d.activationScore ?? null, compressedDescription: d.compressedDescription ?? null,
      applicableStatus: d.applicableStatus ?? null,
      createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'learning_memory', table: schema.learningMemory,
    fetch: () => fsQueryFull('learning_memory', [], 100000),
    transform: (d) => ({
      id: d.id, organizationId: resolveOrgId(d.organizationId), status: d.status ?? null, temperature: d.temperature ?? null,
      profile: d.profile ?? null, objectionType: d.objectionType ?? null, argumentUsed: d.argumentUsed ?? null,
      step: d.step ?? null, outcome: d.outcome, timestamp: isoStr(d.timestamp) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'audit_logs', table: schema.auditLogs,
    fetch: () => fsQueryFull('audit_logs', [], 100000),
    transform: (d) => ({
      // Logs antigos usavam resource/resourceId em vez de entity/entityId, e às vezes não
      // tinham timestamp/category/origin — preservar o que existir, sem fabricar valores.
      id: d.id, organizationId: resolveOrgId(d.organizationId), timestamp: isoStr(d.timestamp) ?? isoStr(d.createdAt),
      userId: d.userId, userName: d.userName ?? null, ip: d.ip ?? null, userAgent: d.userAgent ?? null,
      deviceType: d.deviceType ?? null, browser: d.browser ?? null, os: d.os ?? null, location: d.location ?? null,
      action: d.action, category: d.category ?? null, entity: d.entity ?? d.resource ?? null,
      entityId: d.entityId ?? d.resourceId ?? null,
      before: d.before ?? null, after: d.after ?? null, origin: d.origin ?? null, details: d.details ?? null,
      status: d.status ?? null, result: d.result ?? null, context: d.context ?? null, metadata: d.metadata ?? null,
    }),
  },
  {
    name: 'system_logs', table: schema.systemLogs,
    fetch: () => fsQueryFull('system_logs', [], 100000),
    transform: (d) => ({
      id: d.id, timestamp: isoStr(d.timestamp) ?? new Date().toISOString(), level: d.level, category: d.category,
      message: d.message, userId: d.userId ?? null, userEmail: d.userEmail ?? null, action: d.action ?? null,
      details: d.details ?? null, stackTrace: d.stackTrace ?? null, source: d.source ?? null,
    }),
  },
  {
    name: 'dead_letter_queue', table: schema.deadLetterQueue,
    fetch: () => fsQueryFull('dead_letter_queue', [], 100000),
    transform: (d) => ({
      id: d.id, payload: d.payload, error: d.error ?? null, createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'migration_logs', table: schema.migrationLogs,
    fetch: () => fsQueryFull('migration_logs', [], 100000),
    transform: (d) => ({
      id: d.id, stats: d.stats, createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'campaigns', table: schema.campaigns,
    fetch: () => fsQueryFull('campaigns', [], 100000),
    transform: (d) => ({
      id: d.id, organizationId: resolveOrgId(d.organizationId), name: d.name, objective: d.objective ?? null,
      instructions: d.instructions ?? null, messageTemplate: d.messageTemplate ?? null,
      sessionName: d.sessionName ?? null, imageUrl: d.imageUrl ?? null, imageOrder: d.imageOrder ?? null,
      targetLeads: d.targetLeads ?? null, status: d.status, totalLeads: d.totalLeads ?? 0,
      sentCount: d.sentCount ?? 0, errorCount: d.errorCount ?? 0, respondedCount: d.respondedCount ?? 0,
      limit: d.limit ?? null, interval: d.interval ?? null, filters: d.filters ?? null,
      createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'campaign_log', table: schema.campaignLog,
    fetch: () => fsQueryFull('campaign_log', [], 100000),
    transform: (d) => ({
      id: d.id, campaignId: d.campaignId, leadId: d.leadId, leadName: d.leadName, status: d.status,
      message: d.message ?? null, error: d.error ?? null, timestamp: isoStr(d.timestamp) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'email_accounts', table: schema.emailAccounts,
    fetch: () => fsQueryFull('email_accounts', [], 100000),
    transform: (d) => ({
      id: d.id, organizationId: resolveOrgId(d.organizationId), userId: d.userId, provider: d.provider, email: d.email,
      displayName: d.displayName ?? null, isDefault: !!d.isDefault, status: d.status, lastSync: isoStr(d.lastSync),
      syncError: d.syncError ?? null, accessToken: d.accessToken, refreshToken: d.refreshToken,
      tokenExpiry: d.tokenExpiry ?? null, picture: d.picture ?? null,
      createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'email_settings', table: schema.emailSettings,
    fetch: () => fsQueryFull('email_settings', [], 100000),
    transform: (d) => ({
      userId: d.id, signature: d.signature ?? null, displayName: d.displayName ?? null,
      defaultAccountId: d.defaultAccountId ?? null, autoReply: d.autoReply ?? null,
      notifications: d.notifications ?? {}, updatedAt: isoStr(d.updatedAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'platform_agent_templates', table: schema.platformAgentTemplates,
    fetch: () => fsQueryFull('platform_agent_templates', [], 100000),
    transform: (d) => ({
      id: d.id, segment: d.segment, name: d.name, description: d.description ?? null, version: d.version,
      publishedAt: isoStr(d.publishedAt) ?? new Date().toISOString(), publishedBy: d.publishedBy,
      defaultPersona: d.defaultPersona, defaultSalesBlocks: d.defaultSalesBlocks, defaultHardRules: d.defaultHardRules,
      funnelSteps: d.funnelSteps, leadFields: d.leadFields, wizardQuestions: d.wizardQuestions,
      previewConversation: d.previewConversation ?? null, lockedFields: d.lockedFields ?? [],
      suggestedInsurers: d.suggestedInsurers ?? null,
    }),
  },
  {
    name: 'platform_guardrails', table: schema.platformGuardrails,
    fetch: () => fsQueryFull('platform_guardrails', [], 100000),
    transform: (d) => ({
      id: d.id, hardProhibitions: d.hardProhibitions, hardRequirements: d.hardRequirements,
      maxResponseLength: d.maxResponseLength, maxQuestionsPerMessage: d.maxQuestionsPerMessage,
      forbiddenPhrases: d.forbiddenPhrases, version: d.version,
      updatedAt: isoStr(d.updatedAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'whatsapp_sessions', table: schema.whatsappSessions,
    fetch: () => fsQueryFull('whatsapp_sessions', [], 100000),
    transform: (d) => ({
      id: d.id, organizationId: resolveOrgId(d.organizationId), userId: d.userId, sessionName: d.sessionName,
      phoneNumber: d.phoneNumber ?? null, profileName: d.profileName ?? null, profilePicture: d.profilePicture ?? null,
      status: d.status, qrBase64: d.qrBase64 ?? null, qrCode: d.qrCode ?? null,
      createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'metrics_raw', table: schema.metricsRaw,
    fetch: () => fsQueryFull('metrics_raw', [], 100000),
    // 100% dos docs reais são de uma versão antiga do código que gravava os campos soltos
    // (name/value/tags/timestamp/userId) em vez de aninhados em `event` — o código atual
    // (MetricsService.ts) já grava certo. Envolve o doc legado inteiro sem perder nada.
    transform: (d) => ({ id: d.id, event: d.event ?? d, createdAt: isoStr(d.createdAt) ?? new Date().toISOString() }),
  },
  {
    name: 'metrics_users', table: schema.metricsUsers,
    fetch: () => fsQueryFull('metrics_users', [], 100000),
    // Doc real não tem campo `day` nem `data` — id é literalmente "{uid}_{YYYY-MM-DD}"
    // (uids do Firebase Auth não têm underscore, então o primeiro "_" sempre separa os
    // dois) e os valores em si vêm como chaves de nível superior com ponto literal no
    // nome (ex.: "values.db_write_attempt" — Firestore aceita field paths com ponto como
    // nome de campo real, não como map aninhado). Deriva day do id e junta o resto em data.
    transform: (d) => {
      const day = d.id.slice(d.id.indexOf('_') + 1);
      const data: Record<string, any> = {};
      for (const [k, v] of Object.entries(d)) if (k !== 'id' && k !== 'userId') data[k] = v;
      return { id: d.id, userId: d.userId, day, data };
    },
  },
  {
    name: 'metrics_daily', table: schema.metricsDaily,
    fetch: () => fsQueryFull('metrics_daily', [], 100000),
    // Mesmo padrão de metrics_users: id É o day (formato "YYYY-MM-DD"), sem campo `data`
    // aninhado — valores vêm soltos com nome de campo contendo ponto literal.
    transform: (d) => {
      const data: Record<string, any> = {};
      for (const [k, v] of Object.entries(d)) if (k !== 'id') data[k] = v;
      return { day: d.id, data };
    },
  },
  {
    name: 'settings', table: schema.settings,
    fetch: () => fsQueryFull('settings', [], 100000),
    transform: (d) => ({
      id: d.id, data: d, createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    name: 'config', table: schema.config,
    fetch: () => fsQueryFull('config', [], 100000),
    transform: (d) => ({
      id: d.id, data: d, createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
      updatedAt: isoStr(d.updatedAt) ?? isoStr(d.createdAt) ?? new Date().toISOString(),
    }),
  },
];

const migrationByName = new Map(MIGRATIONS.map((m) => [m.name, m]));

// ── clientes/leads — FK circular (leads.clienteId ↔ clientes.leadOrigemId), constraints ─
// DEFERRABLE INITIALLY DEFERRED (Fase 1). Só funciona se as duas inserções rodarem na
// MESMA transação — cada uma isolada comitaria e validaria a FK sozinha, e os dados reais
// provavelmente têm ciclos (lead convertido em cliente apontando de volta pro lead).

async function runClientesLeadsPair(): Promise<{ clientes: number; leads: number }> {
  const clientesM = migrationByName.get('clientes')!;
  const leadsM = migrationByName.get('leads')!;
  console.log('[migrate] Lendo Firestore/clientes e Firestore/leads...');
  const [clientesDocs, leadsDocs] = await Promise.all([clientesM.fetch(), leadsM.fetch()]);
  console.log(`[migrate] ${clientesDocs.length} documentos em clientes, ${leadsDocs.length} documentos em leads`);
  if (!WRITE) {
    console.log('[dry-run] Nenhuma escrita realizada.');
    return { clientes: clientesDocs.length, leads: leadsDocs.length };
  }
  await getDb().transaction(async (tx: any) => {
    await insertRows('clientes', clientesM.table, clientesDocs.map(clientesM.transform), tx);
    await insertRows('leads', leadsM.table, leadsDocs.map(leadsM.transform), tx);
  });
  return { clientes: clientesDocs.length, leads: leadsDocs.length };
}

// ── clientes/{id}/apolices, clientes/{id}/historico (subcoleções) ───────────────────────

function transformApolice(clienteId: string, d: any): Record<string, any> {
  const createdAt = isoStr(d.createdAt) ?? new Date().toISOString();
  return {
    id: d.id, clienteId, produto: d.produto, seguradoraId: d.seguradoraId ?? null,
    numeroApolice: d.numeroApolice, inicioVigencia: toDateOnly(d.inicioVigencia),
    fimVigencia: toDateOnly(d.fimVigencia), dataRenovacao: toDateOnly(d.dataRenovacao),
    // Firestore guarda esses 3 campos SEM o sufixo "Centavos" (premioLiquido/valorTotal/
    // comissao) mas já em centavos — confirmado lendo o documento original. Ler
    // d.premioLiquidoCentavos (nome que nunca existiu no Firestore) zerava os 3 campos
    // silenciosamente via `?? 0` (achado 2026-09-13, 7/7 apólices migradas com valor zerado).
    premioLiquidoCentavos: d.premioLiquido ?? 0, valorTotalCentavos: d.valorTotal ?? 0,
    comissaoCentavos: d.comissao ?? 0, comissaoPct: d.comissaoPct ?? null,
    corretoraOrigem: d.corretoraOrigem ?? null, observacoes: d.observacoes ?? null, status: d.status,
    documentoUrl: d.documentoUrl ?? null, documentoPath: d.documentoPath ?? null,
    documentoFileName: d.documentoFileName ?? null, documentoUploadedAt: isoStr(d.documentoUploadedAt),
    anexos: d.anexos ?? null, createdAt, updatedAt: isoStr(d.updatedAt) ?? createdAt,
  };
}

function transformHistorico(clienteId: string, d: any): Record<string, any> {
  return {
    id: d.id, clienteId, tipo: d.tipo, descricao: d.descricao, usuarioId: d.usuarioId ?? null,
    usuarioNome: d.usuarioNome ?? null, dadosExtras: d.dadosExtras ?? null,
    createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
  };
}

async function migrateClienteSubcollection(
  name: string, sub: 'apolices' | 'historico', table: any, transform: (parentId: string, doc: any) => Record<string, any>,
): Promise<number> {
  const clientesDocs = await fsQueryFull('clientes', [], 100000);
  const rows: Record<string, any>[] = [];
  for (const c of clientesDocs) {
    const subDocs = await fsQueryFullSubcollection('clientes', c.id, sub);
    for (const doc of subDocs) rows.push(transform(c.id, doc));
  }
  console.log(`[migrate] clientes/*/${sub}: ${rows.length} documentos encontrados (via ${clientesDocs.length} clientes)`);
  if (!WRITE) {
    console.log('[dry-run] Nenhuma escrita realizada.');
    return rows.length;
  }
  await insertRows(name, table, rows, getDb());
  return rows.length;
}

// ── tenants/{orgId}/config/agent_config, tenants/{orgId}/onboarding/wizard_state (doc único por org) ──

function transformTenantAgentConfig(orgId: string, d: any): Record<string, any> {
  return {
    organizationId: orgId, templateId: d.templateId, templateVersion: d.templateVersion, segment: d.segment,
    customPersona: d.customPersona ?? null, customSalesBlocks: d.customSalesBlocks ?? null,
    customHardRules: d.customHardRules ?? null, businessContext: d.businessContext ?? {},
    onboarding: d.onboarding ?? {}, updatedAt: isoStr(d.updatedAt) ?? new Date().toISOString(),
    updatedBy: d.updatedBy,
  };
}

function transformOnboardingWizardState(orgId: string, d: any): Record<string, any> {
  return {
    organizationId: orgId, currentStep: d.currentStep ?? 0, completedSteps: d.completedSteps ?? [],
    segment: d.segment ?? null, templateId: d.templateId ?? null, persona: d.persona ?? null,
    businessContext: d.businessContext ?? null, tone: d.tone ?? null, completed: !!d.completed,
    startedAt: isoStr(d.startedAt) ?? new Date().toISOString(), completedAt: isoStr(d.completedAt),
    lastSavedStep: d.lastSavedStep ?? 0,
  };
}

async function migrateTenantSingleDoc(
  name: string, subPath: string, docId: string, table: any, transform: (orgId: string, doc: any) => Record<string, any>,
): Promise<number> {
  const orgs = await fsQueryFull('empresas', [], 100000);
  const rows: Record<string, any>[] = [];
  for (const org of orgs) {
    const doc = await fsGet(`tenants/${org.id}/${subPath}`, docId);
    if (doc) rows.push(transform(org.id, doc));
  }
  console.log(`[migrate] tenants/*/${subPath}/${docId}: ${rows.length} documentos encontrados (via ${orgs.length} organizações)`);
  if (!WRITE) {
    console.log('[dry-run] Nenhuma escrita realizada.');
    return rows.length;
  }
  await insertRows(name, table, rows, getDb());
  return rows.length;
}

// ── organizations/{orgId}/nfse, organizations/{orgId}/nfse_logs (subcoleções por org) ───

function transformNfseDocument(orgId: string, d: any): Record<string, any> {
  return {
    id: d.id, organizationId: orgId, numeroNota: d.numeroNota ?? null, numeroRps: d.numeroRps ?? null,
    protocolo: d.protocolo ?? null, codigoVerificacao: d.codigoVerificacao ?? null,
    clienteId: d.clienteId ?? null, clienteNome: d.clienteNome, clienteCpfCnpj: d.clienteCpfCnpj,
    clienteEmail: d.clienteEmail ?? null, clienteTelefone: d.clienteTelefone ?? null,
    clienteEndereco: d.clienteEndereco ?? null, servicoId: d.servicoId ?? null,
    descricaoServico: d.descricaoServico, valorServico: d.valorServico, quantidade: d.quantidade,
    desconto: d.desconto ?? null, valorISS: d.valorISS ?? null, aliquotaISS: d.aliquotaISS,
    issRetido: !!d.issRetido, naturezaOperacao: d.naturezaOperacao ?? null,
    exigibilidadeISS: d.exigibilidadeISS ?? null, observacoes: d.observacoes ?? null, ambiente: d.ambiente,
    provider: d.provider, status: d.status, xmlUrl: d.xmlUrl ?? null, pdfUrl: d.pdfUrl ?? null,
    errorMessage: d.errorMessage ?? null, createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
    emittedAt: isoStr(d.emittedAt), canceledAt: isoStr(d.canceledAt),
  };
}

function transformNfseLog(orgId: string, d: any): Record<string, any> {
  return {
    id: d.id, organizationId: orgId, nfseId: d.nfseId, action: d.action, status: d.status,
    message: d.message ?? null, providerResponse: d.providerResponse ?? null,
    processingTimeMs: d.processingTimeMs ?? null, userId: d.userId ?? null,
    createdAt: isoStr(d.createdAt) ?? new Date().toISOString(),
  };
}

async function migrateOrgSubcollection(
  name: string, sub: string, table: any, transform: (orgId: string, doc: any) => Record<string, any>,
): Promise<number> {
  const orgs = await fsQueryFull('empresas', [], 100000);
  const rows: Record<string, any>[] = [];
  for (const org of orgs) {
    const subDocs = await fsQueryFullSubcollection('organizations', org.id, sub);
    for (const doc of subDocs) rows.push(transform(org.id, doc));
  }
  console.log(`[migrate] organizations/*/${sub}: ${rows.length} documentos encontrados (via ${orgs.length} organizações)`);
  if (!WRITE) {
    console.log('[dry-run] Nenhuma escrita realizada.');
    return rows.length;
  }
  await insertRows(name, table, rows, getDb());
  return rows.length;
}

// ── system_metrics/dashboard (doc único) → system_metrics_dashboard (1 linha) + expande o
// mapa statusCounts em N linhas de lead_status_counts ─────────────────────────────────────

async function migrateSystemMetrics(): Promise<number> {
  const doc = await fsGet('system_metrics', 'dashboard');
  if (!doc) {
    console.log('[migrate] system_metrics/dashboard: documento não encontrado');
    return 0;
  }
  const statusCounts: Record<string, number> = doc.statusCounts ?? {};
  const statusEntries = Object.entries(statusCounts);
  console.log(`[migrate] system_metrics/dashboard: 1 documento (totalLeads=${doc.totalLeads ?? 0}, ${statusEntries.length} status)`);
  if (!WRITE) {
    console.log('[dry-run] Nenhuma escrita realizada.');
    return 1 + statusEntries.length;
  }
  const db = getDb();
  await db.insert(schema.systemMetricsDashboard).values({
    id: 'dashboard', totalLeads: doc.totalLeads ?? 0, updatedAt: isoStr(doc.updatedAt) ?? new Date().toISOString(),
  }).onConflictDoUpdate({
    target: schema.systemMetricsDashboard.id,
    set: { totalLeads: sql.raw('excluded.total_leads'), updatedAt: sql.raw('excluded.updated_at') },
  });
  for (const [status, count] of statusEntries) {
    await db.insert(schema.leadStatusCounts).values({ status, count }).onConflictDoUpdate({
      target: schema.leadStatusCounts.status,
      set: { count: sql.raw('excluded.count') },
    });
  }
  console.log(`[migrate] lead_status_counts: ${statusEntries.length}/${statusEntries.length}`);
  return 1 + statusEntries.length;
}

// ── Orquestração ─────────────────────────────────────────────────────────────────────────

const TABLE_BY_NAME: Record<string, any> = {
  ...Object.fromEntries(MIGRATIONS.map((m) => [m.name, m.table])),
  cliente_apolices: schema.clienteApolices,
  cliente_historico: schema.clienteHistorico,
  tenant_agent_configs: schema.tenantAgentConfigs,
  tenant_onboarding_wizard_state: schema.tenantOnboardingWizardState,
  nfse_documents: schema.nfseDocuments,
  nfse_logs: schema.nfseLogs,
};

async function runOne(name: string): Promise<number> {
  switch (name) {
    case 'cliente_apolices':
      return migrateClienteSubcollection('cliente_apolices', 'apolices', schema.clienteApolices, transformApolice);
    case 'cliente_historico':
      return migrateClienteSubcollection('cliente_historico', 'historico', schema.clienteHistorico, transformHistorico);
    case 'tenant_agent_configs':
      return migrateTenantSingleDoc('tenant_agent_configs', 'config', 'agent_config', schema.tenantAgentConfigs, transformTenantAgentConfig);
    case 'tenant_onboarding_wizard_state':
      return migrateTenantSingleDoc('tenant_onboarding_wizard_state', 'onboarding', 'wizard_state', schema.tenantOnboardingWizardState, transformOnboardingWizardState);
    case 'nfse_documents':
      return migrateOrgSubcollection('nfse_documents', 'nfse', schema.nfseDocuments, transformNfseDocument);
    case 'nfse_logs':
      return migrateOrgSubcollection('nfse_logs', 'nfse_logs', schema.nfseLogs, transformNfseLog);
    case 'system_metrics':
      return migrateSystemMetrics();
    default: {
      const m = migrationByName.get(name);
      if (!m) throw new Error(`Coleção desconhecida: "${name}"`);
      return migrateOne(m);
    }
  }
}

// Ordem respeita FKs (SPEC §7 / Global Constraints da Fase 5): organizations → seguradoras
// → users → access_profiles → (clientes+leads na mesma tx, FK circular) → subcoleções de
// clientes → o resto (sem dependência forte entre si) → tenants/nfse por org → métricas.
const FULL_ORDER = [
  'empresas', 'seguradoras', 'users', 'access_profiles',
  // clientes+leads tratados juntos abaixo, fora desta lista
  'cliente_apolices', 'cliente_historico', 'cliente_relacionamentos',
  'messages', 'notifications', 'follow_ups', 'flows', 'learning_memory',
  'audit_logs', 'system_logs', 'dead_letter_queue', 'migration_logs',
  'campaigns', 'campaign_log', 'email_accounts', 'email_settings',
  'platform_agent_templates', 'platform_guardrails',
  'tenant_agent_configs', 'tenant_onboarding_wizard_state',
  'nfse_documents', 'nfse_logs',
  'whatsapp_sessions', 'system_metrics',
  'metrics_raw', 'metrics_users', 'metrics_daily', 'settings', 'config',
];

async function main() {
  DEFAULT_ORG_ID = await resolveDefaultOrgId();

  const results: Array<{ name: string; count: number }> = [];

  if (ONLY) {
    if (ONLY === 'clientes' || ONLY === 'leads') {
      // Modo debug: roda isolado, sem a transação compartilhada (documentado na Task 1
      // como um atalho só para depuração de uma coleção por vez).
      results.push({ name: ONLY, count: await migrateOne(migrationByName.get(ONLY)!) });
    } else {
      results.push({ name: ONLY, count: await runOne(ONLY) });
    }
  } else {
    results.push({ name: 'empresas', count: await runOne('empresas') });
    results.push({ name: 'seguradoras', count: await runOne('seguradoras') });
    results.push({ name: 'users', count: await runOne('users') });
    results.push({ name: 'access_profiles', count: await runOne('access_profiles') });

    const pair = await runClientesLeadsPair();
    results.push({ name: 'clientes', count: pair.clientes });
    results.push({ name: 'leads', count: pair.leads });

    for (const name of FULL_ORDER.slice(4)) {
      results.push({ name, count: await runOne(name) });
    }
  }

  console.log('\n=== Resumo ===');
  for (const r of results) console.log(`${r.name}: ${r.count}`);

  if (WRITE) {
    console.log('\n=== Verificação de contagem ===');
    let allOk = true;
    for (const r of results) {
      const table = TABLE_BY_NAME[r.name];
      if (!table) continue; // ex.: 'system_metrics' escreve em 2 tabelas, verificado manualmente
      const [{ count }] = await getDb().select({ count: sql<number>`count(*)` }).from(table);
      const ok = Number(count) >= r.count;
      console.log(`${ok ? '[VERIFY-OK]' : '[VERIFY-FAIL]'} ${r.name}: Firestore=${r.count} Postgres=${count}`);
      if (!ok) allOk = false;
    }
    if (!allOk) {
      console.error('\nAlgumas contagens não bateram — revisar antes de prosseguir.');
      process.exitCode = 1;
      return;
    }
  }

  console.log('\nConcluído.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
