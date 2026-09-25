-- ============================================================
-- PARTE 10: Rol en invitaciones
-- ============================================================

ALTER TABLE invitations
  ADD COLUMN role TEXT NOT NULL DEFAULT 'collaborator'
  CHECK (role IN ('admin', 'collaborator'));
