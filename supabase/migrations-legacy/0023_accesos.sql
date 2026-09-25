-- ============================================================
-- PARTE 23: Accesos granulares (read/write/manage + herencia)
-- Plataforma cerrada: registro solo por invitación.
-- entity_visibility pasa de "miembro con vista" a "grant con
-- nivel": read | write | manage. inherit=true propaga el grant
-- a descendientes (subcarpetas, listas, documentos).
-- ============================================================

-- PG16+ valida el cuerpo de funciones SQL al crearlas usando el
-- search_path de la función (''), por lo que las referencias a
-- otras funciones fallan. Todas las referencias van calificadas
-- con public./auth. y se desactiva la validación de respaldo.
SET check_function_bodies = off;

-- ============ 1. Schema ============

ALTER TABLE entity_visibility
  ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'read'
    CHECK (permission IN ('read','write','manage')),
  ADD COLUMN IF NOT EXISTS inherit BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS entity_type TEXT
    CHECK (entity_type IN ('workspace','folder','list','document')),
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS permission TEXT
    CHECK (permission IN ('read','write','manage')),
  ADD COLUMN IF NOT EXISTS inherit BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_ev_permission ON entity_visibility(profile_id, permission);
CREATE INDEX IF NOT EXISTS idx_inv_scope ON invitations(entity_type, entity_id);

-- ============ 2. Helpers ============

-- Dependencia de 0015/0019: la BD puede no tenerla si la migración
-- no se aplicó completa. Definición idempotente (versión 0019).
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
  END;
$$;

CREATE OR REPLACE FUNCTION perm_rank(p TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p WHEN 'read' THEN 1 WHEN 'write' THEN 2 WHEN 'manage' THEN 3 ELSE 0 END;
$$;

-- Nivel efectivo de permiso del usuario actual sobre una entidad,
-- caminando ancestros (carpeta -> parent_folder... -> workspace).
-- El grant propio cuenta siempre; los de ancestros solo si inherit=true.
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
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
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

-- Nivel sobre una tarea via su lista (cadena de ancestros)
CREATE OR REPLACE FUNCTION task_permission(task_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.entity_permission('list', t.list_id)
  FROM public.tasks t
  WHERE t.id = task_id AND t.list_id IS NOT NULL;
$$;

-- ============ 3. RLS: workspaces ============

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

-- ============ 4. RLS: folders ============

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

-- ============ 5. RLS: task_lists ============

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

-- ============ 6. RLS: documents ============

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

-- ============ 7. RLS: document_pages (lectura vs escritura) ============

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

-- ============ 8. RLS: tasks (SELECT acotado + escritura por grant) ============

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

-- ============ 9. RLS: task_notes ============

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
