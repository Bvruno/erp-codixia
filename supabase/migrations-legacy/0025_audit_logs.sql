-- ============================================================
-- PARTE 25: Auditoría de cambios de configuración
-- Quién cambió qué, cuándo y con qué valores antes/después.
-- Solo admin lee; cualquier miembro de la org puede escribir
-- (los inserts van siempre desde la UI de configuración).
-- ============================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_audit_org ON audit_logs(organization_id, created_at DESC);

CREATE POLICY "audit_select_admin" ON audit_logs
  FOR SELECT USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

CREATE POLICY "audit_insert_org" ON audit_logs
  FOR INSERT WITH CHECK (organization_id = get_my_org_id());
