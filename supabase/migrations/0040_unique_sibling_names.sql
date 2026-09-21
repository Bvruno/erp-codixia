-- ============================================================
-- PARTE 40: Unicidad de nombres entre hermanos (slugs por nombre)
-- Regla del negocio: no pueden existir dos entidades con el
-- mismo nombre en el mismo nivel:
--   - workspaces: únicos por organización
--   - workspace_folders: únicos por (workspace, carpeta padre)
--   - task_lists / documents / mind_maps / todos: únicos por
--     contenedor (carpeta o raíz del workspace)
-- COALESCE con un UUID centinela: Postgres trata NULL como
-- distinto en índices únicos; las entidades de raíz usan
-- folder_id NULL / parent_folder_id NULL.
-- ============================================================

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