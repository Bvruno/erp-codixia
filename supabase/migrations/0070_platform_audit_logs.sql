-- ============================================================
-- PARTE 70: Auditoría de acciones de la plataforma
-- - platform_audit_logs: quién (actor), qué (acción), sobre qué
--   (entidad) y cuándo. Global, no por organización.
-- - RLS ON sin policies + REVOKE: solo service role.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES auth.users ON DELETE SET NULL,
  accion TEXT NOT NULL,
  entidad_tipo TEXT,
  entidad_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform_audit_logs FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS platform_audit_logs_created_idx
  ON platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_logs_entidad_idx
  ON platform_audit_logs (entidad_tipo, entidad_id);
