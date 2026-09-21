-- ============================================================
-- PARTE 5: Row Level Security
-- ============================================================

-- Organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_view_members" ON organizations
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE organization_id = organizations.id AND blocked = false
    )
  );

CREATE POLICY "org_update_owner" ON organizations
  FOR UPDATE USING (auth.uid() = owner_id);

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_org" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.organization_id = profiles.organization_id
      AND p.blocked = false
    )
  );

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_org_admin" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.organization_id = profiles.organization_id
      AND p.role = 'admin' AND p.blocked = false
    )
  );

-- Shifts
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_select_org" ON shifts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = shifts.organization_id AND blocked = false
    )
  );

CREATE POLICY "shifts_all_admin" ON shifts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = shifts.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

-- Tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_org" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = tasks.organization_id AND blocked = false
    )
  );

CREATE POLICY "tasks_insert_admin" ON tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = tasks.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

CREATE POLICY "tasks_update_admin" ON tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = tasks.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

CREATE POLICY "tasks_delete_admin" ON tasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = tasks.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

CREATE POLICY "tasks_update_assigned" ON tasks
  FOR UPDATE USING (
    auth.uid() = assigned_to
  );
