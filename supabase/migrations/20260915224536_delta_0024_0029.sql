-- ===== 0024_org_settings.sql =====
CREATE TABLE IF NOT EXISTS org_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations ON DELETE CASCADE,
  daily_hours INT DEFAULT 8 NOT NULL,
  weekly_hours INT DEFAULT 40 NOT NULL,
  timezone TEXT DEFAULT 'America/Mexico_City' NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP POLICY IF EXISTS "org_settings_select_own_org" ON org_settings;
CREATE POLICY "org_settings_select_own_org" ON org_settings
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "org_settings_all_admin" ON org_settings;
CREATE POLICY "org_settings_all_admin" ON org_settings
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "org_update_owner" ON organizations;
CREATE POLICY "org_update_owner" ON organizations
  FOR UPDATE USING (
    auth.uid() = owner_id
    OR (id = get_my_org_id() AND get_my_role() = 'admin')
  );

INSERT INTO org_settings (organization_id)
SELECT id FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

-- ===== 0025_audit_logs.sql =====
CREATE TABLE IF NOT EXISTS audit_logs (
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

CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id, created_at DESC);

DROP POLICY IF EXISTS "audit_select_admin" ON audit_logs;
CREATE POLICY "audit_select_admin" ON audit_logs
  FOR SELECT USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "audit_insert_org" ON audit_logs;
CREATE POLICY "audit_insert_org" ON audit_logs
  FOR INSERT WITH CHECK (organization_id = get_my_org_id());

-- ===== 0026_shift_color.sql =====
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#3b82f6';

-- ===== 0027_shift_crosses_midnight.sql =====
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS crosses_midnight BOOLEAN NOT NULL DEFAULT false;

-- ===== 0028_time_entries_rls.sql =====
DROP POLICY IF EXISTS "time_insert_own" ON time_entries;

DROP POLICY IF EXISTS "time_all_admin" ON time_entries;
CREATE POLICY "time_all_admin" ON time_entries
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "time_insert_own" ON time_entries;
CREATE POLICY "time_insert_own" ON time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "time_own_update" ON time_entries;
CREATE POLICY "time_own_update" ON time_entries
  FOR UPDATE USING (auth.uid() = user_id AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "time_own_delete" ON time_entries;
CREATE POLICY "time_own_delete" ON time_entries
  FOR DELETE USING (auth.uid() = user_id AND organization_id = get_my_org_id());

-- ===== 0029_security_hardening.sql =====
REVOKE EXECUTE ON FUNCTION debug_policies() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_rls_status() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_columns() FROM public, anon, authenticated;

DROP POLICY IF EXISTS "invitations_select_public" ON invitations;

CREATE OR REPLACE FUNCTION get_invitation(p_token TEXT)
RETURNS TABLE (organization_id UUID, role TEXT, status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.organization_id, i.role, i.status, i.expires_at
  FROM invitations i
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION get_invitation(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_invitation(TEXT) FROM public;