-- ============================================================
-- PARTE 69: Suspensión de empresas, planes, suscripciones y
-- facturación manual + actividad de usuarios.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'activa'
    CHECK (status IN ('activa', 'suspendida')),
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS plan_id TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio_mensual NUMERIC(12, 2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'USD',
  limites JSONB NOT NULL DEFAULT '{}',
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (id, nombre, precio_mensual, moneda, limites, orden) VALUES
  ('base', 'Base', 0, 'USD', '{"miembros": 10, "almacenamiento_mb": 1024}', 1),
  ('pro', 'Pro', 49, 'USD', '{"miembros": 50, "almacenamiento_mb": 10240}', 2),
  ('empresa', 'Empresa', 149, 'USD', '{"miembros": 500, "almacenamiento_mb": 102400}', 3)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_plan_id_fkey'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS org_subscriptions (
  organization_id UUID PRIMARY KEY REFERENCES organizations ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('prueba', 'activa', 'mora', 'cancelada')),
  periodo_inicio DATE,
  periodo_fin DATE,
  precio_acordado NUMERIC(12, 2),
  notas TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations ON DELETE CASCADE,
  periodo DATE NOT NULL,
  monto NUMERIC(12, 2) NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'USD',
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagada', 'anulada')),
  pagado_at TIMESTAMPTZ,
  metodo TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE plans FROM anon, authenticated;
REVOKE ALL ON TABLE org_subscriptions FROM anon, authenticated;
REVOKE ALL ON TABLE billing_records FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS org_subscriptions_plan_idx
  ON org_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS billing_records_org_idx
  ON billing_records (organization_id, periodo DESC);
CREATE INDEX IF NOT EXISTS organizations_status_idx
  ON organizations (status);
CREATE INDEX IF NOT EXISTS profiles_last_active_idx
  ON profiles (last_active_at DESC);
