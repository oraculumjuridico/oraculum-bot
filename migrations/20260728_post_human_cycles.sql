-- PostgreSQL 14+/Neon. UUIDs are supplied by the application; no extension required.
DO $preflight$
DECLARE
  missing_columns TEXT[];
BEGIN
  IF to_regclass('public.post_human_cycles') IS NOT NULL THEN
    SELECT array_agg(required.name ORDER BY required.name)
      INTO missing_columns
      FROM (VALUES
        ('cycle_id','uuid'), ('negocio_id','text'), ('numero_caso','text'),
        ('contato_id','text'), ('sequencia','integer'), ('status','text'),
        ('estado_documental','text'), ('send_attempt_id','uuid'),
        ('provider_message_id','text'), ('resultado_envio','text'),
        ('erro','text'), ('payload','jsonb'), ('created_at','timestamp with time zone'),
        ('updated_at','timestamp with time zone')
      ) AS required(name, type)
      LEFT JOIN information_schema.columns actual
        ON actual.table_schema='public'
       AND actual.table_name='post_human_cycles'
       AND actual.column_name=required.name
       AND actual.data_type=required.type
      WHERE actual.column_name IS NULL;
    IF missing_columns IS NOT NULL THEN
      RAISE EXCEPTION 'post_human_cycles_schema_incompatible: %', array_to_string(missing_columns, ',');
    END IF;
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS post_human_cycles (
  cycle_id UUID PRIMARY KEY,
  negocio_id TEXT NOT NULL CHECK (length(negocio_id) BETWEEN 1 AND 128),
  numero_caso TEXT NOT NULL CHECK (length(numero_caso) BETWEEN 3 AND 80),
  contato_id TEXT CHECK (contato_id IS NULL OR length(contato_id) BETWEEN 1 AND 128),
  sequencia INTEGER NOT NULL CHECK (sequencia > 0),
  status TEXT NOT NULL CHECK (status IN (
    'pending','analyzing','ready_to_send','sending','message_sent','awaiting_response',
    'human_review_required','failed_transient','failed_terminal','completed','cancelled'
  )),
  estado_documental TEXT CHECK (estado_documental IS NULL OR estado_documental IN (
    'SEM_DOCUMENTOS','DOCUMENTOS_PARCIAIS','DOCUMENTOS_COMPLETOS','DOCUMENTOS_NAO_ANALISADOS',
    'INFORMACOES_COMPLEMENTARES_PENDENTES','REVISAO_HUMANA_NECESSARIA'
  )),
  send_attempt_id UUID,
  provider_message_id TEXT CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 256),
  resultado_envio TEXT CHECK (resultado_envio IS NULL OR resultado_envio IN (
    'pendente','aceito_pelo_provider','entregue','falha','incerto'
  )),
  erro TEXT CHECK (erro IS NULL OR length(erro) <= 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (negocio_id, sequencia)
);

ALTER TABLE post_human_cycles
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS post_human_one_active_cycle_per_business
ON post_human_cycles (negocio_id)
WHERE status IN (
  'pending','analyzing','ready_to_send','sending','message_sent',
  'awaiting_response','human_review_required','failed_transient'
);
CREATE INDEX IF NOT EXISTS post_human_cycles_contact_active
ON post_human_cycles (contato_id, updated_at DESC)
WHERE contato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS post_human_cycles_recovery
ON post_human_cycles (status, updated_at);

CREATE OR REPLACE FUNCTION create_post_human_cycle(
  p_cycle_id UUID, p_negocio_id TEXT, p_numero_caso TEXT, p_contato_id TEXT
) RETURNS TABLE (
  cycle_id UUID, negocio_id TEXT, numero_caso TEXT, contato_id TEXT, sequencia INTEGER,
  status TEXT, estado_documental TEXT, send_attempt_id UUID, provider_message_id TEXT,
  resultado_envio TEXT, erro TEXT, payload JSONB, created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ, version INTEGER, already_existed BOOLEAN
) LANGUAGE plpgsql AS $$
DECLARE v_row post_human_cycles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_negocio_id, 0));
  SELECT * INTO v_row FROM post_human_cycles c
   WHERE c.negocio_id=p_negocio_id
     AND c.status IN ('pending','analyzing','ready_to_send','sending','message_sent',
       'awaiting_response','human_review_required','failed_transient')
   ORDER BY c.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_row.cycle_id,v_row.negocio_id,v_row.numero_caso,v_row.contato_id,
      v_row.sequencia,v_row.status,v_row.estado_documental,v_row.send_attempt_id,
      v_row.provider_message_id,v_row.resultado_envio,v_row.erro,v_row.payload,
      v_row.created_at,v_row.updated_at,v_row.version,TRUE;
    RETURN;
  END IF;
  INSERT INTO post_human_cycles(cycle_id,negocio_id,numero_caso,contato_id,sequencia,status)
  VALUES(p_cycle_id,p_negocio_id,p_numero_caso,p_contato_id,
    COALESCE((SELECT MAX(c.sequencia)+1 FROM post_human_cycles c WHERE c.negocio_id=p_negocio_id),1),
    'pending') RETURNING * INTO v_row;
  RETURN QUERY SELECT v_row.cycle_id,v_row.negocio_id,v_row.numero_caso,v_row.contato_id,
    v_row.sequencia,v_row.status,v_row.estado_documental,v_row.send_attempt_id,
    v_row.provider_message_id,v_row.resultado_envio,v_row.erro,v_row.payload,
    v_row.created_at,v_row.updated_at,v_row.version,FALSE;
END $$;
