-- ============================================================
-- FIX: herencia de permisos de workspace hacia contenido
-- dentro de carpetas (bug desde 0023, persistente en 0047).
--
--  El CTE recursivo de entity_permission y container_write_level
--  etiquetaba el salto carpeta -> workspace como tipo 'folder',
--  pero el grant del workspace está almacenado con
--  entity_type='workspace'. El join `ev.entity_type = s.t`
--  nunca matcheaba -> los grants de workspace eran código muerto
--  para contenido dentro de carpetas:
--    - INSERT en carpeta denegado (403 RLS) pese a manage.
--    - UPDATE/DELETE de contenido en carpeta denegados.
--    - Navegación grants_only rota dentro de carpetas.
--  Listas raíz (folder_id NULL) ya funcionaban.
--
--  Fix: el hop final hacia el workspace lleva tipo 'workspace'.
--  Semántica de caps intacta (heredero con inherit=true se capa
--  a write; nunca eliminar vía herencia; container_write_level
--  sin cap de nivel, como antes).
-- ============================================================

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
        WHEN s.t = 'folder' THEN (CASE WHEN (SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
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
      CASE WHEN f.parent_folder_id IS NOT NULL THEN 'folder' ELSE 'workspace' END,
      COALESCE(f.parent_folder_id, f.workspace_id)
    FROM scope s
    JOIN public.workspace_folders f ON f.id = s.id
    WHERE s.depth < 12 AND s.id IS NOT NULL AND s.t = 'folder'
  )
  SELECT max(public.perm_rank(ev.permission))
  FROM scope s
  JOIN public.entity_visibility ev
    ON ev.entity_type = s.t AND ev.entity_id = s.id
    AND ev.profile_id = auth.uid() AND ev.inherit = true
  WHERE public.entity_org_id(s.t, s.id) = public.get_my_org_id();
$$;