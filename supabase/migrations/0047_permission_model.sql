-- ============================================================
-- MODELO DE PERMISOS (semántica global)
--  1) entity_permission: el grant de ancestro (inherit) aplica
--     SOLO a contenido public, con nivel capado a write.
--  2) container_write_level: permite INSERT (crear) con write en
--     el ancestro (carpeta/workspace).
--  3) grant_creator_access: el autor de contenido recibe manage
--     automático (puede leer/editar/eliminar lo que creó).
--  4) tasks.created_by + trigger: eliminar lo propio.
--  5) Policies: INSERT write-ancestro / UPDATE >=2 / DELETE >=3.
-- ============================================================

-- ------------------------------------------------------------
-- 1) entity_permission reescrita
--    - Grant directo: nivel completo (aislado).
--    - Ancestro con inherit=true: solo si el target es public,
--      nivel capado a write (nunca eliminar vía herencia).
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2) container_write_level: nivel de write en ancestros del
--    contenedor (carpeta/workspace) para permitir crear.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 3) grant_creator_access: manage automático al autor
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4) tasks: created_by con fallback al autor
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 5) Policies reestructuradas
--    INSERT: admin o write en el ancestro (crear).
--    UPDATE: admin o nivel >= 2 (editar).
--    DELETE: admin o nivel >= 3 (manage/creador).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "documents_all_admin" ON documents;
CREATE POLICY "documents_insert_write" ON documents
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
CREATE POLICY "documents_update_write" ON documents
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('document', id)) >= 2
  );
CREATE POLICY "documents_delete_manage" ON documents
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('document', id)) >= 3
  );

DROP POLICY IF EXISTS "task_lists_all_admin" ON task_lists;
CREATE POLICY "task_lists_insert_write" ON task_lists
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
CREATE POLICY "task_lists_update_write" ON task_lists
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('list', id)) >= 2
  );
CREATE POLICY "task_lists_delete_manage" ON task_lists
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('list', id)) >= 3
  );

DROP POLICY IF EXISTS "folders_all_admin" ON workspace_folders;
CREATE POLICY "folders_insert_write" ON workspace_folders
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(parent_folder_id, workspace_id) >= 2
  );
CREATE POLICY "folders_update_write" ON workspace_folders
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('folder', id)) >= 2
  );
CREATE POLICY "folders_delete_manage" ON workspace_folders
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('folder', id)) >= 3
  );

DROP POLICY IF EXISTS "mind_maps_all_admin" ON mind_maps;
CREATE POLICY "mind_maps_insert_write" ON mind_maps
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
CREATE POLICY "mind_maps_update_write" ON mind_maps
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 2
  );
CREATE POLICY "mind_maps_delete_manage" ON mind_maps
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 3
  );

DROP POLICY IF EXISTS "todos_all_admin" ON todos;
CREATE POLICY "todos_insert_write" ON todos
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
CREATE POLICY "todos_update_write" ON todos
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('todo', id)) >= 2
  );
CREATE POLICY "todos_delete_manage" ON todos
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('todo', id)) >= 3
  );

-- Tareas: eliminar = manage o el creador (write ya no elimina)
DROP POLICY IF EXISTS "tasks_delete_admin" ON tasks;
CREATE POLICY "tasks_delete_admin" ON tasks
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR (organization_id = get_my_org_id() AND public.perm_rank(public.task_permission(id)) >= 3)
    OR (organization_id = get_my_org_id() AND created_by = auth.uid())
  );