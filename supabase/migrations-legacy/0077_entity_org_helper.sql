-- ============================================================
-- 0077: helper `entity_org` para policies.
--
-- Las policies de `entity_visibility` consultaban `entities` dentro de
-- la propia policy. Como `entities` tiene RLS sin policies, esa
-- subconsulta se evaluaba como el rol invoker (authenticated) → cero
-- filas → la policy nunca permitía leer/escribir grants (y rompía
-- `ev_select`/`ev_write`).
--
-- Fix: `entity_org(e_id)` SECURITY DEFINER devuelve la organización de
-- la entidad; las policies la usan en lugar de consultar `entities`.
-- ============================================================

CREATE OR REPLACE FUNCTION public.entity_org(e_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.entities WHERE id = e_id;
$$;

REVOKE EXECUTE ON FUNCTION public.entity_org(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.entity_org(UUID) TO authenticated;

DROP POLICY IF EXISTS "ev_select" ON public.entity_visibility;
CREATE POLICY "ev_select" ON public.entity_visibility
  FOR SELECT USING (
    public.entity_org(entity_id) = public.get_my_org_id()
    AND (auth.uid() = profile_id OR public.get_my_role() = 'admin')
  );

DROP POLICY IF EXISTS "ev_write" ON public.entity_visibility;
CREATE POLICY "ev_write" ON public.entity_visibility
  FOR ALL
  USING (
    public.entity_org(entity_id) = public.get_my_org_id()
    AND public.entity_manageable(entity_id)
  )
  WITH CHECK (
    public.entity_org(entity_id) = public.get_my_org_id()
    AND public.entity_manageable(entity_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = entity_visibility.profile_id
        AND p.organization_id = public.get_my_org_id()
        AND p.blocked = false
    )
  );
