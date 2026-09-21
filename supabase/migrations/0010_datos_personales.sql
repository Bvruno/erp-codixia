-- ============================================================
-- PARTE 10: Campos ampliados de perfil (datos personales)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phones TEXT[] DEFAULT '{}' NOT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contacts JSONB DEFAULT '[]' NOT NULL;
