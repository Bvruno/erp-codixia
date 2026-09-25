SET check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.entity_effective(e_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH target AS (
    SELECT visibility, organization_id FROM public.entities WHERE id = e_id
  ),
  up(depth, id, parent_id) AS (
    SELECT e.id, e.parent_id, 0 FROM public.entities e WHERE e.id = e_id
    UNION ALL
    SELECT p.id, p.parent_id, u.depth + 1
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

CREATE OR REPLACE FUNCTION public.entity_readable(e_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.id = e_id
      AND e.organization_id = public.get_my_org_id()
      AND (
        public.get_my_role() = 'admin'
        OR public.entity_effective(e_id) IS NOT NULL
        OR (public.get_my_access_mode() = 'org' AND e.visibility = 'public')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.entity_writable(e_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.entities e WHERE e.id = e_id AND e.organization_id = public.get_my_org_id())
    AND (
      public.get_my_role() = 'admin'
      OR public.perm_rank(public.entity_effective(e_id)) >= 2
    );
$$;

CREATE OR REPLACE FUNCTION public.entity_manageable(e_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.entities e WHERE e.id = e_id AND e.organization_id = public.get_my_org_id())
    AND (
      public.get_my_role() = 'admin'
      OR public.perm_rank(public.entity_effective(e_id)) >= 3
    );
$$;

CREATE OR REPLACE FUNCTION public.entity_navigation_visible(e_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE down(id) AS (
    SELECT e_id
    UNION
    SELECT e.id FROM public.entities e JOIN down d ON e.parent_id = d.id
  )
  SELECT EXISTS (SELECT 1 FROM down d WHERE public.entity_readable(d.id));
$$;

CREATE OR REPLACE FUNCTION public.entity_permission(e_type TEXT, e_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.entity_effective(e_id);
$$;

CREATE OR REPLACE FUNCTION public.entity_org_id(entity_type TEXT, entity_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.entities WHERE id = entity_id;
$$;

CREATE OR REPLACE FUNCTION public.entity_permissions_bulk(e_type TEXT, e_ids UUID[])
RETURNS TABLE(entity_id UUID, permission TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.eid, public.entity_effective(u.eid)
  FROM unnest(e_ids) AS u(eid);
$$;

CREATE OR REPLACE FUNCTION public.task_permission(task_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.entity_effective(t.list_id)
  FROM public.tasks t
  WHERE t.id = task_id AND t.list_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.rebuild_entity_policies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r RECORD;
  p RECORD;
BEGIN
  FOR r IN SELECT clave, tabla, parent_expr FROM public.entity_types LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tabla
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, r.tabla);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.entity_navigation_visible(id))',
      r.tabla || '_select_visible', r.tabla
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.entity_writable(id))',
      r.tabla || '_update_writable', r.tabla
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (public.entity_manageable(id))',
      r.tabla || '_delete_manageable', r.tabla
    );

    IF r.parent_expr IS NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.get_my_role() = ''admin'' AND organization_id = public.get_my_org_id())',
        r.tabla || '_insert_writable', r.tabla
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.entity_writable(%s))',
        r.tabla || '_insert_writable', r.tabla, r.parent_expr
      );
    END IF;
  END LOOP;
END;
$$;

SELECT public.rebuild_entity_policies();

DROP POLICY IF EXISTS "ev_select" ON public.entity_visibility;
CREATE POLICY "ev_select" ON public.entity_visibility
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_visibility.entity_id
        AND e.organization_id = public.get_my_org_id()
    )
    AND (auth.uid() = profile_id OR public.get_my_role() = 'admin')
  );

DROP POLICY IF EXISTS "ev_write_admin" ON public.entity_visibility;
CREATE POLICY "ev_write" ON public.entity_visibility
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_visibility.entity_id
        AND e.organization_id = public.get_my_org_id()
    )
    AND public.entity_manageable(entity_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_visibility.entity_id
        AND e.organization_id = public.get_my_org_id()
    )
    AND public.entity_manageable(entity_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = entity_visibility.profile_id
        AND p.organization_id = public.get_my_org_id()
        AND p.blocked = false
    )
  );

DROP POLICY IF EXISTS "tasks_delete_admin" ON public.tasks;
CREATE POLICY "tasks_delete_admin" ON public.tasks
  FOR DELETE USING (
    (public.get_my_role() = 'admin' AND organization_id = public.get_my_org_id())
    OR (organization_id = public.get_my_org_id() AND public.perm_rank(public.task_permission(id)) >= 3)
    OR (organization_id = public.get_my_org_id() AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "tasks_update_assigned" ON public.tasks;
CREATE POLICY "tasks_update_assigned" ON public.tasks
  FOR UPDATE USING (
    organization_id = public.get_my_org_id() AND auth.uid() = assigned_to
  );

REVOKE EXECUTE ON FUNCTION public.entity_effective(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.entity_readable(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.entity_writable(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.entity_manageable(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.entity_navigation_visible(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.rebuild_entity_policies() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.entity_effective(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_readable(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_writable(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_manageable(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_navigation_visible(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_permission(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_org_id(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_permissions_bulk(TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_permission(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.container_write_level(UUID, UUID);
DROP FUNCTION IF EXISTS public.folder_navigation_visible(UUID);
DROP FUNCTION IF EXISTS public.workspace_navigation_visible(UUID);