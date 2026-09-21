-- Remoção completa da integração com WhatsApp (Evolution API + Meta WhatsApp
-- Cloud API) e do módulo de campanhas em massa (que só existia para WhatsApp).
-- Ordem respeita as foreign keys (tabelas dependentes primeiro).
DROP TABLE IF EXISTS "whatsapp_messages";
--> statement-breakpoint
DROP TABLE IF EXISTS "whatsapp_conversations";
--> statement-breakpoint
DROP TABLE IF EXISTS "whatsapp_sessions";
--> statement-breakpoint
DROP TABLE IF EXISTS "campaign_log";
--> statement-breakpoint
DROP TABLE IF EXISTS "campaigns";
