-- ============================================================
-- PARTE 12: Preferencias de plataforma por usuario
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}' NOT NULL;
