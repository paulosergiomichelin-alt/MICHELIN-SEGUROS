ALTER TABLE "email_accounts" ALTER COLUMN "access_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ALTER COLUMN "refresh_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "imap_host" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "imap_port" integer;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "imap_secure" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "smtp_host" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "smtp_port" integer;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "smtp_secure" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "password_encrypted" text;
