CREATE OR REPLACE FUNCTION entity_permissions_bulk(e_type TEXT, e_ids UUID[])
RETURNS TABLE(entity_id UUID, permission TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE scope(entity_id, depth, t, id) AS (
    SELECT e.eid, 0, e_type::text, e.eid
    FROM unnest(e_ids) AS e(eid)
    UNION ALL
    SELECT s.entity_id, s.depth + 1,
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
    SELECT s.entity_id,
      (CASE s.t
        WHEN 'workspace' THEN (SELECT visibility FROM public.workspaces WHERE id = s.id)
        WHEN 'folder' THEN (SELECT visibility FROM public.workspace_folders WHERE id = s.id)
        WHEN 'list' THEN (SELECT visibility FROM public.task_lists WHERE id = s.id)
        WHEN 'document' THEN (SELECT visibility FROM public.documents WHERE id = s.id)
        WHEN 'mindmap' THEN (SELECT visibility FROM public.mind_maps WHERE id = s.id)
        WHEN 'todo' THEN (SELECT visibility FROM public.todos WHERE id = s.id)
      END = 'public') AS is_public
    FROM scope s
    WHERE s.depth = 0
  ),
  grants AS (
    SELECT s.entity_id, ev.permission
    FROM scope s
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid()
    WHERE s.depth = 0
      AND public.entity_org_id(s.t, s.id) = public.get_my_org_id()
    UNION ALL
    SELECT s.entity_id,
      CASE WHEN public.perm_rank(ev.permission) >= 2 THEN 'write' ELSE ev.permission END
    FROM scope s
    JOIN target_public tp ON tp.entity_id = s.entity_id
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid() AND ev.inherit = true
    WHERE s.depth > 0 AND tp.is_public
      AND public.entity_org_id(s.t, s.id) = public.get_my_org_id()
  )
  SELECT e.eid AS entity_id,
    CASE max(public.perm_rank(g.permission))
      WHEN 3 THEN 'manage'
      WHEN 2 THEN 'write'
      WHEN 1 THEN 'read'
      ELSE NULL
    END AS permission
  FROM unnest(e_ids) AS e(eid)
  LEFT JOIN grants g ON g.entity_id = e.eid
  GROUP BY e.eid;
$$;