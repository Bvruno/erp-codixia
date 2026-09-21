-- ============================================================
-- PARTE 22: OAuth (Google) - avatar del proveedor
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
