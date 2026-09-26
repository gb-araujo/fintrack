-- FASE 0: infraestrutura do banco, sem tabelas de domínio.
-- citext: comparação case-insensitive para e-mails de usuários (tabela users, FASE 1).
-- gen_random_uuid() já é nativo no PostgreSQL 13+ (não requer pgcrypto).
CREATE EXTENSION IF NOT EXISTS citext;
