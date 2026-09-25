CREATE OR REPLACE FUNCTION public.entity_effective(e_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE target AS (
    SELECT visibility, organization_id FROM public.entities WHERE id = e_id
  ),
  up(depth, id, parent_id) AS (
    SELECT 0, e.id, e.parent_id FROM public.entities e WHERE e.id = e_id
    UNION ALL
    SELECT u.depth + 1, p.id, p.parent_id
    FROM up u
    JOIN public.entities p ON p.id = u.parent_id
    WHERE u.depth < 64
  ),
  grants AS (
    SELECT ev.permission
    FROM public.entity_visibility ev
    CROSS JOIN target t
    WHERE ev.entity_id = e_id
      AND ev.profile_id = auth.uid()
      AND t.organization_id = public.get_my_org_id()
    UNION ALL
    SELECT CASE WHEN public.perm_rank(ev.permission) >= 2 THEN 'write' ELSE ev.permission END
    FROM up u
    JOIN public.entity_visibility ev
      ON ev.entity_id = u.id
      AND ev.profile_id = auth.uid()
      AND ev.inherit = true
    CROSS JOIN target t
    WHERE u.depth > 0
      AND t.visibility <> 'private'
      AND t.organization_id = public.get_my_org_id()
  )
  SELECT CASE max(public.perm_rank(g.permission))
    WHEN 3 THEN 'manage'
    WHEN 2 THEN 'write'
    WHEN 1 THEN 'read'
    ELSE NULL
  END
  FROM grants g;
$$;