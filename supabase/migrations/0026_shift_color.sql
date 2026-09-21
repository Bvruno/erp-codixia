-- ============================================================
-- PARTE 26: Color de turnos
-- ============================================================

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#3b82f6';
