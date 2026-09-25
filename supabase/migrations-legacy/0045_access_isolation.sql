-- ============================================================
-- AISLAMIENTO DE ACCESO POR ENTIDAD (access_mode)
--  Invitados por link scoped (grants_only) ven SOLO sus grants:
--  ni contenido public circundante ni carpetas sin grant.
--  Navegación fantasma: carpetas/workspaces ancestros de una
--  entidad con grant se ven como ruta, sin dar acceso al resto.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columna de modo de acceso + helper
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2) Navegación fantasma (recursiva)
--    Una carpeta es navegable si: grant propio en la carpeta,
--    entidad hija con grant, o subcarpeta navegable.
-- ------------------------------------------------------------
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

-- Workspace navegable si: entidad root (sin carpeta) con grant o
-- carpeta raíz navegable.
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

-- ------------------------------------------------------------
-- 3) Policies SELECT aisladas
--    grants_only: exige grant (o ruta de navegación en el caso
--    de carpetas/workspaces). org: comportamiento actual.
-- ------------------------------------------------------------
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