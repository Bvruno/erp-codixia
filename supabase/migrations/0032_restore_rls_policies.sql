-- ============================================================
-- PARTE 32: Restauración de policies RLS
-- La BD perdió todas las policies de RLS (estado observado:
-- RLS habilitado sin policies en workspaces, workspace_folders,
-- task_lists, entity_visibility y resto de tablas de contenido),
-- dejando todas las lecturas vacías y los INSERT con 42501.
-- Esta migración recrea el estado final de policies de todo el
-- repo (0011, 0015, 0019, 0023, 0024, 0028, 0029, 0030, 0031)
-- de forma idempotente: DROP IF EXISTS + CREATE.
-- ============================================================

SET check_function_bodies = off;

-- ============ 0. Seguridad heredada de 0029 ============
-- (idempotente: no rompe nada si 0029 ya se aplicó)

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

-- ============ 1. organizations ============

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

-- ============ 2. profiles ============

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

-- ============ 3. shifts ============

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shifts_select_own_org" ON shifts;
CREATE POLICY "shifts_select_own_org" ON shifts
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "shifts_all_admin" ON shifts;
CREATE POLICY "shifts_all_admin" ON shifts
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- ============ 4. workspaces (0023) ============

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

-- ============ 5. workspace_folders (0023) ============

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

-- ============ 6. task_lists (0023) ============

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

-- ============ 7. documents (0023) ============

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

-- ============ 8. document_pages (0023) ============

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

-- ============ 9. tasks (0023 + tasks_update_assigned 0008) ============

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

-- ============ 10. task_notes (0023) ============

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

-- ============ 11. entity_visibility (0015) ============

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

-- ============ 12. invitations (0008, sin select_public) ============

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_all_admin" ON invitations;
CREATE POLICY "invitations_all_admin" ON invitations
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- ============ 13. time_entries (0008 + 0028) ============

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

-- ============ 14. schedules (0030) ============

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

-- ============ 15. permissions (0008) ============

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

-- ============ 16. notifications (0008) ============

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_all_own" ON notifications;
CREATE POLICY "notif_all_own" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- ============ 17. telegram_config (0008) ============

ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_all_admin" ON telegram_config;
CREATE POLICY "telegram_all_admin" ON telegram_config
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- ============ 18. org_settings (0024) ============

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_settings_select_own_org" ON org_settings;
CREATE POLICY "org_settings_select_own_org" ON org_settings
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "org_settings_all_admin" ON org_settings;
CREATE POLICY "org_settings_all_admin" ON org_settings
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- ============ 19. mind_maps (0031) ============

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