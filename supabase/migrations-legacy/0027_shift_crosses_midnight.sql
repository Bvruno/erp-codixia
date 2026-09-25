-- ============================================================
-- PARTE 27: Turnos nocturnos (cruzan medianoche)
-- ============================================================

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS crosses_midnight BOOLEAN NOT NULL DEFAULT false;
