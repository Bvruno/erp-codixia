-- ============================================================
-- PARTE 54: Registro centralizado de errores
-- Captura client + server en una tabla consultable.
-- Escritura SOLO vía RPC log_error() (validación + rate limit +
-- dedup por fingerprint). Lectura solo owner (desarrollador).
-- Alerta Telegram se marca en telegram_sent_at (evita re-alertas
-- salvo que el error reaparezca tras marcarse resolved).
-- ============================================================

SET check_function_bodies = off;

CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warning')),
  message TEXT NOT NULL CHECK (char_length(message) <= 4000),
  name TEXT,
  code TEXT,
  stack TEXT CHECK (stack IS NULL OR char_length(stack) <= 20000),
  route TEXT,
  method TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_agent TEXT,
  client_ip TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NOT NULL UNIQUE,
  count INT NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolved_at TIMESTAMPTZ,
  telegram_sent_at TIMESTAMPTZ
);

CREATE INDEX idx_error_logs_last_seen ON error_logs(last_seen DESC);
CREATE INDEX idx_error_logs_status ON error_logs(status, last_seen DESC);
CREATE INDEX idx_error_logs_org ON error_logs(organization_id, last_seen DESC);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Solo el owner de la org lee. Errores sin org (pre-auth) solo
-- se consultan por consola SQL, a propósito.
CREATE POLICY "error_logs_select_owner" ON error_logs
  FOR SELECT USING (is_org_owner(auth.uid()));

-- ============================================================
-- RPC log_error: único punto de escritura.
-- SECURITY DEFINER (owner=postgres) + search_path fijo.
-- Validaciones: tamaños, rate limit por IP, dedup por fingerprint.
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_error(
  p_source text,
  p_message text,
  p_level text DEFAULT 'error',
  p_name text DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_stack text DEFAULT NULL,
  p_route text DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_client_ip text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_fingerprint text DEFAULT NULL
)
RETURNS TABLE (id uuid, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_message text;
  v_fingerprint text;
  v_row record;
BEGIN
  -- Normalización y límites de tamaño (input no confiable)
  v_message := left(nullif(trim(p_message), ''), 4000);
  IF v_message IS NULL THEN
    v_message := 'unknown error';
  END IF;

  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object' OR p_context IS NULL THEN
    p_context := '{}'::jsonb;
  END IF;
  IF char_length(p_context::text) > 50000 THEN
    p_context := jsonb_build_object('truncated', true);
  END IF;

  IF p_level NOT IN ('error', 'warning') THEN p_level := 'error'; END IF;
  IF p_source NOT IN ('client', 'server') THEN p_source := 'server'; END IF;

  -- Fingerprint: si el cliente no lo manda, derivada de name+message
  v_fingerprint := left(nullif(trim(p_fingerprint), ''), 128);
  IF v_fingerprint IS NULL THEN
    v_fingerprint := md5(coalesce(p_name, '') || '|' || v_message);
  END IF;

  -- Rate limit anti-spam: máx 100 intentos/hora por IP
  IF p_client_ip IS NOT NULL AND (
    SELECT count(*) FROM public.error_logs
    WHERE client_ip = p_client_ip AND last_seen > now() - interval '1 hour'
  ) >= 100 THEN
    RETURN;
  END IF;

  INSERT INTO public.error_logs (
    source, level, message, name, code, stack, route, method,
    user_id, organization_id, user_agent, client_ip, context, fingerprint
  ) VALUES (
    p_source, p_level, v_message, left(p_name, 200), left(p_code, 20),
    left(p_stack, 20000), left(p_route, 500), left(p_method, 10),
    p_user_id, p_organization_id, left(p_user_agent, 500), left(p_client_ip, 64),
    p_context, v_fingerprint
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    count = error_logs.count + 1,
    last_seen = now(),
    status = 'open',
    resolved_at = NULL,
    telegram_sent_at = NULL
  RETURNING error_logs.id, (xmax = 0) AS is_new INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.is_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_error(text, text, text, text, text, text, text, text, uuid, uuid, text, text, jsonb, text)
  TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_error(text, text, text, text, text, text, text, text, uuid, uuid, text, text, jsonb, text)
  FROM public;