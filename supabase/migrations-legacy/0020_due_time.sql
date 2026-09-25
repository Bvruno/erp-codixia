-- ============================================================
-- PARTE 20: Hora límite de entrega en tareas
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_time TIME;
