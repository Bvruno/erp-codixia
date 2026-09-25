-- ============================================================
-- 0065: notas privadas — solo el creador las ve (paridad con prod)
-- ------------------------------------------------------------
-- Prod recibió un hotfix manual (notes_creator_only, 2026-09-16)
-- que dejó `notes` visible/editable solo para su creador. El
-- entorno dev quedó con las policies viejas por organización.
-- Esta migración replica exacta la política de prod para que
-- dev y prod queden idénticos (greenfield incluido).
--
-- También documenta el drop de `tasks_select_org`, aplicado a
-- mano en prod (drop_tasks_select_org, 2026-09-16), para que el
-- repo refleje el estado real.
--
-- IDEMPOTENTE: puede re-ejecutarse sin error.
-- ============================================================

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
