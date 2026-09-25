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