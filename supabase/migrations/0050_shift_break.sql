-- Descanso/comida opcional por turno
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS break_start_time TIME,
  ADD COLUMN IF NOT EXISTS break_end_time TIME;