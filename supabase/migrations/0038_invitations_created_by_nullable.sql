-- ============================================================
-- PARTE 38: Invitaciones de sistema (creadas por el desarrollador)
-- scripts/create-company-invite.mjs crea la empresa + link de
-- invitación antes de que exista cualquier perfil en la org.
-- ============================================================

ALTER TABLE invitations
  ALTER COLUMN created_by DROP NOT NULL;