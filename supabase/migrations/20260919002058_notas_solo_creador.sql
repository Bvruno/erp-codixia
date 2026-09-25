-- 0065: notas privadas — solo el creador las ve (paridad con prod)
DROP POLICY IF EXISTS "notes_select_org" ON public.notes;
DROP POLICY IF EXISTS "notes_write_org" ON public.notes;
DROP POLICY IF EXISTS "notes_select_own" ON public.notes;
DROP POLICY IF EXISTS "notes_insert_org" ON public.notes;
DROP POLICY IF EXISTS "notes_update_own" ON public.notes;
DROP POLICY IF EXISTS "notes_delete_own" ON public.notes;

CREATE POLICY "notes_select_own" ON public.notes
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "notes_insert_org" ON public.notes
  FOR INSERT WITH CHECK (
    public.get_my_org_id() = organization_id
    AND created_by = auth.uid()
  );

CREATE POLICY "notes_update_own" ON public.notes
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "notes_delete_own" ON public.notes
  FOR DELETE USING (created_by = auth.uid());

DROP POLICY IF EXISTS "tasks_select_org" ON public.tasks;