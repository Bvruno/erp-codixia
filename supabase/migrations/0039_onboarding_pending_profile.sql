-- ============================================================
-- PARTE 39: Onboarding flag en profiles (fuente de verdad en BD)
-- El flag vivía en user_metadata (JWT/GoTrue); limpiarlo vía
-- auth.admin.updateUserById resultó frágil y dejaba al dueño
-- atascado en /onboarding. Ahora es una columna de profiles,
-- mutable por SQL directo y leída fresca por el middleware.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_pending BOOLEAN NOT NULL DEFAULT false;