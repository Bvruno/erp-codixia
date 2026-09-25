-- ============================================================
-- PARTE 67: Administradores de la plataforma (superadmins)
-- - platform_admins: lista blanca global de quienes pueden
--   gestionar owners/empresas desde la app de plataforma.
-- - Vive FUERA del modelo de organizaciones: un platform admin
--   no pertenece a ninguna org y no ve datos de tenant.
-- - RLS ON sin policies + REVOKE: solo service role accede.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users ON DELETE SET NULL
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Sin policies: ni anon ni authenticated leen/escriben. La API lo
-- consulta siempre con service role.
REVOKE ALL ON TABLE platform_admins FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS platform_admins_created_at_idx
  ON platform_admins (created_at DESC);
