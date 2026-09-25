SET check_function_bodies = off;

-- ===== 0030_schedules.sql =====
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  shift_id UUID REFERENCES shifts(id) ON DELETE RESTRICT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_schedules_org ON schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id);

CREATE OR REPLACE FUNCTION is_org_owner(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.profiles p ON p.organization_id = o.id
    WHERE o.owner_id = user_uuid AND p.id = user_uuid
  );
$$;

CREATE OR REPLACE FUNCTION has_schedule(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.schedules WHERE user_id = user_uuid);
$$;

CREATE OR REPLACE FUNCTION shifts_overlap(a_start TIME, a_end TIME, b_start TIME, b_end TIME)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  a_s INT; a_e INT; b_s INT; b_e INT;
  a_segs INT[][]; b_segs INT[][];
  i INT; j INT;
BEGIN
  a_s := EXTRACT(EPOCH FROM a_start)::INT / 60;
  a_e := EXTRACT(EPOCH FROM a_end)::INT / 60;
  b_s := EXTRACT(EPOCH FROM b_start)::INT / 60;
  b_e := EXTRACT(EPOCH FROM b_end)::INT / 60;

  IF a_s < a_e THEN
    a_segs := ARRAY[ARRAY[a_s, a_e]];
  ELSE
    a_segs := ARRAY[ARRAY[a_s, 1440]];
    IF a_e > 0 THEN a_segs := a_segs || ARRAY[ARRAY[0, a_e]]; END IF;
  END IF;

  IF b_s < b_e THEN
    b_segs := ARRAY[ARRAY[b_s, b_e]];
  ELSE
    b_segs := ARRAY[ARRAY[b_s, 1440]];
    IF b_e > 0 THEN b_segs := b_segs || ARRAY[ARRAY[0, b_e]]; END IF;
  END IF;

  FOR i IN 1..array_length(a_segs, 1) LOOP
    FOR j IN 1..array_length(b_segs, 1) LOOP
      IF a_segs[i][1] < b_segs[j][2] AND b_segs[j][1] < a_segs[i][2] THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedules_select_org" ON schedules;
CREATE POLICY "schedules_select_org" ON schedules
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "schedules_all_admin" ON schedules;
CREATE POLICY "schedules_all_admin" ON schedules
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "schedules_all_org_owner" ON schedules;
CREATE POLICY "schedules_all_org_owner" ON schedules
  FOR ALL USING (is_org_owner(auth.uid()) AND organization_id = get_my_org_id());

DROP TRIGGER IF EXISTS schedules_no_overlap ON schedules;
CREATE OR REPLACE FUNCTION prevent_overlapping_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_start TIME; v_new_end TIME;
BEGIN
  SELECT start_time, end_time INTO v_new_start, v_new_end
  FROM shifts WHERE id = NEW.shift_id;

  IF EXISTS (
    SELECT 1
    FROM schedules s
    JOIN shifts x ON x.id = s.shift_id
    WHERE s.user_id = NEW.user_id
      AND s.day_of_week = NEW.day_of_week
      AND s.id <> NEW.id
      AND shifts_overlap(x.start_time, x.end_time, v_new_start, v_new_end)
  ) THEN
    RAISE EXCEPTION 'El turno se solapa con otro turno asignado para el mismo día';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedules_no_overlap ON schedules;
CREATE TRIGGER schedules_no_overlap
  BEFORE INSERT OR UPDATE OF shift_id, day_of_week ON schedules
  FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_schedule();

DROP TRIGGER IF EXISTS schedules_keep_last ON schedules;
CREATE OR REPLACE FUNCTION prevent_last_schedule_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_org_owner(OLD.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM schedules WHERE user_id = OLD.user_id AND id <> OLD.id
     ) THEN
    RAISE EXCEPTION
      'El usuario debe tener un horario siempre: asigna un turno antes de eliminar este';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS schedules_keep_last ON schedules;
CREATE TRIGGER schedules_keep_last
  BEFORE DELETE ON schedules
  FOR EACH ROW EXECUTE FUNCTION prevent_last_schedule_deletion();

DROP TRIGGER IF EXISTS time_entries_require_schedule ON time_entries;
CREATE OR REPLACE FUNCTION require_schedule_for_time_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT is_org_owner(NEW.user_id)
     AND NOT has_schedule(NEW.user_id) THEN
    RAISE EXCEPTION
      'Sin horario asignado: el administrador debe asignar un turno antes de registrar horas';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_entries_require_schedule ON time_entries;
CREATE TRIGGER time_entries_require_schedule
  BEFORE INSERT OR UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION require_schedule_for_time_entry();

DROP TRIGGER IF EXISTS tasks_require_schedule ON tasks;
CREATE OR REPLACE FUNCTION require_schedule_for_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND auth.role() <> 'service_role'
     AND NOT is_org_owner(NEW.assigned_to)
     AND NOT has_schedule(NEW.assigned_to) THEN
    RAISE EXCEPTION
      'El usuario asignado no tiene horario: asígnale un turno primero';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_require_schedule ON tasks;
CREATE TRIGGER tasks_require_schedule
  BEFORE INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW EXECUTE FUNCTION require_schedule_for_task_assignment();

DROP TRIGGER IF EXISTS profiles_hours_org_controlled ON profiles;
CREATE OR REPLACE FUNCTION enforce_hours_org_control()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND auth.uid() = NEW.id
     AND has_schedule(NEW.id)
     AND NOT is_org_owner(NEW.id) THEN
    RAISE EXCEPTION
      'Tu horario lo administra la organización: solicita cambios al administrador';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_hours_org_controlled ON profiles;
CREATE TRIGGER profiles_hours_org_controlled
  BEFORE UPDATE OF daily_hours, weekly_hours ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_hours_org_control();

-- ===== 0031_mindmaps.sql =====
CREATE TABLE IF NOT EXISTS mind_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  content JSONB NOT NULL DEFAULT '{"version":1,"nodes":[],"edges":[],"viewport":null}',
  position INT DEFAULT 0 NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mind_maps_org ON mind_maps(organization_id, position);
CREATE INDEX IF NOT EXISTS idx_mind_maps_workspace ON mind_maps(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_mind_maps_folder ON mind_maps(folder_id, position);

ALTER TABLE entity_visibility DROP CONSTRAINT entity_visibility_entity_type_check;
ALTER TABLE entity_visibility ADD CONSTRAINT entity_visibility_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap'));

ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_entity_type_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap'));

DROP TRIGGER IF EXISTS mind_maps_updated_at ON mind_maps;
CREATE TRIGGER mind_maps_updated_at
  BEFORE UPDATE ON mind_maps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION entity_org_id(entity_type TEXT, entity_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE entity_type
    WHEN 'workspace' THEN (SELECT organization_id FROM public.workspaces WHERE id = entity_id)
    WHEN 'folder' THEN (SELECT w.organization_id FROM public.workspace_folders f JOIN public.workspaces w ON w.id = f.workspace_id WHERE f.id = entity_id)
    WHEN 'list' THEN (SELECT organization_id FROM public.task_lists WHERE id = entity_id)
    WHEN 'document' THEN (SELECT organization_id FROM public.documents WHERE id = entity_id)
    WHEN 'mindmap' THEN (SELECT organization_id FROM public.mind_maps WHERE id = entity_id)
  END;
$$;

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
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
        WHEN s.t = 'mindmap' THEN COALESCE((SELECT folder_id FROM public.mind_maps WHERE id = s.id), (SELECT workspace_id FROM public.mind_maps WHERE id = s.id))
        ELSE NULL
      END
    FROM scope s
    WHERE s.depth < 12 AND s.id IS NOT NULL
  ),
  grants AS (
    SELECT ev.permission
    FROM public.entity_visibility ev
    WHERE ev.entity_type = e_type AND ev.entity_id = e_id
      AND ev.profile_id = auth.uid()
      AND public.entity_org_id(e_type, e_id) = public.get_my_org_id()
    UNION ALL
    SELECT ev.permission
    FROM scope s
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid() AND ev.inherit = true
    WHERE s.depth > 0
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

ALTER TABLE mind_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mind_maps_select_org" ON mind_maps;
CREATE POLICY "mind_maps_select_org" ON mind_maps
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR public.entity_permission('mindmap', id) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "mind_maps_all_admin" ON mind_maps;
CREATE POLICY "mind_maps_all_admin" ON mind_maps
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 3
  );

DROP TRIGGER IF EXISTS trg_ev_mindmap ON mind_maps;
CREATE TRIGGER trg_ev_mindmap
  AFTER DELETE ON mind_maps
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('mindmap');

DROP POLICY IF EXISTS "mindmap_images_public_read" ON storage.objects;
CREATE POLICY "mindmap_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'mindmap-images');

DROP POLICY IF EXISTS "mindmap_images_authenticated_write" ON storage.objects;
CREATE POLICY "mindmap_images_authenticated_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'mindmap-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (get_my_org_id())::text
  );

DROP POLICY IF EXISTS "mindmap_images_authenticated_update" ON storage.objects;
CREATE POLICY "mindmap_images_authenticated_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'mindmap-images'
    AND auth.role() = 'authenticated'
  );

-- ===== 0032_restore_rls_policies.sql =====
SET check_function_bodies = off;

DROP POLICY IF EXISTS "invitations_select_public" ON invitations;

REVOKE EXECUTE ON FUNCTION debug_policies() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_rls_status() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_columns() FROM public, anon, authenticated;

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

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_select_own" ON organizations;
CREATE POLICY "org_select_own" ON organizations
  FOR SELECT USING (id = get_my_org_id());
DROP POLICY IF EXISTS "org_update_owner" ON organizations;
CREATE POLICY "org_update_owner" ON organizations
  FOR UPDATE USING (
    auth.uid() = owner_id
    OR (id = get_my_org_id() AND get_my_role() = 'admin')
  );

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own_org" ON profiles;
CREATE POLICY "profiles_select_own_org" ON profiles
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());
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

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shifts_select_own_org" ON shifts;
CREATE POLICY "shifts_select_own_org" ON shifts
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "shifts_all_admin" ON shifts;
CREATE POLICY "shifts_all_admin" ON shifts
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspaces_select_org" ON workspaces;
CREATE POLICY "workspaces_select_org" ON workspaces
  FOR SELECT USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (organization_id = get_my_org_id() AND visibility = 'public')
    OR public.entity_permission('workspace', id) IS NOT NULL
  );
DROP POLICY IF EXISTS "workspaces_all_admin" ON workspaces;
CREATE POLICY "workspaces_all_admin" ON workspaces
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (public.perm_rank(public.entity_permission('workspace', id)) >= 3)
  );

ALTER TABLE workspace_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "folders_select_org" ON workspace_folders;
CREATE POLICY "folders_select_org" ON workspace_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_folders.workspace_id
      AND w.organization_id = get_my_org_id()
    )
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR public.entity_permission('folder', id) IS NOT NULL
    )
  );
DROP POLICY IF EXISTS "folders_all_admin" ON workspace_folders;
CREATE POLICY "folders_all_admin" ON workspace_folders
  FOR ALL USING (
    get_my_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_folders.workspace_id
      AND w.organization_id = get_my_org_id()
    )
    OR public.perm_rank(public.entity_permission('folder', id)) >= 3
  );

ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_lists_select_org" ON task_lists;
CREATE POLICY "task_lists_select_org" ON task_lists
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR public.entity_permission('list', id) IS NOT NULL
    )
  );
DROP POLICY IF EXISTS "task_lists_all_admin" ON task_lists;
CREATE POLICY "task_lists_all_admin" ON task_lists
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR public.perm_rank(public.entity_permission('list', id)) >= 3
  );

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "documents_select_org" ON documents;
CREATE POLICY "documents_select_org" ON documents
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR public.entity_permission('document', id) IS NOT NULL
    )
  );
DROP POLICY IF EXISTS "documents_all_admin" ON documents;
CREATE POLICY "documents_all_admin" ON documents
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR public.perm_rank(public.entity_permission('document', id)) >= 3
  );

ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pages_select_doc" ON document_pages;
CREATE POLICY "pages_select_doc" ON document_pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
      AND d.organization_id = get_my_org_id()
      AND (
        d.visibility = 'public'
        OR get_my_role() = 'admin'
        OR public.entity_permission('document', d.id) IS NOT NULL
      )
    )
  );
DROP POLICY IF EXISTS "pages_write_visible" ON document_pages;
CREATE POLICY "pages_write_visible" ON document_pages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
      AND d.organization_id = get_my_org_id()
      AND (
        get_my_role() = 'admin'
        OR public.perm_rank(public.entity_permission('document', d.id)) >= 2
      )
    )
  );

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_select_own_org" ON tasks;
CREATE POLICY "tasks_select_own_org" ON tasks
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR assigned_to = auth.uid()
      OR public.task_permission(id) IS NOT NULL
    )
  );
DROP POLICY IF EXISTS "tasks_insert_admin" ON tasks;
CREATE POLICY "tasks_insert_admin" ON tasks
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (
      organization_id = get_my_org_id()
      AND list_id IS NOT NULL
      AND public.perm_rank(public.entity_permission('list', list_id)) >= 2
    )
  );
DROP POLICY IF EXISTS "tasks_update_admin" ON tasks;
CREATE POLICY "tasks_update_admin" ON tasks
  FOR UPDATE USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (organization_id = get_my_org_id() AND public.perm_rank(public.task_permission(id)) >= 2)
  );
DROP POLICY IF EXISTS "tasks_delete_admin" ON tasks;
CREATE POLICY "tasks_delete_admin" ON tasks
  FOR DELETE USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (organization_id = get_my_org_id() AND public.perm_rank(public.task_permission(id)) >= 2)
  );
DROP POLICY IF EXISTS "tasks_update_assigned" ON tasks;
CREATE POLICY "tasks_update_assigned" ON tasks
  FOR UPDATE USING (auth.uid() = assigned_to);

ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_select_in_org" ON task_notes;
CREATE POLICY "notes_select_in_org" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.organization_id = get_my_org_id()
      AND (
        get_my_role() = 'admin'
        OR t.assigned_to = auth.uid()
        OR public.task_permission(t.id) IS NOT NULL
      )
    )
  );
DROP POLICY IF EXISTS "notes_insert_in_org" ON task_notes;
CREATE POLICY "notes_insert_in_org" ON task_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.organization_id = get_my_org_id()
      AND (
        get_my_role() = 'admin'
        OR public.perm_rank(public.task_permission(t.id)) >= 2
      )
    )
  );

ALTER TABLE entity_visibility ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ev_select" ON entity_visibility;
CREATE POLICY "ev_select" ON entity_visibility
  FOR SELECT USING (
    auth.uid() = profile_id
    OR (get_my_role() = 'admin' AND entity_org_id(entity_type, entity_id) = get_my_org_id())
  );
DROP POLICY IF EXISTS "ev_write_admin" ON entity_visibility;
CREATE POLICY "ev_write_admin" ON entity_visibility
  FOR ALL USING (
    get_my_role() = 'admin' AND entity_org_id(entity_type, entity_id) = get_my_org_id()
  );

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invitations_all_admin" ON invitations;
CREATE POLICY "invitations_all_admin" ON invitations
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_select_org" ON time_entries;
DROP POLICY IF EXISTS "time_select_own_org" ON time_entries;
CREATE POLICY "time_select_own_org" ON time_entries
  FOR SELECT USING (organization_id = get_my_org_id());
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

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedules_select_org" ON schedules;
CREATE POLICY "schedules_select_org" ON schedules
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "schedules_all_admin" ON schedules;
CREATE POLICY "schedules_all_admin" ON schedules
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());
DROP POLICY IF EXISTS "schedules_all_org_owner" ON schedules;
CREATE POLICY "schedules_all_org_owner" ON schedules
  FOR ALL USING (is_org_owner(auth.uid()) AND organization_id = get_my_org_id());

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perm_select_own_org" ON permissions;
CREATE POLICY "perm_select_own_org" ON permissions
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "perm_insert_own" ON permissions;
CREATE POLICY "perm_insert_own" ON permissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "perm_update_admin" ON permissions;
CREATE POLICY "perm_update_admin" ON permissions
  FOR UPDATE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_all_own" ON notifications;
CREATE POLICY "notif_all_own" ON notifications
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "telegram_all_admin" ON telegram_config;
CREATE POLICY "telegram_all_admin" ON telegram_config
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_settings_select_own_org" ON org_settings;
CREATE POLICY "org_settings_select_own_org" ON org_settings
  FOR SELECT USING (organization_id = get_my_org_id());
DROP POLICY IF EXISTS "org_settings_all_admin" ON org_settings;
CREATE POLICY "org_settings_all_admin" ON org_settings
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

ALTER TABLE mind_maps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mind_maps_select_org" ON mind_maps;
CREATE POLICY "mind_maps_select_org" ON mind_maps
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR public.entity_permission('mindmap', id) IS NOT NULL
    )
  );
DROP POLICY IF EXISTS "mind_maps_all_admin" ON mind_maps;
CREATE POLICY "mind_maps_all_admin" ON mind_maps
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 3
  );

-- ===== 0033_schema_fixes.sql =====
SET check_function_bodies = off;

-- tabla task_activity_log (antes vivía en timeline.sql, aplicado a mano en prod)
CREATE TABLE IF NOT EXISTS public.task_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created','status_changed','assigned','priority_changed','due_date_changed','hours_changed','title_changed')),
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_task ON task_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON task_activity_log(created_at);

ALTER TABLE task_activity_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND blocked = false;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND blocked = false;
$$;

CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.profiles WHERE id = auth.uid() AND blocked = false;
$$;

CREATE OR REPLACE FUNCTION entity_org_id(entity_type TEXT, entity_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE entity_type
    WHEN 'workspace' THEN (SELECT organization_id FROM public.workspaces WHERE id = entity_id)
    WHEN 'folder' THEN (SELECT w.organization_id FROM public.workspace_folders f JOIN public.workspaces w ON w.id = f.workspace_id WHERE f.id = entity_id)
    WHEN 'list' THEN (SELECT organization_id FROM public.task_lists WHERE id = entity_id)
    WHEN 'document' THEN (SELECT organization_id FROM public.documents WHERE id = entity_id)
    WHEN 'mindmap' THEN (SELECT organization_id FROM public.mind_maps WHERE id = entity_id)
  END;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), 'admin');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION log_task_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, auth'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, new_value)
    VALUES (NEW.id, NEW.created_by, 'created', NEW.status);
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'assigned', OLD.assigned_to::TEXT, NEW.assigned_to::TEXT);
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'priority_changed', OLD.priority, NEW.priority);
  END IF;

  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'due_date_changed', OLD.due_date::TEXT, NEW.due_date::TEXT);
  END IF;

  IF OLD.estimated_hours IS DISTINCT FROM NEW.estimated_hours THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'hours_changed', OLD.estimated_hours::TEXT, NEW.estimated_hours::TEXT);
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'title_changed', OLD.title, NEW.title);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_changes_trigger ON tasks;
CREATE TRIGGER task_changes_trigger
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_task_changes();

DROP POLICY IF EXISTS "activity_select_org" ON task_activity_log;
CREATE POLICY "activity_select_org" ON task_activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_activity_log.task_id AND t.organization_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "activity_insert_org" ON task_activity_log;
CREATE POLICY "activity_insert_org" ON task_activity_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_activity_log.task_id AND t.organization_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;

DROP POLICY IF EXISTS "invitations_select_public" ON invitations;

REVOKE EXECUTE ON FUNCTION debug_policies() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_rls_status() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_columns() FROM public, anon, authenticated;

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

-- ===== 0034_todos.sql =====
SET check_function_bodies = off;

CREATE TABLE IF NOT EXISTS public.todo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES public.task_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('daily','weekly','shift','interval')),
  interval_days INT CHECK (interval_days IS NULL OR interval_days > 0),
  target_quantity INT NOT NULL DEFAULT 1 CHECK (target_quantity >= 1),
  active BOOLEAN NOT NULL DEFAULT true,
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT todo_templates_interval_requires_days
    CHECK (frequency <> 'interval' OR interval_days IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_todo_templates_list ON public.todo_templates(list_id, position);
CREATE INDEX IF NOT EXISTS idx_todo_templates_org ON public.todo_templates(organization_id);

DROP TRIGGER IF EXISTS todo_templates_updated_at ON public.todo_templates;
CREATE TRIGGER todo_templates_updated_at
  BEFORE UPDATE ON public.todo_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.todo_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.todo_templates(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cycle_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  quantity_done INT NOT NULL DEFAULT 0 CHECK (quantity_done >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT todo_progress_unique_template_profile UNIQUE (template_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_todo_progress_profile ON public.todo_progress(profile_id);

DROP TRIGGER IF EXISTS todo_progress_updated_at ON public.todo_progress;
CREATE TRIGGER todo_progress_updated_at
  BEFORE UPDATE ON public.todo_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.todo_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todo_templates_select_org" ON public.todo_templates;
CREATE POLICY "todo_templates_select_org" ON public.todo_templates
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
    AND EXISTS (
      SELECT 1 FROM public.task_lists l
      WHERE l.id = todo_templates.list_id
        AND (
          l.visibility = 'public'
          OR public.get_my_role() = 'admin'
          OR public.entity_permission('list', l.id) IS NOT NULL
        )
    )
  );

DROP POLICY IF EXISTS "todo_templates_all_admin" ON public.todo_templates;
CREATE POLICY "todo_templates_all_admin" ON public.todo_templates
  FOR ALL USING (
    public.get_my_role() = 'admin' AND organization_id = public.get_my_org_id()
    OR (
      organization_id = public.get_my_org_id()
      AND public.perm_rank(public.entity_permission('list', list_id)) >= 3
    )
  );

DROP POLICY IF EXISTS "todo_progress_select_own" ON public.todo_progress;
CREATE POLICY "todo_progress_select_own" ON public.todo_progress
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "todo_progress_insert_own" ON public.todo_progress;
CREATE POLICY "todo_progress_insert_own" ON public.todo_progress
  FOR INSERT WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "todo_progress_update_own" ON public.todo_progress;
CREATE POLICY "todo_progress_update_own" ON public.todo_progress
  FOR UPDATE USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "todo_progress_delete_own" ON public.todo_progress;
CREATE POLICY "todo_progress_delete_own" ON public.todo_progress
  FOR DELETE USING (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.todo_cycle_bounds(
  p_frequency TEXT,
  p_interval_days INT,
  p_now TIMESTAMPTZ,
  p_timezone TEXT,
  p_week_start INT
)
RETURNS TABLE (cycle_start TIMESTAMPTZ, cycle_end TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE p_frequency
      WHEN 'weekly' THEN
        (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
          + (p_week_start - 1) * INTERVAL '1 day') AT TIME ZONE p_timezone
      WHEN 'interval' THEN
        ((p_now AT TIME ZONE p_timezone)::date
          - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
        ) AT TIME ZONE p_timezone
      ELSE
        (date_trunc('day', p_now AT TIME ZONE p_timezone)) AT TIME ZONE p_timezone
    END,
    CASE p_frequency
      WHEN 'weekly' THEN
        (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
          + (p_week_start - 1) * INTERVAL '1 day' + 7 * INTERVAL '1 day') AT TIME ZONE p_timezone
      WHEN 'interval' THEN
        ((p_now AT TIME ZONE p_timezone)::date
          - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
          + p_interval_days) AT TIME ZONE p_timezone
      ELSE
        (date_trunc('day', p_now AT TIME ZONE p_timezone) + INTERVAL '1 day') AT TIME ZONE p_timezone
    END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT) FROM public;

CREATE OR REPLACE FUNCTION public.todo_board(p_list_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  frequency TEXT,
  interval_days INT,
  target_quantity INT,
  active BOOLEAN,
  quantity_done INT,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_timezone TEXT := 'UTC';
  v_week_start INT := 1;
  v_prefs JSONB;
  v_rec RECORD;
  v_bounds RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles p WHERE p.id = v_user_id AND p.blocked = false;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT timezone INTO v_timezone
  FROM public.org_settings WHERE organization_id = v_org_id;
  IF v_timezone IS NULL OR v_timezone = '' THEN
    v_timezone := 'UTC';
  END IF;

  SELECT preferences INTO v_prefs FROM public.profiles p WHERE p.id = v_user_id;
  v_week_start := CASE WHEN v_prefs->>'week_start' = 'sunday' THEN 0 ELSE 1 END;

  FOR v_rec IN
    SELECT t.*, p.quantity_done AS stored_done, p.cycle_start AS stored_cycle_start
    FROM public.todo_templates t
    LEFT JOIN public.todo_progress p
      ON p.template_id = t.id AND p.profile_id = v_user_id
    WHERE t.list_id = p_list_id AND t.organization_id = v_org_id
    ORDER BY t.position ASC, t.created_at ASC
  LOOP
    SELECT * INTO v_bounds
    FROM public.todo_cycle_bounds(v_rec.frequency, v_rec.interval_days, now(), v_timezone, v_week_start);

    IF v_rec.stored_cycle_start IS NULL OR v_rec.stored_cycle_start < v_bounds.cycle_start THEN
      INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
      VALUES (v_rec.id, v_user_id, v_bounds.cycle_start, 0)
      ON CONFLICT (template_id, profile_id)
      DO UPDATE SET cycle_start = EXCLUDED.cycle_start, quantity_done = 0;
    END IF;

    id := v_rec.id;
    title := v_rec.title;
    frequency := v_rec.frequency;
    interval_days := v_rec.interval_days;
    target_quantity := v_rec.target_quantity;
    active := v_rec.active;
    quantity_done := CASE
      WHEN v_rec.stored_cycle_start IS NULL OR v_rec.stored_cycle_start < v_bounds.cycle_start
      THEN 0
      ELSE COALESCE(v_rec.stored_done, 0)
    END;
    cycle_start := v_bounds.cycle_start;
    cycle_end := v_bounds.cycle_end;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_board(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_board(UUID) FROM public;

CREATE OR REPLACE FUNCTION public.todo_tick(p_template_id UUID, p_delta INT)
RETURNS TABLE (
  quantity_done INT,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_timezone TEXT := 'UTC';
  v_week_start INT := 1;
  v_prefs JSONB;
  v_frequency TEXT;
  v_interval_days INT;
  v_target INT;
  v_bounds RECORD;
  v_row RECORD;
  v_new_done INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE id = v_user_id AND blocked = false;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT frequency, interval_days, target_quantity
    INTO v_frequency, v_interval_days, v_target
  FROM public.todo_templates
  WHERE id = p_template_id AND organization_id = v_org_id
    AND EXISTS (
      SELECT 1 FROM public.task_lists l
      WHERE l.id = todo_templates.list_id
        AND (
          l.visibility = 'public'
          OR public.get_my_role() = 'admin'
          OR public.entity_permission('list', l.id) IS NOT NULL
        )
    );
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT timezone INTO v_timezone
  FROM public.org_settings WHERE organization_id = v_org_id;
  IF v_timezone IS NULL OR v_timezone = '' THEN
    v_timezone := 'UTC';
  END IF;

  SELECT preferences INTO v_prefs FROM public.profiles WHERE id = v_user_id;
  v_week_start := CASE WHEN v_prefs->>'week_start' = 'sunday' THEN 0 ELSE 1 END;

  SELECT * INTO v_bounds
  FROM public.todo_cycle_bounds(v_frequency, v_interval_days, now(), v_timezone, v_week_start);

  SELECT * INTO v_row
  FROM public.todo_progress
  WHERE template_id = p_template_id AND profile_id = v_user_id;

  IF v_row.id IS NULL THEN
    v_new_done := GREATEST(0, LEAST(v_target, p_delta));
    INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
    VALUES (p_template_id, v_user_id, v_bounds.cycle_start, v_new_done);
  ELSIF v_row.cycle_start < v_bounds.cycle_start THEN
    v_new_done := GREATEST(0, LEAST(v_target, p_delta));
    UPDATE public.todo_progress
    SET cycle_start = v_bounds.cycle_start, quantity_done = v_new_done
    WHERE id = v_row.id;
  ELSE
    v_new_done := GREATEST(0, LEAST(v_target, v_row.quantity_done + p_delta));
    UPDATE public.todo_progress SET quantity_done = v_new_done WHERE id = v_row.id;
  END IF;

  quantity_done := v_new_done;
  cycle_start := v_bounds.cycle_start;
  cycle_end := v_bounds.cycle_end;
  RETURN NEXT;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_tick(UUID, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_tick(UUID, INT) FROM public;

-- ===== 0035_todos_entidad.sql =====
SET check_function_bodies = off;

CREATE TABLE IF NOT EXISTS public.todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.workspace_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todos_org ON public.todos(organization_id, position);
CREATE INDEX IF NOT EXISTS idx_todos_ws ON public.todos(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_todos_folder ON public.todos(folder_id, position);

DROP TRIGGER IF EXISTS todos_updated_at ON public.todos;
CREATE TRIGGER todos_updated_at
  BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DO $$
BEGIN
  IF to_regclass('public.todo_templates') IS NOT NULL
     AND to_regclass('public.todo_items') IS NULL THEN
    ALTER TABLE public.todo_templates RENAME TO todo_items;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'todo_items' AND column_name = 'title'
     ) THEN
    ALTER TABLE public.todo_items RENAME COLUMN title TO name;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "todo_templates_select_org" ON public.todo_items;
    DROP POLICY IF EXISTS "todo_templates_all_admin" ON public.todo_items;
  END IF;
END;
$$;

ALTER TABLE public.todo_items ADD COLUMN IF NOT EXISTS todo_id UUID REFERENCES public.todos(id) ON DELETE CASCADE;

DO $$
DECLARE
  v_pending INT;
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    SELECT count(*) INTO v_pending FROM public.todo_items WHERE todo_id IS NULL;
    IF v_pending > 0 THEN
      CREATE TEMP TABLE _todo_map (item_id UUID PRIMARY KEY, todo_id UUID) ON COMMIT DROP;

      INSERT INTO public.todos (organization_id, workspace_id, folder_id, name, position, created_by)
      SELECT tt.organization_id, l.workspace_id, l.folder_id, tt.name, 0, tt.created_by
      FROM public.todo_items tt
      LEFT JOIN public.task_lists l ON l.id = tt.list_id
      WHERE tt.todo_id IS NULL;

      INSERT INTO _todo_map (item_id, todo_id)
      SELECT tt.id, t.id
      FROM public.todo_items tt
      JOIN public.todos t
        ON t.name = tt.name AND t.organization_id = tt.organization_id
       AND t.created_by IS NOT DISTINCT FROM tt.created_by
      WHERE tt.todo_id IS NULL;

      UPDATE public.todo_items tt SET todo_id = m.todo_id FROM _todo_map m WHERE m.item_id = tt.id;

      DROP TABLE _todo_map;
    END IF;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    ALTER TABLE public.todo_items DROP COLUMN IF EXISTS list_id;
    ALTER TABLE public.todo_items DROP COLUMN IF EXISTS organization_id;
    IF EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'todo_items' AND column_name = 'todo_id'
       )
       AND NOT EXISTS (SELECT 1 FROM public.todo_items WHERE todo_id IS NULL) THEN
      ALTER TABLE public.todo_items ALTER COLUMN todo_id SET NOT NULL;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_todo_items_todo ON public.todo_items(todo_id, position);
  END IF;
END;
$$;

DROP INDEX IF EXISTS idx_todo_templates_list;
DROP INDEX IF EXISTS idx_todo_templates_org;

ALTER TABLE public.entity_visibility DROP CONSTRAINT IF EXISTS entity_visibility_entity_type_check;
ALTER TABLE public.entity_visibility ADD CONSTRAINT entity_visibility_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap','todo'));

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_entity_type_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap','todo'));

CREATE OR REPLACE FUNCTION public.entity_org_id(entity_type TEXT, entity_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE entity_type
    WHEN 'workspace' THEN (SELECT organization_id FROM public.workspaces WHERE id = entity_id)
    WHEN 'folder' THEN (SELECT w.organization_id FROM public.workspace_folders f JOIN public.workspaces w ON w.id = f.workspace_id WHERE f.id = entity_id)
    WHEN 'list' THEN (SELECT organization_id FROM public.task_lists WHERE id = entity_id)
    WHEN 'document' THEN (SELECT organization_id FROM public.documents WHERE id = entity_id)
    WHEN 'mindmap' THEN (SELECT organization_id FROM public.mind_maps WHERE id = entity_id)
    WHEN 'todo' THEN (SELECT organization_id FROM public.todos WHERE id = entity_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.entity_permission(e_type TEXT, e_id UUID)
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
  grants AS (
    SELECT ev.permission
    FROM public.entity_visibility ev
    WHERE ev.entity_type = e_type AND ev.entity_id = e_id
      AND ev.profile_id = auth.uid()
      AND public.entity_org_id(e_type, e_id) = public.get_my_org_id()
    UNION ALL
    SELECT ev.permission
    FROM scope s
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid() AND ev.inherit = true
    WHERE s.depth > 0
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

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todos_select_org" ON public.todos;
CREATE POLICY "todos_select_org" ON public.todos
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
    AND (
      visibility = 'public'
      OR public.get_my_role() = 'admin'
      OR public.entity_permission('todo', id) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "todos_all_admin" ON public.todos;
CREATE POLICY "todos_all_admin" ON public.todos
  FOR ALL USING (
    public.get_my_role() = 'admin' AND organization_id = public.get_my_org_id()
    OR public.perm_rank(public.entity_permission('todo', id)) >= 3
  );

DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "todo_items_select_org" ON public.todo_items;
    CREATE POLICY "todo_items_select_org" ON public.todo_items
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.todos t
          WHERE t.id = todo_items.todo_id
            AND t.organization_id = public.get_my_org_id()
            AND (
              t.visibility = 'public'
              OR public.get_my_role() = 'admin'
              OR public.entity_permission('todo', t.id) IS NOT NULL
            )
        )
      );

    DROP POLICY IF EXISTS "todo_items_all_admin" ON public.todo_items;
    CREATE POLICY "todo_items_all_admin" ON public.todo_items
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.todos t
          WHERE t.id = todo_items.todo_id
            AND t.organization_id = public.get_my_org_id()
            AND (
              public.get_my_role() = 'admin'
              OR public.perm_rank(public.entity_permission('todo', t.id)) >= 3
            )
        )
      );
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT);
DROP FUNCTION IF EXISTS public.todo_board(uuid);
DROP FUNCTION IF EXISTS public.todo_tick(uuid, integer);

CREATE OR REPLACE FUNCTION public.todo_cycle_bounds(
  p_frequency TEXT,
  p_interval_days INT,
  p_now TIMESTAMPTZ,
  p_timezone TEXT,
  p_week_start INT,
  p_time TEXT
)
RETURNS TABLE (cycle_start TIMESTAMPTZ, cycle_end TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE p_frequency
      WHEN 'weekly' THEN
        (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
          + (p_week_start - 1) * INTERVAL '1 day') AT TIME ZONE p_timezone
      WHEN 'interval' THEN
        ((p_now AT TIME ZONE p_timezone)::date
          - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
        ) AT TIME ZONE p_timezone
      ELSE
        (date_trunc('day', p_now AT TIME ZONE p_timezone)) AT TIME ZONE p_timezone
    END,
    CASE p_frequency
      WHEN 'weekly' THEN
        (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
          + (p_week_start - 1) * INTERVAL '1 day' + 7 * INTERVAL '1 day') AT TIME ZONE p_timezone
      WHEN 'interval' THEN
        ((p_now AT TIME ZONE p_timezone)::date
          - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
          + p_interval_days) AT TIME ZONE p_timezone
      WHEN 'daily' THEN
        (date_trunc('day', p_now AT TIME ZONE p_timezone)
          + CASE WHEN p_time ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN (p_time::time - TIME '00:00') ELSE INTERVAL '1 day' END) AT TIME ZONE p_timezone
      ELSE
        (date_trunc('day', p_now AT TIME ZONE p_timezone)
          + CASE WHEN p_time ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN (p_time::time - TIME '00:00') ELSE INTERVAL '1 day' END) AT TIME ZONE p_timezone
    END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) FROM public;

CREATE OR REPLACE FUNCTION public.todo_board(p_todo_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  frequency TEXT,
  interval_days INT,
  target_quantity INT,
  active BOOLEAN,
  week_days INT[],
  due_time TEXT,
  quantity_done INT,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_timezone TEXT := 'UTC';
  v_week_start INT := 1;
  v_prefs JSONB;
  v_rec RECORD;
  v_bounds RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles p WHERE p.id = v_user_id AND p.blocked = false;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT timezone INTO v_timezone
  FROM public.org_settings WHERE organization_id = v_org_id;
  IF v_timezone IS NULL OR v_timezone = '' THEN
    v_timezone := 'UTC';
  END IF;

  SELECT preferences INTO v_prefs FROM public.profiles p WHERE p.id = v_user_id;
  v_week_start := CASE WHEN v_prefs->>'week_start' = 'sunday' THEN 0 ELSE 1 END;

  FOR v_rec IN
    SELECT i.*, p.quantity_done AS stored_done, p.cycle_start AS stored_cycle_start
    FROM public.todo_items i
    LEFT JOIN public.todo_progress p
      ON p.template_id = i.id AND p.profile_id = v_user_id
    WHERE i.todo_id = p_todo_id
      AND EXISTS (
        SELECT 1 FROM public.todos td
        WHERE td.id = i.todo_id AND td.organization_id = v_org_id
      )
    ORDER BY i.position ASC, i.created_at ASC
  LOOP
    SELECT * INTO v_bounds
    FROM public.todo_cycle_bounds(v_rec.frequency, v_rec.interval_days, now(), v_timezone, v_week_start, v_rec.due_time);

    IF v_rec.stored_cycle_start IS NULL OR v_rec.stored_cycle_start < v_bounds.cycle_start THEN
      INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
      VALUES (v_rec.id, v_user_id, v_bounds.cycle_start, 0)
      ON CONFLICT (template_id, profile_id)
      DO UPDATE SET cycle_start = EXCLUDED.cycle_start, quantity_done = 0;
    END IF;

    id := v_rec.id;
    name := v_rec.name;
    frequency := v_rec.frequency;
    interval_days := v_rec.interval_days;
    target_quantity := v_rec.target_quantity;
    active := v_rec.active;
    week_days := v_rec.week_days;
    due_time := v_rec.due_time;
    quantity_done := CASE
      WHEN v_rec.stored_cycle_start IS NULL OR v_rec.stored_cycle_start < v_bounds.cycle_start
      THEN 0
      ELSE COALESCE(v_rec.stored_done, 0)
    END;
    cycle_start := v_bounds.cycle_start;
    cycle_end := v_bounds.cycle_end;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_board(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_board(UUID) FROM public;

CREATE OR REPLACE FUNCTION public.todo_tick(p_item_id UUID, p_delta INT)
RETURNS TABLE (
  quantity_done INT,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_timezone TEXT := 'UTC';
  v_week_start INT := 1;
  v_prefs JSONB;
  v_frequency TEXT;
  v_interval_days INT;
  v_target INT;
  v_due_time TEXT;
  v_bounds RECORD;
  v_row RECORD;
  v_new_done INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles p WHERE p.id = v_user_id AND p.blocked = false;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT i.frequency, i.interval_days, i.target_quantity, i.due_time
    INTO v_frequency, v_interval_days, v_target, v_due_time
  FROM public.todo_items i
  WHERE i.id = p_item_id
    AND EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = i.todo_id
        AND t.organization_id = v_org_id
        AND (
          t.visibility = 'public'
          OR public.get_my_role() = 'admin'
          OR public.entity_permission('todo', t.id) IS NOT NULL
        )
    );
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT timezone INTO v_timezone
  FROM public.org_settings WHERE organization_id = v_org_id;
  IF v_timezone IS NULL OR v_timezone = '' THEN
    v_timezone := 'UTC';
  END IF;

  SELECT preferences INTO v_prefs FROM public.profiles p WHERE p.id = v_user_id;
  v_week_start := CASE WHEN v_prefs->>'week_start' = 'sunday' THEN 0 ELSE 1 END;

  SELECT * INTO v_bounds
  FROM public.todo_cycle_bounds(v_frequency, v_interval_days, now(), v_timezone, v_week_start, v_due_time);

  SELECT * INTO v_row
  FROM public.todo_progress
  WHERE template_id = p_item_id AND profile_id = v_user_id;

  IF v_row.id IS NULL THEN
    v_new_done := GREATEST(0, LEAST(v_target, p_delta));
    INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
    VALUES (p_item_id, v_user_id, v_bounds.cycle_start, v_new_done);
  ELSIF v_row.cycle_start < v_bounds.cycle_start THEN
    v_new_done := GREATEST(0, LEAST(v_target, p_delta));
    UPDATE public.todo_progress
    SET cycle_start = v_bounds.cycle_start, quantity_done = v_new_done
    WHERE id = v_row.id;
  ELSE
    v_new_done := GREATEST(0, LEAST(v_target, v_row.quantity_done + p_delta));
    UPDATE public.todo_progress SET quantity_done = v_new_done WHERE id = v_row.id;
  END IF;

  quantity_done := v_new_done;
  cycle_start := v_bounds.cycle_start;
  cycle_end := v_bounds.cycle_end;
  RETURN NEXT;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_tick(UUID, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_tick(UUID, INT) FROM public;

-- ===== 0036_todos_dias_hora.sql =====
SET check_function_bodies = off;

DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    ALTER TABLE public.todo_items ADD COLUMN IF NOT EXISTS week_days INT[]
      CHECK (week_days IS NULL OR week_days <@ ARRAY[0,1,2,3,4,5,6]);
    ALTER TABLE public.todo_items ADD COLUMN IF NOT EXISTS due_time TEXT
      CHECK (due_time IS NULL OR due_time ~ '^([01]\d|2[0-3]):[0-5]\d$');
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT);

CREATE OR REPLACE FUNCTION public.todo_cycle_bounds(
  p_frequency TEXT,
  p_interval_days INT,
  p_now TIMESTAMPTZ,
  p_timezone TEXT,
  p_week_start INT,
  p_time TEXT
)
RETURNS TABLE (cycle_start TIMESTAMPTZ, cycle_end TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE p_frequency
      WHEN 'weekly' THEN
        (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
          + (p_week_start - 1) * INTERVAL '1 day') AT TIME ZONE p_timezone
      WHEN 'interval' THEN
        ((p_now AT TIME ZONE p_timezone)::date
          - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
        ) AT TIME ZONE p_timezone
      ELSE
        (date_trunc('day', p_now AT TIME ZONE p_timezone)) AT TIME ZONE p_timezone
    END,
    CASE p_frequency
      WHEN 'weekly' THEN
        (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
          + (p_week_start - 1) * INTERVAL '1 day' + 7 * INTERVAL '1 day') AT TIME ZONE p_timezone
      WHEN 'interval' THEN
        ((p_now AT TIME ZONE p_timezone)::date
          - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
          + p_interval_days) AT TIME ZONE p_timezone
      WHEN 'daily' THEN
        (date_trunc('day', p_now AT TIME ZONE p_timezone)
          + CASE WHEN p_time ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN (p_time::time - TIME '00:00') ELSE INTERVAL '1 day' END) AT TIME ZONE p_timezone
      ELSE
        (date_trunc('day', p_now AT TIME ZONE p_timezone)
          + CASE WHEN p_time ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN (p_time::time - TIME '00:00') ELSE INTERVAL '1 day' END) AT TIME ZONE p_timezone
    END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) FROM public;

DROP FUNCTION IF EXISTS public.todo_board(UUID);
DROP FUNCTION IF EXISTS public.todo_tick(UUID, INT);

CREATE OR REPLACE FUNCTION public.todo_board(p_todo_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  frequency TEXT,
  interval_days INT,
  target_quantity INT,
  active BOOLEAN,
  week_days INT[],
  due_time TEXT,
  quantity_done INT,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_timezone TEXT := 'UTC';
  v_week_start INT := 1;
  v_prefs JSONB;
  v_rec RECORD;
  v_bounds RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles p WHERE p.id = v_user_id AND p.blocked = false;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT timezone INTO v_timezone
  FROM public.org_settings WHERE organization_id = v_org_id;
  IF v_timezone IS NULL OR v_timezone = '' THEN
    v_timezone := 'UTC';
  END IF;

  SELECT preferences INTO v_prefs FROM public.profiles p WHERE p.id = v_user_id;
  v_week_start := CASE WHEN v_prefs->>'week_start' = 'sunday' THEN 0 ELSE 1 END;

  FOR v_rec IN
    SELECT i.*, p.quantity_done AS stored_done, p.cycle_start AS stored_cycle_start
    FROM public.todo_items i
    LEFT JOIN public.todo_progress p
      ON p.template_id = i.id AND p.profile_id = v_user_id
    WHERE i.todo_id = p_todo_id
      AND EXISTS (
        SELECT 1 FROM public.todos td
        WHERE td.id = i.todo_id AND td.organization_id = v_org_id
      )
    ORDER BY i.position ASC, i.created_at ASC
  LOOP
    SELECT * INTO v_bounds
    FROM public.todo_cycle_bounds(v_rec.frequency, v_rec.interval_days, now(), v_timezone, v_week_start, v_rec.due_time);

    IF v_rec.stored_cycle_start IS NULL OR v_rec.stored_cycle_start < v_bounds.cycle_start THEN
      INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
      VALUES (v_rec.id, v_user_id, v_bounds.cycle_start, 0)
      ON CONFLICT (template_id, profile_id)
      DO UPDATE SET cycle_start = EXCLUDED.cycle_start, quantity_done = 0;
    END IF;

    id := v_rec.id;
    name := v_rec.name;
    frequency := v_rec.frequency;
    interval_days := v_rec.interval_days;
    target_quantity := v_rec.target_quantity;
    active := v_rec.active;
    week_days := v_rec.week_days;
    due_time := v_rec.due_time;
    quantity_done := CASE
      WHEN v_rec.stored_cycle_start IS NULL OR v_rec.stored_cycle_start < v_bounds.cycle_start
      THEN 0
      ELSE COALESCE(v_rec.stored_done, 0)
    END;
    cycle_start := v_bounds.cycle_start;
    cycle_end := v_bounds.cycle_end;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_board(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_board(UUID) FROM public;

CREATE OR REPLACE FUNCTION public.todo_tick(p_item_id UUID, p_delta INT)
RETURNS TABLE (
  quantity_done INT,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_timezone TEXT := 'UTC';
  v_week_start INT := 1;
  v_prefs JSONB;
  v_frequency TEXT;
  v_interval_days INT;
  v_target INT;
  v_due_time TEXT;
  v_bounds RECORD;
  v_row RECORD;
  v_new_done INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles p WHERE p.id = v_user_id AND p.blocked = false;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT i.frequency, i.interval_days, i.target_quantity, i.due_time
    INTO v_frequency, v_interval_days, v_target, v_due_time
  FROM public.todo_items i
  WHERE i.id = p_item_id
    AND EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = i.todo_id
        AND t.organization_id = v_org_id
        AND (
          t.visibility = 'public'
          OR public.get_my_role() = 'admin'
          OR public.entity_permission('todo', t.id) IS NOT NULL
        )
    );
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT timezone INTO v_timezone
  FROM public.org_settings WHERE organization_id = v_org_id;
  IF v_timezone IS NULL OR v_timezone = '' THEN
    v_timezone := 'UTC';
  END IF;

  SELECT preferences INTO v_prefs FROM public.profiles p WHERE p.id = v_user_id;
  v_week_start := CASE WHEN v_prefs->>'week_start' = 'sunday' THEN 0 ELSE 1 END;

  SELECT * INTO v_bounds
  FROM public.todo_cycle_bounds(v_frequency, v_interval_days, now(), v_timezone, v_week_start, v_due_time);

  SELECT * INTO v_row
  FROM public.todo_progress
  WHERE template_id = p_item_id AND profile_id = v_user_id;

  IF v_row.id IS NULL THEN
    v_new_done := GREATEST(0, LEAST(v_target, p_delta));
    INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
    VALUES (p_item_id, v_user_id, v_bounds.cycle_start, v_new_done);
  ELSIF v_row.cycle_start < v_bounds.cycle_start THEN
    v_new_done := GREATEST(0, LEAST(v_target, p_delta));
    UPDATE public.todo_progress
    SET cycle_start = v_bounds.cycle_start, quantity_done = v_new_done
    WHERE id = v_row.id;
  ELSE
    v_new_done := GREATEST(0, LEAST(v_target, v_row.quantity_done + p_delta));
    UPDATE public.todo_progress SET quantity_done = v_new_done WHERE id = v_row.id;
  END IF;

  quantity_done := v_new_done;
  cycle_start := v_bounds.cycle_start;
  cycle_end := v_bounds.cycle_end;
  RETURN NEXT;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_tick(UUID, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_tick(UUID, INT) FROM public;