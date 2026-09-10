import { pgTable, text, boolean, integer, numeric, jsonb, timestamp, date, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';
import { leads } from './leads';

// Schema mínimo — nenhum call-site de escrita confirmado no inventário; confirmar campos
// reais (se existirem mais) durante a Fase 3, tarefa "clientes/apólices" (ver SPEC §4.7).
export const seguradoras = pgTable('seguradoras', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
});

export const clientes = pgTable('clientes', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  nome: text('nome').notNull(),
  cpf: text('cpf').notNull(),
  rg: text('rg'),
  rgDataExpedicao: text('rg_data_expedicao'),
  rgOrgaoEmissor: text('rg_orgao_emissor'),
  dataNascimento: date('data_nascimento'),
  estadoCivil: text('estado_civil'),
  profissao: text('profissao'),
  sexo: text('sexo'),
  telefone: text('telefone').notNull(),
  whatsapp: text('whatsapp'),
  email: text('email'),
  cep: text('cep'),
  rua: text('rua'),
  numero: text('numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  estado: text('estado'),
  responsavelId: text('responsavel_id'),
  observacoes: text('observacoes'),
  leadOrigemId: text('lead_origem_id').references(() => leads.id),
  status: text('status').notNull(),
  seguradoraAtualId: text('seguradora_atual_id').references(() => seguradoras.id),
  produtoAtual: text('produto_atual'),
  dataRenovacao: date('data_renovacao'),
  documentos: jsonb('documentos'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_clientes_org').on(t.organizationId),
]);

export const clienteApolices = pgTable('cliente_apolices', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id').notNull().references(() => clientes.id),
  produto: text('produto').notNull(),
  seguradoraId: text('seguradora_id').references(() => seguradoras.id),
  numeroApolice: text('numero_apolice').notNull(),
  inicioVigencia: date('inicio_vigencia').notNull(),
  fimVigencia: date('fim_vigencia').notNull(),
  dataRenovacao: date('data_renovacao').notNull(),
  premioLiquidoCentavos: integer('premio_liquido_centavos').notNull(),
  valorTotalCentavos: integer('valor_total_centavos').notNull(),
  comissaoCentavos: integer('comissao_centavos').notNull(),
  comissaoPct: numeric('comissao_pct'),
  corretoraOrigem: text('corretora_origem'),
  observacoes: text('observacoes'),
  status: text('status').notNull(),
  documentoUrl: text('documento_url'),
  documentoPath: text('documento_path'),
  documentoFileName: text('documento_file_name'),
  documentoUploadedAt: timestamp('documento_uploaded_at', { withTimezone: true, mode: 'string' }),
  anexos: jsonb('anexos'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_apolices_cliente').on(t.clienteId),
]);

export const clienteHistorico = pgTable('cliente_historico', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id').notNull().references(() => clientes.id),
  tipo: text('tipo').notNull(),
  descricao: text('descricao').notNull(),
  usuarioId: text('usuario_id'),
  usuarioNome: text('usuario_nome'),
  dadosExtras: jsonb('dados_extras'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_historico_cliente').on(t.clienteId),
]);

// O app grava 2 linhas por vínculo (A→B e B→A) — manter esse padrão, não normalizar
// para 1 linha (ver SPEC §4.7).
export const clienteRelacionamentos = pgTable('cliente_relacionamentos', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id').notNull().references(() => clientes.id),
  relatedClienteId: text('related_cliente_id').notNull().references(() => clientes.id),
  relatedClienteNome: text('related_cliente_nome').notNull(),
  relatedClienteTelefone: text('related_cliente_telefone'),
  relatedClienteWhatsapp: text('related_cliente_whatsapp'),
  relatedClienteCpf: text('related_cliente_cpf'),
  tipoRelacionamento: text('tipo_relacionamento').notNull(),
  organizationId: text('organization_id').references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
