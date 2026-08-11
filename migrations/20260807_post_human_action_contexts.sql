-- Additive durable, one-time admin action contexts. Apply with the existing post-human migration runner.
CREATE TABLE IF NOT EXISTS post_human_action_contexts (
  token TEXT PRIMARY KEY CHECK (token ~ '^[A-Za-z0-9_-]{24}$'),
  admin_id TEXT NOT NULL CHECK (length(admin_id) BETWEEN 1 AND 128),
  negocio_id TEXT NOT NULL CHECK (length(negocio_id) BETWEEN 1 AND 128),
  contato_id TEXT NOT NULL CHECK (length(contato_id) BETWEEN 1 AND 128),
  numero_caso TEXT NOT NULL CHECK (length(numero_caso) BETWEEN 3 AND 80),
  customer_phone TEXT NOT NULL CHECK (length(customer_phone) BETWEEN 12 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS post_human_action_contexts_expiry ON post_human_action_contexts (expires_at)
WHERE consumed_at IS NULL;
