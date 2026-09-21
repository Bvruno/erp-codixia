-- ============================================================
-- PARTE 28: RLS time_entries — admin ALL + corrección propia
-- El usuario registra/edita/elimina sus entradas; el admin
-- registra y corrige entradas de cualquier miembro.
-- ============================================================

DROP POLICY IF EXISTS "time_insert_own" ON time_entries;

CREATE POLICY "time_all_admin" ON time_entries
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

CREATE POLICY "time_insert_own" ON time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id AND organization_id = get_my_org_id());

CREATE POLICY "time_own_update" ON time_entries
  FOR UPDATE USING (auth.uid() = user_id AND organization_id = get_my_org_id());

CREATE POLICY "time_own_delete" ON time_entries
  FOR DELETE USING (auth.uid() = user_id AND organization_id = get_my_org_id());
