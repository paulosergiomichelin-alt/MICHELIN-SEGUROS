CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"timestamp" timestamp with time zone NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"ip" text,
	"user_agent" text,
	"device_type" text,
	"browser" text,
	"os" text,
	"location" text,
	"action" text NOT NULL,
	"category" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"origin" text NOT NULL,
	"details" text,
	"status" text,
	"result" text,
	"context" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "dead_letter_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"stats" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_log" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"lead_name" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"error" text,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"objective" text,
	"instructions" text,
	"message_template" text,
	"session_name" text,
	"image_url" text,
	"image_order" text,
	"target_leads" jsonb,
	"status" text NOT NULL,
	"total_leads" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"responded_count" integer DEFAULT 0 NOT NULL,
	"limit" integer,
	"interval" integer,
	"filters" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"last_sync" timestamp with time zone,
	"sync_error" text,
	"oauth_tokens" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"signature" text,
	"display_name" text,
	"default_account_id" text,
	"auto_reply" jsonb,
	"notifications" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_apolices" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text NOT NULL,
	"produto" text NOT NULL,
	"seguradora_id" text,
	"numero_apolice" text NOT NULL,
	"inicio_vigencia" date NOT NULL,
	"fim_vigencia" date NOT NULL,
	"data_renovacao" date NOT NULL,
	"premio_liquido_centavos" integer NOT NULL,
	"valor_total_centavos" integer NOT NULL,
	"comissao_centavos" integer NOT NULL,
	"comissao_pct" numeric,
	"corretora_origem" text,
	"observacoes" text,
	"status" text NOT NULL,
	"documento_url" text,
	"documento_path" text,
	"documento_file_name" text,
	"anexos" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_historico" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"usuario_id" text,
	"usuario_nome" text,
	"dados_extras" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_relacionamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text NOT NULL,
	"related_cliente_id" text NOT NULL,
	"related_cliente_nome" text NOT NULL,
	"related_cliente_telefone" text,
	"related_cliente_whatsapp" text,
	"related_cliente_cpf" text,
	"tipo_relacionamento" text NOT NULL,
	"organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"nome" text NOT NULL,
	"cpf" text NOT NULL,
	"rg" text,
	"rg_data_expedicao" text,
	"rg_orgao_emissor" text,
	"data_nascimento" date,
	"estado_civil" text,
	"profissao" text,
	"sexo" text,
	"telefone" text NOT NULL,
	"whatsapp" text,
	"email" text,
	"cep" text,
	"rua" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"estado" text,
	"responsavel_id" text,
	"observacoes" text,
	"lead_origem_id" text,
	"status" text NOT NULL,
	"seguradora_atual_id" text,
	"produto_atual" text,
	"data_renovacao" date,
	"documentos" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seguradoras" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"lead_visibility" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"menu_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"field_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"nome_razao_social" text NOT NULL,
	"nome_fantasia" text,
	"cnpj" text NOT NULL,
	"email_corporativo" text NOT NULL,
	"telefone" text,
	"slug" text NOT NULL,
	"logo_url" text,
	"plano_saas" text NOT NULL,
	"limite_usuarios" integer NOT NULL,
	"limite_leads_mes" integer NOT NULL,
	"limite_storage_mb" integer NOT NULL,
	"status" text NOT NULL,
	"trial_expira_em" timestamp with time zone,
	"timezone" text NOT NULL,
	"idioma" text NOT NULL,
	"owner_user_id" text,
	"configuracoes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fiscal_settings" jsonb,
	"certificate" jsonb,
	"fiscal_services" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"role" text NOT NULL,
	"user_type" text NOT NULL,
	"profile_id" text,
	"permissions" jsonb NOT NULL,
	"cargo" text,
	"photo_url" text,
	"status" text NOT NULL,
	"onboarding_completed" boolean,
	"metrics" jsonb,
	"activity" jsonb,
	"theme" text,
	"chat_preferences" jsonb,
	"superadmin" boolean DEFAULT false NOT NULL,
	"last_access" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"priority" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"layer" text,
	"activation_score" numeric,
	"compressed_description" text,
	"applicable_status" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"lead_id" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"origin" text NOT NULL,
	"context_summary" text,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"status" text NOT NULL,
	"temperature" text,
	"score" numeric,
	"vendedor_id" text,
	"owner_id" text,
	"responsible_agent_id" text,
	"responsible_agent_type" text,
	"cliente_id" text,
	"origin" text NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"ia_active" boolean,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"cpf" text NOT NULL,
	"plate" text NOT NULL,
	"chassis" text NOT NULL,
	"insurer" text,
	"insurance_type" text,
	"closed_at" timestamp with time zone,
	"last_interaction" timestamp with time zone,
	"next_return_at" timestamp with time zone,
	"stuck_since" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"status" text NOT NULL,
	"temperature" text,
	"profile" text,
	"objection_type" text,
	"argument_used" text,
	"step" text,
	"outcome" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"lead_id" text NOT NULL,
	"sender" text NOT NULL,
	"text" text NOT NULL,
	"attachments" jsonb,
	"is_test" boolean DEFAULT false NOT NULL,
	"ai_processed" boolean,
	"ai_processing_started_at" timestamp with time zone,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text NOT NULL,
	"lead_id" text,
	"lead_name" text,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"priority" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_status_counts" (
	"status" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"day" date PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_raw" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_users" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "metrics_users_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "system_metrics_dashboard" (
	"id" text PRIMARY KEY DEFAULT 'dashboard' NOT NULL,
	"total_leads" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"session_id" text NOT NULL,
	"session_name" text NOT NULL,
	"phone" text NOT NULL,
	"contact_name" text,
	"contact_picture" text,
	"is_group" boolean DEFAULT false NOT NULL,
	"lead_id" text,
	"cliente_id" text,
	"last_message" text,
	"last_message_at" timestamp with time zone,
	"last_message_direction" text,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"presence" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"conversation_id" text NOT NULL,
	"session_id" text NOT NULL,
	"direction" text NOT NULL,
	"message_type" text NOT NULL,
	"body" text,
	"phone" text,
	"contact_name" text,
	"media_url" text,
	"media_path" text,
	"mime_type" text,
	"file_name" text,
	"transcription" text,
	"status" text,
	"evolution_id" text,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text NOT NULL,
	"session_name" text NOT NULL,
	"phone_number" text,
	"profile_name" text,
	"profile_picture" text,
	"status" text NOT NULL,
	"qr_base64" text,
	"qr_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfse_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"numero_nota" text,
	"numero_rps" text,
	"protocolo" text,
	"codigo_verificacao" text,
	"cliente_id" text,
	"cliente_nome" text NOT NULL,
	"cliente_cpf_cnpj" text NOT NULL,
	"cliente_email" text,
	"cliente_telefone" text,
	"cliente_endereco" jsonb,
	"servico_id" text,
	"descricao_servico" text NOT NULL,
	"valor_servico_centavos" integer NOT NULL,
	"quantidade" integer NOT NULL,
	"desconto_centavos" integer,
	"valor_iss_centavos" integer,
	"aliquota_iss" numeric NOT NULL,
	"iss_retido" boolean DEFAULT false NOT NULL,
	"natureza_operacao" text,
	"exigibilidade_iss" text,
	"observacoes" text,
	"ambiente" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"xml_url" text,
	"pdf_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emitted_at" timestamp with time zone,
	"canceled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nfse_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"nfse_id" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"provider_response" text,
	"processing_time_ms" integer,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_agent_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"segment" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"published_by" text NOT NULL,
	"default_persona" jsonb NOT NULL,
	"default_sales_blocks" jsonb NOT NULL,
	"default_hard_rules" jsonb NOT NULL,
	"funnel_steps" jsonb NOT NULL,
	"lead_fields" jsonb NOT NULL,
	"wizard_questions" jsonb NOT NULL,
	"preview_conversation" jsonb,
	"locked_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_insurers" jsonb
);
--> statement-breakpoint
CREATE TABLE "platform_guardrails" (
	"id" text PRIMARY KEY DEFAULT 'universal' NOT NULL,
	"hard_prohibitions" jsonb NOT NULL,
	"hard_requirements" jsonb NOT NULL,
	"max_response_length" integer NOT NULL,
	"max_questions_per_message" integer NOT NULL,
	"forbidden_phrases" jsonb NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_agent_configs" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"template_version" integer NOT NULL,
	"segment" text NOT NULL,
	"custom_persona" jsonb,
	"custom_sales_blocks" jsonb,
	"custom_hard_rules" jsonb,
	"business_context" jsonb NOT NULL,
	"onboarding" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_onboarding_wizard_state" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"current_step" integer NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"segment" text,
	"template_id" text,
	"persona" jsonb,
	"business_context" jsonb,
	"tone" text,
	"completed" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"last_saved_step" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_log" ADD CONSTRAINT "campaign_log_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_log" ADD CONSTRAINT "campaign_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_apolices" ADD CONSTRAINT "cliente_apolices_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_apolices" ADD CONSTRAINT "cliente_apolices_seguradora_id_seguradoras_id_fk" FOREIGN KEY ("seguradora_id") REFERENCES "public"."seguradoras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_historico" ADD CONSTRAINT "cliente_historico_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_relacionamentos" ADD CONSTRAINT "cliente_relacionamentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_relacionamentos" ADD CONSTRAINT "cliente_relacionamentos_related_cliente_id_clientes_id_fk" FOREIGN KEY ("related_cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_relacionamentos" ADD CONSTRAINT "cliente_relacionamentos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_seguradora_atual_id_seguradoras_id_fk" FOREIGN KEY ("seguradora_atual_id") REFERENCES "public"."seguradoras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_memory" ADD CONSTRAINT "learning_memory_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_session_id_whatsapp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."whatsapp_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_documents" ADD CONSTRAINT "nfse_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_documents" ADD CONSTRAINT "nfse_documents_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_logs" ADD CONSTRAINT "nfse_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_logs" ADD CONSTRAINT "nfse_logs_nfse_id_nfse_documents_id_fk" FOREIGN KEY ("nfse_id") REFERENCES "public"."nfse_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_agent_configs" ADD CONSTRAINT "tenant_agent_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_onboarding_wizard_state" ADD CONSTRAINT "tenant_onboarding_wizard_state_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_org_time" ON "audit_logs" USING btree ("organization_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_campaignlog_campaign" ON "campaign_log" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_apolices_cliente" ON "cliente_apolices" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_historico_cliente" ON "cliente_historico" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_clientes_org" ON "clientes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_users_org" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_followups_scheduled" ON "follow_ups" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_leads_org_status" ON "leads" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_leads_org_vendedor" ON "leads" USING btree ("organization_id","vendedor_id");--> statement-breakpoint
CREATE INDEX "idx_leads_cliente" ON "leads" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_messages_lead" ON "messages" USING btree ("lead_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "idx_wa_conv_session" ON "whatsapp_conversations" USING btree ("session_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_wa_msg_conv" ON "whatsapp_messages" USING btree ("conversation_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_nfse_org" ON "nfse_documents" USING btree ("organization_id");