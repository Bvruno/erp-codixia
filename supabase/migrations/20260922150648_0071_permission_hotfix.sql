-- ============================================================
-- 0071: HOTFIX de aislamiento entre organizaciones.
--
-- Problema: las policies de escritura de las entidades del árbol
-- tenían la rama `get_my_role() = 'admin'` SIN verificar que la fila
-- pertenezca a la organización del usuario. Un admin de otra org podía
-- INSERTAR/ACTUALIZAR/ELIMINAR entidades por UUID (las SELECT sí
-- validaban org).
--
-- Fix: toda rama admin exige `organization_id = get_my_org_id()`
-- (workspace_folders no tiene organization_id: se valida vía workspace).
-- Idempotente: puede re-ejecutarse.
-- ============================================================

-- ---- workspace_folders ----
DROP POLICY IF EXISTS "folders_insert_write" ON workspace_folders;
CREATE POLICY "folders_insert_write" ON workspace_folders
  FOR INSERT WITH CHECK (
    (
      get_my_role() = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = workspace_id AND w.organization_id = public.get_my_org_id()
      )
    )
    OR public.container_write_level(parent_folder_id, workspace_id) >= 2
  );

DROP POLICY IF EXISTS "folders_update_write" ON workspace_folders;
CREATE POLICY "folders_update_write" ON workspace_folders
  FOR UPDATE USING (
    (
      get_my_role() = 'admin'
      AND public.entity_org_id('folder', id) = public.get_my_org_id()
    )
    OR public.perm_rank(public.entity_permission('folder', id)) >= 2
  );

DROP POLICY IF EXISTS "folders_delete_manage" ON workspace_folders;
CREATE POLICY "folders_delete_manage" ON workspace_folders
  FOR DELETE USING (
    (
      get_my_role() = 'admin'
      AND public.entity_org_id('folder', id) = public.get_my_org_id()
    )
    OR public.perm_rank(public.entity_permission('folder', id)) >= 3
  );

-- ---- task_lists ----
DROP POLICY IF EXISTS "task_lists_insert_write" ON task_lists;
CREATE POLICY "task_lists_insert_write" ON task_lists
  FOR INSERT WITH CHECK (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );

DROP POLICY IF EXISTS "task_lists_update_write" ON task_lists;
CREATE POLICY "task_lists_update_write" ON task_lists
  FOR UPDATE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('list', id)) >= 2
  );

DROP POLICY IF EXISTS "task_lists_delete_manage" ON task_lists;
CREATE POLICY "task_lists_delete_manage" ON task_lists
  FOR DELETE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('list', id)) >= 3
  );

-- ---- documents ----
DROP POLICY IF EXISTS "documents_insert_write" ON documents;
CREATE POLICY "documents_insert_write" ON documents
  FOR INSERT WITH CHECK (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );

DROP POLICY IF EXISTS "documents_update_write" ON documents;
CREATE POLICY "documents_update_write" ON documents
  FOR UPDATE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('document', id)) >= 2
  );

DROP POLICY IF EXISTS "documents_delete_manage" ON documents;
CREATE POLICY "documents_delete_manage" ON documents
  FOR DELETE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('document', id)) >= 3
  );

-- ---- mind_maps ----
DROP POLICY IF EXISTS "mind_maps_insert_write" ON mind_maps;
CREATE POLICY "mind_maps_insert_write" ON mind_maps
  FOR INSERT WITH CHECK (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );

DROP POLICY IF EXISTS "mind_maps_update_write" ON mind_maps;
CREATE POLICY "mind_maps_update_write" ON mind_maps
  FOR UPDATE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 2
  );

DROP POLICY IF EXISTS "mind_maps_delete_manage" ON mind_maps;
CREATE POLICY "mind_maps_delete_manage" ON mind_maps
  FOR DELETE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 3
  );

-- ---- todos ----
DROP POLICY IF EXISTS "todos_insert_write" ON todos;
CREATE POLICY "todos_insert_write" ON todos
  FOR INSERT WITH CHECK (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );

DROP POLICY IF EXISTS "todos_update_write" ON todos;
CREATE POLICY "todos_update_write" ON todos
  FOR UPDATE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('todo', id)) >= 2
  );

DROP POLICY IF EXISTS "todos_delete_manage" ON todos;
CREATE POLICY "todos_delete_manage" ON todos
  FOR DELETE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('todo', id)) >= 3
  );

-- ---- formularios ----
DROP POLICY IF EXISTS "formularios_insert_write" ON formularios;
CREATE POLICY "formularios_insert_write" ON formularios
  FOR INSERT WITH CHECK (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );

DROP POLICY IF EXISTS "formularios_update_write" ON formularios;
CREATE POLICY "formularios_update_write" ON formularios
  FOR UPDATE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('formulario', id)) >= 2
  );

DROP POLICY IF EXISTS "formularios_delete_manage" ON formularios;
CREATE POLICY "formularios_delete_manage" ON formularios
  FOR DELETE USING (
    (get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR public.perm_rank(public.entity_permission('formulario', id)) >= 3
  );
