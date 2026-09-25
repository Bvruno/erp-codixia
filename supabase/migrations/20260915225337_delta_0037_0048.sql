SET check_function_bodies = off;

-- ===== 0037_auth_owner_onboarding.sql =====
ALTER TABLE organizations
  ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), 'collaborator');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION public.claim_organization(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  UPDATE organizations
     SET owner_id = p_user_id
   WHERE id = p_org_id
     AND owner_id IS NULL
  RETURNING true INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN false;
  END IF;

  UPDATE profiles SET is_owner = true WHERE id = p_user_id;
  RETURN true;
END;
$$;

-- ===== 0038_invitations_created_by_nullable.sql =====
ALTER TABLE invitations
  ALTER COLUMN created_by DROP NOT NULL;

-- ===== 0039_onboarding_pending_profile.sql =====
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_pending BOOLEAN NOT NULL DEFAULT false;

-- ===== 0040_unique_sibling_names.sql =====
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_org_name
  ON workspaces (organization_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_folders_scope_name
  ON workspace_folders (
    workspace_id,
    COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'),
    name
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_lists_container_name
  ON task_lists (COALESCE(folder_id, workspace_id), name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_container_name
  ON documents (COALESCE(folder_id, workspace_id), name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mind_maps_container_name
  ON mind_maps (COALESCE(folder_id, workspace_id), name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_todos_container_name
  ON todos (COALESCE(folder_id, workspace_id), name);

-- ===== 0041_task_completed_at.sql =====
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.handle_task_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'done' THEN
      NEW.completed_at = COALESCE(NEW.completed_at, now());
    ELSIF OLD.status = 'done' THEN
      NEW.completed_at = NULL;
    END IF;
    INSERT INTO task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'done' THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_status ON tasks;
CREATE TRIGGER trg_task_status
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION handle_task_status_change();

UPDATE tasks
   SET completed_at = updated_at
 WHERE status = 'done'
   AND completed_at IS NULL;

-- ===== 0042_todo_cycle_bounds_fix.sql =====
DROP FUNCTION IF EXISTS public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.todo_cycle_bounds(
  p_frequency TEXT,
  p_interval_days INT,
  p_now TIMESTAMPTZ,
  p_timezone TEXT,
  p_week_start INT,
  p_time TEXT
)
RETURNS TABLE (cycle_start TIMESTAMPTZ, cycle_end TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
BEGIN
  IF p_frequency = 'weekly' THEN
    v_start := (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
      + (p_week_start - 1) * INTERVAL '1 day') AT TIME ZONE p_timezone;
    v_end := v_start + INTERVAL '7 days';
  ELSIF p_frequency = 'interval' THEN
    v_start := ((p_now AT TIME ZONE p_timezone)::date
      - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
    ) AT TIME ZONE p_timezone;
    v_end := v_start + p_interval_days * INTERVAL '1 day';
  ELSE
    v_start := date_trunc('day', p_now AT TIME ZONE p_timezone) AT TIME ZONE p_timezone;
    v_end := v_start + CASE
      WHEN p_time ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN (p_time::time - TIME '00:00')
      ELSE INTERVAL '1 day'
    END;
    IF v_end <= v_start THEN
      v_end := v_start + INTERVAL '1 day';
    END IF;
  END IF;

  cycle_start := v_start;
  cycle_end := v_end;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) FROM public;

-- ===== 0043_invite_hardening.sql =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE invitations
SET token = encode(digest(token, 'sha256'), 'hex')
WHERE token !~ '^[0-9a-f]{64}$';

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

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
  )
  WITH CHECK (profiles.role = 'collaborator');

DROP POLICY IF EXISTS "perm_insert_own" ON permissions;
CREATE POLICY "perm_insert_own" ON permissions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND organization_id = get_my_org_id()
  );

DROP POLICY IF EXISTS "perm_delete_admin" ON permissions;
CREATE POLICY "perm_delete_admin" ON permissions
  FOR DELETE USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
  );

DROP POLICY IF EXISTS "perm_delete_own_pending" ON permissions;
CREATE POLICY "perm_delete_own_pending" ON permissions
  FOR DELETE USING (
    auth.uid() = user_id
    AND status = 'pending'
    AND organization_id = get_my_org_id()
  );

CREATE OR REPLACE FUNCTION get_invitation(p_token TEXT)
RETURNS TABLE (organization_id UUID, role TEXT, status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.organization_id, i.role, i.status, i.expires_at
  FROM public.invitations i
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION get_invitation(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_invitation(TEXT) FROM public;

DROP POLICY IF EXISTS "invitations_manage_admin" ON invitations;
DROP POLICY IF EXISTS "perm_select_org" ON permissions;
DROP POLICY IF EXISTS "profiles_select_same_org" ON profiles;

-- ===== 0044_invite_token_trigger.sql =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE invitations
SET token = encode(digest(token, 'sha256'), 'hex')
WHERE token !~ '^[0-9a-f]{64}$';

CREATE OR REPLACE FUNCTION hash_invite_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.token !~ '^[0-9a-f]{64}$' THEN
    NEW.token := encode(extensions.digest(NEW.token, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitations_hash_token ON invitations;
CREATE TRIGGER trg_invitations_hash_token
  BEFORE INSERT OR UPDATE OF token ON invitations
  FOR EACH ROW EXECUTE FUNCTION hash_invite_token();

-- ===== 0045_access_isolation.sql =====
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'org'
  CHECK (access_mode IN ('org', 'grants_only'));

CREATE OR REPLACE FUNCTION get_my_access_mode()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(p.access_mode, 'org')
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.blocked = false;
$$;

CREATE OR REPLACE FUNCTION folder_navigation_visible(p_folder_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.folder_id = p_folder_id
      AND public.entity_permission('document', d.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.mind_maps m
    WHERE m.folder_id = p_folder_id
      AND public.entity_permission('mindmap', m.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.todos t
    WHERE t.folder_id = p_folder_id
      AND public.entity_permission('todo', t.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.task_lists l
    WHERE l.folder_id = p_folder_id
      AND public.entity_permission('list', l.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.workspace_folders f
    WHERE f.parent_folder_id = p_folder_id
      AND public.folder_navigation_visible(f.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION workspace_navigation_visible(p_ws_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.workspace_id = p_ws_id AND d.folder_id IS NULL
      AND public.entity_permission('document', d.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.mind_maps m
    WHERE m.workspace_id = p_ws_id AND m.folder_id IS NULL
      AND public.entity_permission('mindmap', m.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.todos t
    WHERE t.workspace_id = p_ws_id AND t.folder_id IS NULL
      AND public.entity_permission('todo', t.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.task_lists l
    WHERE l.workspace_id = p_ws_id AND l.folder_id IS NULL
      AND public.entity_permission('list', l.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.workspace_folders f
    WHERE f.workspace_id = p_ws_id AND f.parent_folder_id IS NULL
      AND public.folder_navigation_visible(f.id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_access_mode() TO authenticated;
GRANT EXECUTE ON FUNCTION folder_navigation_visible(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION workspace_navigation_visible(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION get_my_access_mode() FROM public, anon;
REVOKE EXECUTE ON FUNCTION folder_navigation_visible(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION workspace_navigation_visible(UUID) FROM public, anon;

DROP POLICY IF EXISTS "workspaces_select_org" ON workspaces;
CREATE POLICY "workspaces_select_org" ON workspaces
  FOR SELECT USING (
    get_my_role() = 'admin'
    OR entity_permission('workspace', id) IS NOT NULL
    OR (get_my_access_mode() = 'org' AND visibility = 'public')
    OR (get_my_access_mode() = 'grants_only' AND workspace_navigation_visible(id))
  );

DROP POLICY IF EXISTS "folders_select_org" ON workspace_folders;
CREATE POLICY "folders_select_org" ON workspace_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_folders.workspace_id
        AND w.organization_id = get_my_org_id()
    )
    AND (
      get_my_role() = 'admin'
      OR entity_permission('folder', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
      OR (get_my_access_mode() = 'grants_only' AND folder_navigation_visible(id))
    )
  );

DROP POLICY IF EXISTS "task_lists_select_org" ON task_lists;
CREATE POLICY "task_lists_select_org" ON task_lists
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR entity_permission('list', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "documents_select_org" ON documents;
CREATE POLICY "documents_select_org" ON documents
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR entity_permission('document', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "mind_maps_select_org" ON mind_maps;
CREATE POLICY "mind_maps_select_org" ON mind_maps
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR entity_permission('mindmap', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "todos_select_org" ON todos;
CREATE POLICY "todos_select_org" ON todos
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR entity_permission('todo', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
    )
  );

-- ===== 0046_realtime_publication.sql =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'entity_visibility') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_visibility;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'workspaces') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workspaces;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_folders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_folders;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_lists') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_lists;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'documents') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'mind_maps') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mind_maps;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'todos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.todos;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'invitations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invitations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'schedules') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
  END IF;
END $$;

-- ===== 0047_permission_model.sql =====
CREATE OR REPLACE FUNCTION entity_permission(e_type TEXT, e_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE scope(depth, t, id) AS (
    SELECT 0, e_type::text, e_id::uuid
    UNION ALL
    SELECT s.depth + 1,
      CASE
        WHEN s.t = 'folder' THEN 'folder'
        WHEN s.t = 'list' THEN (CASE WHEN (SELECT folder_id FROM public.task_lists WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'document' THEN (CASE WHEN (SELECT folder_id FROM public.documents WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'mindmap' THEN (CASE WHEN (SELECT folder_id FROM public.mind_maps WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'todo' THEN (CASE WHEN (SELECT folder_id FROM public.todos WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
        WHEN s.t = 'mindmap' THEN COALESCE((SELECT folder_id FROM public.mind_maps WHERE id = s.id), (SELECT workspace_id FROM public.mind_maps WHERE id = s.id))
        WHEN s.t = 'todo' THEN COALESCE((SELECT folder_id FROM public.todos WHERE id = s.id), (SELECT workspace_id FROM public.todos WHERE id = s.id))
        ELSE NULL
      END
    FROM scope s
    WHERE s.depth < 12 AND s.id IS NOT NULL
  ),
  target_public AS (
    SELECT (CASE e_type
      WHEN 'workspace' THEN (SELECT visibility FROM public.workspaces WHERE id = e_id)
      WHEN 'folder' THEN (SELECT visibility FROM public.workspace_folders WHERE id = e_id)
      WHEN 'list' THEN (SELECT visibility FROM public.task_lists WHERE id = e_id)
      WHEN 'document' THEN (SELECT visibility FROM public.documents WHERE id = e_id)
      WHEN 'mindmap' THEN (SELECT visibility FROM public.mind_maps WHERE id = e_id)
      WHEN 'todo' THEN (SELECT visibility FROM public.todos WHERE id = e_id)
    END = 'public') AS is_public
  ),
  grants AS (
    SELECT ev.permission
    FROM public.entity_visibility ev
    WHERE ev.entity_type = e_type AND ev.entity_id = e_id
      AND ev.profile_id = auth.uid()
      AND public.entity_org_id(e_type, e_id) = public.get_my_org_id()
    UNION ALL
    SELECT CASE WHEN public.perm_rank(ev.permission) >= 2 THEN 'write' ELSE ev.permission END
    FROM scope s
    CROSS JOIN target_public tp
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid() AND ev.inherit = true
    WHERE s.depth > 0 AND tp.is_public
      AND public.entity_org_id(s.t, s.id) = public.get_my_org_id()
  )
  SELECT CASE max(public.perm_rank(g.permission))
    WHEN 3 THEN 'manage'
    WHEN 2 THEN 'write'
    WHEN 1 THEN 'read'
    ELSE NULL
  END
  FROM grants g;
$$;

CREATE OR REPLACE FUNCTION container_write_level(p_folder_id UUID, p_ws_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE scope(depth, t, id) AS (
    SELECT 0,
      CASE WHEN p_folder_id IS NOT NULL THEN 'folder' ELSE 'workspace' END,
      COALESCE(p_folder_id, p_ws_id)::uuid
    UNION ALL
    SELECT s.depth + 1,
      'folder',
      COALESCE(
        (SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id),
        (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id)
      )
    FROM scope s
    WHERE s.depth < 12 AND s.id IS NOT NULL AND s.t = 'folder'
  )
  SELECT max(public.perm_rank(ev.permission))
  FROM scope s
  JOIN public.entity_visibility ev
    ON ev.entity_type = s.t AND ev.entity_id = s.id
    AND ev.profile_id = auth.uid() AND ev.inherit = true
  WHERE public.entity_org_id(s.t, s.id) = public.get_my_org_id();
$$;

GRANT EXECUTE ON FUNCTION container_write_level(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION container_write_level(UUID, UUID) FROM public, anon;

CREATE OR REPLACE FUNCTION grant_creator_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.entity_visibility (entity_type, entity_id, profile_id, permission, inherit)
  VALUES (TG_ARGV[0], NEW.id, auth.uid(), 'manage', false)
  ON CONFLICT (entity_type, entity_id, profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_creator_access ON documents;
CREATE TRIGGER trg_documents_creator_access AFTER INSERT ON documents
  FOR EACH ROW EXECUTE FUNCTION grant_creator_access('document');
DROP TRIGGER IF EXISTS trg_task_lists_creator_access ON task_lists;
CREATE TRIGGER trg_task_lists_creator_access AFTER INSERT ON task_lists
  FOR EACH ROW EXECUTE FUNCTION grant_creator_access('list');
DROP TRIGGER IF EXISTS trg_folders_creator_access ON workspace_folders;
CREATE TRIGGER trg_folders_creator_access AFTER INSERT ON workspace_folders
  FOR EACH ROW EXECUTE FUNCTION grant_creator_access('folder');
DROP TRIGGER IF EXISTS trg_mind_maps_creator_access ON mind_maps;
CREATE TRIGGER trg_mind_maps_creator_access AFTER INSERT ON mind_maps
  FOR EACH ROW EXECUTE FUNCTION grant_creator_access('mindmap');
DROP TRIGGER IF EXISTS trg_todos_creator_access ON todos;
CREATE TRIGGER trg_todos_creator_access AFTER INSERT ON todos
  FOR EACH ROW EXECUTE FUNCTION grant_creator_access('todo');

CREATE OR REPLACE FUNCTION set_task_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_creator ON tasks;
CREATE TRIGGER trg_tasks_creator BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_creator();

DROP POLICY IF EXISTS "documents_all_admin" ON documents;
DROP POLICY IF EXISTS "documents_insert_write" ON documents;
CREATE POLICY "documents_insert_write" ON documents
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
DROP POLICY IF EXISTS "documents_update_write" ON documents;
CREATE POLICY "documents_update_write" ON documents
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('document', id)) >= 2
  );
DROP POLICY IF EXISTS "documents_delete_manage" ON documents;
CREATE POLICY "documents_delete_manage" ON documents
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('document', id)) >= 3
  );

DROP POLICY IF EXISTS "task_lists_all_admin" ON task_lists;
DROP POLICY IF EXISTS "task_lists_insert_write" ON task_lists;
CREATE POLICY "task_lists_insert_write" ON task_lists
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
DROP POLICY IF EXISTS "task_lists_update_write" ON task_lists;
CREATE POLICY "task_lists_update_write" ON task_lists
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('list', id)) >= 2
  );
DROP POLICY IF EXISTS "task_lists_delete_manage" ON task_lists;
CREATE POLICY "task_lists_delete_manage" ON task_lists
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('list', id)) >= 3
  );

DROP POLICY IF EXISTS "folders_all_admin" ON workspace_folders;
DROP POLICY IF EXISTS "folders_insert_write" ON workspace_folders;
CREATE POLICY "folders_insert_write" ON workspace_folders
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(parent_folder_id, workspace_id) >= 2
  );
DROP POLICY IF EXISTS "folders_update_write" ON workspace_folders;
CREATE POLICY "folders_update_write" ON workspace_folders
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('folder', id)) >= 2
  );
DROP POLICY IF EXISTS "folders_delete_manage" ON workspace_folders;
CREATE POLICY "folders_delete_manage" ON workspace_folders
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('folder', id)) >= 3
  );

DROP POLICY IF EXISTS "mind_maps_all_admin" ON mind_maps;
DROP POLICY IF EXISTS "mind_maps_insert_write" ON mind_maps;
CREATE POLICY "mind_maps_insert_write" ON mind_maps
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
DROP POLICY IF EXISTS "mind_maps_update_write" ON mind_maps;
CREATE POLICY "mind_maps_update_write" ON mind_maps
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 2
  );
DROP POLICY IF EXISTS "mind_maps_delete_manage" ON mind_maps;
CREATE POLICY "mind_maps_delete_manage" ON mind_maps
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 3
  );

DROP POLICY IF EXISTS "todos_all_admin" ON todos;
DROP POLICY IF EXISTS "todos_insert_write" ON todos;
CREATE POLICY "todos_insert_write" ON todos
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
DROP POLICY IF EXISTS "todos_update_write" ON todos;
CREATE POLICY "todos_update_write" ON todos
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('todo', id)) >= 2
  );
DROP POLICY IF EXISTS "todos_delete_manage" ON todos;
CREATE POLICY "todos_delete_manage" ON todos
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('todo', id)) >= 3
  );

DROP POLICY IF EXISTS "tasks_delete_admin" ON tasks;
CREATE POLICY "tasks_delete_admin" ON tasks
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR (organization_id = get_my_org_id() AND public.perm_rank(public.task_permission(id)) >= 3)
    OR (organization_id = get_my_org_id() AND created_by = auth.uid())
  );

-- ===== 0048_visibility_admin_only.sql =====
CREATE OR REPLACE FUNCTION protect_visibility_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility
     AND COALESCE((SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()), 'collaborator') <> 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden cambiar la visibilidad';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspaces_visibility ON workspaces;
CREATE TRIGGER trg_workspaces_visibility BEFORE UPDATE OF visibility ON workspaces
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_folders_visibility ON workspace_folders;
CREATE TRIGGER trg_folders_visibility BEFORE UPDATE OF visibility ON workspace_folders
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_lists_visibility ON task_lists;
CREATE TRIGGER trg_lists_visibility BEFORE UPDATE OF visibility ON task_lists
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_documents_visibility ON documents;
CREATE TRIGGER trg_documents_visibility BEFORE UPDATE OF visibility ON documents
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_mind_maps_visibility ON mind_maps;
CREATE TRIGGER trg_mind_maps_visibility BEFORE UPDATE OF visibility ON mind_maps
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_todos_visibility ON todos;
CREATE TRIGGER trg_todos_visibility BEFORE UPDATE OF visibility ON todos
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();