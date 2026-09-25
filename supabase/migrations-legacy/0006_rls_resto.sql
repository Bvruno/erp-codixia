-- ============================================================
-- PARTE 6: RLS para Notas, Invitaciones, Horas, Permisos, Notificaciones
-- ============================================================

-- Task Notes
ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select_task_org" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = task_notes.task_id
      AND p.organization_id = t.organization_id
      AND p.blocked = false
    )
  );

CREATE POLICY "notes_insert_org" ON task_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = task_notes.task_id
      AND p.organization_id = t.organization_id
      AND p.blocked = false
    )
  );

-- Invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_all_admin" ON invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = invitations.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

CREATE POLICY "invitations_select_public" ON invitations
  FOR SELECT USING (true);

-- Time Entries
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_select_org" ON time_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = time_entries.organization_id AND blocked = false
    )
  );

CREATE POLICY "time_insert_own" ON time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Permissions
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perm_select_org" ON permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = permissions.organization_id AND blocked = false
    )
  );

CREATE POLICY "perm_insert_own" ON permissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "perm_update_admin" ON permissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = permissions.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

-- Notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_all_own" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- Telegram Config
ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_all_admin" ON telegram_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = telegram_config.organization_id
      AND role = 'admin' AND blocked = false
    )
  );
