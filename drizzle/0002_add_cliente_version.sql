-- Trava de concorrência otimista pra clientes (mesmo padrão de leads.version) —
-- achado F-18 da auditoria: só leads tinha proteção contra dois usuários
-- editando o mesmo registro ao mesmo tempo.
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
