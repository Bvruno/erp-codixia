-- ============================================================
-- FIX RLS: eliminar recursión infinita en policies de profiles
-- ============================================================

-- Helper function: obtiene el organization_id del usuario actual
-- sin causar recursión porque usa SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid() AND blocked = false;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND blocked = false;
$$;

CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM profiles WHERE id = auth.uid() AND blocked = false;
$$;

-- ============================================================
-- BORRAR policies viejas conflictivas
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_org" ON profiles;
DROP POLICY IF EXISTS "profiles_update_org_admin" ON profiles;
DROP POLICY IF EXISTS "org_view_members" ON organizations;
DROP POLICY IF EXISTS "org_update_owner" ON organizations;
DROP POLICY IF EXISTS "shifts_select_org" ON shifts;
DROP POLICY IF EXISTS "shifts_all_admin" ON shifts;
DROP POLICY IF EXISTS "tasks_select_org" ON tasks;
DROP POLICY IF EXISTS "tasks_insert_admin" ON tasks;
DROP POLICY IF EXISTS "tasks_update_admin" ON tasks;
DROP POLICY IF EXISTS "tasks_delete_admin" ON tasks;
DROP POLICY IF EXISTS "tasks_update_assigned" ON tasks;
DROP POLICY IF EXISTS "notes_select_task_org" ON task_notes;
DROP POLICY IF EXISTS "notes_insert_org" ON task_notes;
DROP POLICY IF EXISTS "invitations_all_admin" ON invitations;
DROP POLICY IF EXISTS "invitations_select_public" ON invitations;
DROP POLICY IF EXISTS "time_select_org" ON time_entries;
DROP POLICY IF EXISTS "time_insert_own" ON time_entries;
DROP POLICY IF EXISTS "perm_select_org" ON permissions;
DROP POLICY IF EXISTS "perm_insert_own" ON permissions;
DROP POLICY IF EXISTS "perm_update_admin" ON permissions;
DROP POLICY IF EXISTS "notif_all_own" ON notifications;
DROP POLICY IF EXISTS "telegram_all_admin" ON telegram_config;

-- ============================================================
-- RECREAR policies sin recursión
-- ============================================================

-- Organizations
CREATE POLICY "org_select_own" ON organizations
  FOR SELECT USING (id = get_my_org_id());

CREATE POLICY "org_update_owner" ON organizations
  FOR UPDATE USING (auth.uid() = owner_id);

-- Profiles
CREATE POLICY "profiles_select_own_org" ON profiles
  FOR SELECT USING (organization_id = get_my_org_id());

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- Shifts
CREATE POLICY "shifts_select_own_org" ON shifts
  FOR SELECT USING (organization_id = get_my_org_id());

CREATE POLICY "shifts_all_admin" ON shifts
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- Tasks
CREATE POLICY "tasks_select_own_org" ON tasks
  FOR SELECT USING (organization_id = get_my_org_id());

CREATE POLICY "tasks_insert_admin" ON tasks
  FOR INSERT WITH CHECK (get_my_role() = 'admin' AND organization_id = get_my_org_id());

CREATE POLICY "tasks_update_admin" ON tasks
  FOR UPDATE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

CREATE POLICY "tasks_delete_admin" ON tasks
  FOR DELETE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

CREATE POLICY "tasks_update_assigned" ON tasks
  FOR UPDATE USING (auth.uid() = assigned_to);

-- Task Notes
CREATE POLICY "notes_select_in_org" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t WHERE t.id = task_notes.task_id AND t.organization_id = get_my_org_id()
    )
  );

CREATE POLICY "notes_insert_in_org" ON task_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t WHERE t.id = task_notes.task_id AND t.organization_id = get_my_org_id()
    )
  );

-- Invitations
CREATE POLICY "invitations_all_admin" ON invitations
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

CREATE POLICY "invitations_select_public" ON invitations
  FOR SELECT USING (true);

-- Time Entries
CREATE POLICY "time_select_own_org" ON time_entries
  FOR SELECT USING (organization_id = get_my_org_id());

CREATE POLICY "time_insert_own" ON time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Permissions
CREATE POLICY "perm_select_own_org" ON permissions
  FOR SELECT USING (organization_id = get_my_org_id());

CREATE POLICY "perm_insert_own" ON permissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "perm_update_admin" ON permissions
  FOR UPDATE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- Notifications
CREATE POLICY "notif_all_own" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- Telegram Config
CREATE POLICY "telegram_all_admin" ON telegram_config
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());
