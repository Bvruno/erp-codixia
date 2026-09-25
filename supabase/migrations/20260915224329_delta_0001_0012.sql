SET check_function_bodies = off;

-- ===== 0001_tables_base.sql =====
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'collaborator')) DEFAULT 'collaborator',
  full_name TEXT NOT NULL,
  telegram_chat_id TEXT,
  blocked BOOLEAN DEFAULT false NOT NULL,
  daily_hours INT DEFAULT 8 NOT NULL,
  weekly_hours INT DEFAULT 40 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ===== 0002_tareas.sql =====
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('backlog','todo','in_progress','review','done','cancelled')) DEFAULT 'backlog',
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','urgent')) DEFAULT 'medium',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  due_date DATE,
  start_date DATE,
  estimated_hours NUMERIC(5,2),
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ===== 0003_invitaciones_horas.sql =====
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','expired','cancelled')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('worked','permission','overtime','makeup')) DEFAULT 'worked',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  date DATE NOT NULL,
  estimated_hours NUMERIC(4,2) NOT NULL,
  makeup_date DATE,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('task_assigned','task_status','note_added','invitation','permission')),
  title TEXT NOT NULL,
  body TEXT,
  reference_type TEXT,
  reference_id UUID,
  read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE UNIQUE NOT NULL,
  bot_token TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ===== 0004_indices.sql =====
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_notes_task ON task_notes(task_id);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read = false;

-- ===== 0005_rls.sql =====
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_view_members" ON organizations;
CREATE POLICY "org_view_members" ON organizations
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE organization_id = organizations.id AND blocked = false
    )
  );
DROP POLICY IF EXISTS "org_update_owner" ON organizations;
CREATE POLICY "org_update_owner" ON organizations
  FOR UPDATE USING (auth.uid() = owner_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_org" ON profiles;
CREATE POLICY "profiles_select_org" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.organization_id = profiles.organization_id
      AND p.blocked = false
    )
  );
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_org_admin" ON profiles;
CREATE POLICY "profiles_update_org_admin" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.organization_id = profiles.organization_id
      AND p.role = 'admin' AND p.blocked = false
    )
  );

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shifts_select_org" ON shifts;
CREATE POLICY "shifts_select_org" ON shifts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = shifts.organization_id AND blocked = false
    )
  );
DROP POLICY IF EXISTS "shifts_all_admin" ON shifts;
CREATE POLICY "shifts_all_admin" ON shifts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = shifts.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_select_org" ON tasks;
CREATE POLICY "tasks_select_org" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = tasks.organization_id AND blocked = false
    )
  );
DROP POLICY IF EXISTS "tasks_insert_admin" ON tasks;
CREATE POLICY "tasks_insert_admin" ON tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = tasks.organization_id
      AND role = 'admin' AND blocked = false
    )
  );
DROP POLICY IF EXISTS "tasks_update_admin" ON tasks;
CREATE POLICY "tasks_update_admin" ON tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = tasks.organization_id
      AND role = 'admin' AND blocked = false
    )
  );
DROP POLICY IF EXISTS "tasks_delete_admin" ON tasks;
CREATE POLICY "tasks_delete_admin" ON tasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = tasks.organization_id
      AND role = 'admin' AND blocked = false
    )
  );
DROP POLICY IF EXISTS "tasks_update_assigned" ON tasks;
CREATE POLICY "tasks_update_assigned" ON tasks
  FOR UPDATE USING (
    auth.uid() = assigned_to
  );

-- ===== 0006_rls_resto.sql =====
ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_select_task_org" ON task_notes;
CREATE POLICY "notes_select_task_org" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = task_notes.task_id
      AND p.organization_id = t.organization_id
      AND p.blocked = false
    )
  );
DROP POLICY IF EXISTS "notes_insert_org" ON task_notes;
CREATE POLICY "notes_insert_org" ON task_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = task_notes.task_id
      AND p.organization_id = t.organization_id
      AND p.blocked = false
    )
  );

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invitations_all_admin" ON invitations;
CREATE POLICY "invitations_all_admin" ON invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = invitations.organization_id
      AND role = 'admin' AND blocked = false
    )
  );
DROP POLICY IF EXISTS "invitations_select_public" ON invitations;
CREATE POLICY "invitations_select_public" ON invitations
  FOR SELECT USING (true);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_select_org" ON time_entries;
CREATE POLICY "time_select_org" ON time_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = time_entries.organization_id AND blocked = false
    )
  );
DROP POLICY IF EXISTS "time_insert_own" ON time_entries;
CREATE POLICY "time_insert_own" ON time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perm_select_org" ON permissions;
CREATE POLICY "perm_select_org" ON permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = permissions.organization_id AND blocked = false
    )
  );
DROP POLICY IF EXISTS "perm_insert_own" ON permissions;
CREATE POLICY "perm_insert_own" ON permissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "perm_update_admin" ON permissions;
CREATE POLICY "perm_update_admin" ON permissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = permissions.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_all_own" ON notifications;
CREATE POLICY "notif_all_own" ON notifications
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "telegram_all_admin" ON telegram_config;
CREATE POLICY "telegram_all_admin" ON telegram_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = telegram_config.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

-- ===== 0007_triggers.sql =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), 'admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ===== 0008_fix_rls_recursion.sql =====
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

DROP POLICY IF EXISTS "org_select_own" ON organizations;
CREATE POLICY "org_select_own" ON organizations
  FOR SELECT USING (id = get_my_org_id());
DROP POLICY IF EXISTS "org_update_owner" ON organizations;
CREATE POLICY "org_update_owner" ON organizations
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "profiles_select_own_org" ON profiles;
CREATE POLICY "profiles_select_own_org" ON profiles
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "shifts_select_own_org" ON shifts;
CREATE POLICY "shifts_select_own_org" ON shifts
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "shifts_all_admin" ON shifts;
CREATE POLICY "shifts_all_admin" ON shifts
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "tasks_select_own_org" ON tasks;
CREATE POLICY "tasks_select_own_org" ON tasks
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "tasks_insert_admin" ON tasks;
CREATE POLICY "tasks_insert_admin" ON tasks
  FOR INSERT WITH CHECK (get_my_role() = 'admin' AND organization_id = get_my_org_id());
DROP POLICY IF EXISTS "tasks_update_admin" ON tasks;
CREATE POLICY "tasks_update_admin" ON tasks
  FOR UPDATE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());
DROP POLICY IF EXISTS "tasks_delete_admin" ON tasks;
CREATE POLICY "tasks_delete_admin" ON tasks
  FOR DELETE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());
DROP POLICY IF EXISTS "tasks_update_assigned" ON tasks;
CREATE POLICY "tasks_update_assigned" ON tasks
  FOR UPDATE USING (auth.uid() = assigned_to);

DROP POLICY IF EXISTS "notes_select_in_org" ON task_notes;
CREATE POLICY "notes_select_in_org" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t WHERE t.id = task_notes.task_id AND t.organization_id = get_my_org_id()
    )
  );
DROP POLICY IF EXISTS "notes_insert_in_org" ON task_notes;
CREATE POLICY "notes_insert_in_org" ON task_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t WHERE t.id = task_notes.task_id AND t.organization_id = get_my_org_id()
    )
  );

DROP POLICY IF EXISTS "invitations_all_admin" ON invitations;
CREATE POLICY "invitations_all_admin" ON invitations
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());
DROP POLICY IF EXISTS "invitations_select_public" ON invitations;
CREATE POLICY "invitations_select_public" ON invitations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "time_select_own_org" ON time_entries;
CREATE POLICY "time_select_own_org" ON time_entries
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "time_insert_own" ON time_entries;
CREATE POLICY "time_insert_own" ON time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "perm_select_own_org" ON permissions;
CREATE POLICY "perm_select_own_org" ON permissions
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "perm_insert_own" ON permissions;
CREATE POLICY "perm_insert_own" ON permissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "perm_update_admin" ON permissions;
CREATE POLICY "perm_update_admin" ON permissions
  FOR UPDATE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "notif_all_own" ON notifications;
CREATE POLICY "notif_all_own" ON notifications
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "telegram_all_admin" ON telegram_config;
CREATE POLICY "telegram_all_admin" ON telegram_config
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- ===== 0009_perfil.sql =====
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es';

DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ===== 0010_datos_personales.sql =====
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phones TEXT[] DEFAULT '{}' NOT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contacts JSONB DEFAULT '[]' NOT NULL;

-- ===== 0010_invitaciones_rol.sql =====
ALTER TABLE invitations
  ADD COLUMN role TEXT NOT NULL DEFAULT 'collaborator'
  CHECK (role IN ('admin', 'collaborator'));

-- ===== 0011_rls_perfiles_hardening.sql =====
DROP POLICY IF EXISTS "profiles_update_org_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;

DROP POLICY IF EXISTS "profiles_update_owner" ON profiles;
CREATE POLICY "profiles_update_owner" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = profiles.organization_id
      AND o.owner_id = auth.uid()
    )
    AND auth.uid() <> profiles.id
  );

DROP POLICY IF EXISTS "profiles_update_admin_collaborators" ON profiles;
CREATE POLICY "profiles_update_admin_collaborators" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.organization_id = profiles.organization_id
      AND p.role = 'admin' AND p.blocked = false
    )
    AND auth.uid() <> profiles.id
    AND profiles.role = 'collaborator'
  );

DROP POLICY IF EXISTS "profiles_update_own_collaborator" ON profiles;
CREATE POLICY "profiles_update_own_collaborator" ON profiles
  FOR UPDATE USING (
    auth.uid() = profiles.id
    AND profiles.role = 'collaborator'
    AND profiles.blocked = false
  )
  WITH CHECK (profiles.role = 'collaborator');

DROP POLICY IF EXISTS "profiles_update_own_admin" ON profiles;
CREATE POLICY "profiles_update_own_admin" ON profiles
  FOR UPDATE USING (
    auth.uid() = profiles.id
    AND profiles.role = 'admin'
    AND profiles.blocked = false
  )
  WITH CHECK (profiles.role = 'admin');