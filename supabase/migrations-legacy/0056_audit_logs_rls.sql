-- ============================================================
-- PARTE 56: Seguridad — audit_logs RLS habilitada + grants saneados
-- La tabla se creó en 0025 SIN `ENABLE ROW LEVEL SECURITY`; las
-- policies existían pero eran código muerto y anon/authenticated
-- tenían DML completo (leer/borrar/truncar auditoría de TODAS las
-- organizaciones, leak multi-tenant + destrucción de evidencia).
-- Fix: RLS ON + policies recreadas idempotentes + revoke de
-- privilegios que RLS no cubre (TRUNCATE, REFERENCES, DELETE,
-- UPDATE) y lectura/escritura anónima.
-- ============================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_admin" ON audit_logs;
CREATE POLICY "audit_select_admin" ON audit_logs
  FOR SELECT
  USING (public.get_my_role() = 'admin'
         AND organization_id = public.get_my_org_id());

DROP POLICY IF EXISTS "audit_insert_org" ON audit_logs;
CREATE POLICY "audit_insert_org" ON audit_logs
  FOR INSERT
  WITH CHECK (organization_id = public.get_my_org_id());

REVOKE TRUNCATE, REFERENCES, DELETE, UPDATE ON audit_logs FROM anon, authenticated;
REVOKE SELECT, INSERT ON audit_logs FROM anon;