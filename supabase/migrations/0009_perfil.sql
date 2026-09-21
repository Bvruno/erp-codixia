-- ============================================================
-- PARTE 9: Perfil de usuario ampliado
-- ============================================================

-- Nuevas columnas de perfil
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es';

-- Permitir que cada usuario edite su propio perfil
CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE USING (auth.uid() = id);
