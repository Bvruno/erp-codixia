-- ============================================================
-- PARTE 21: Estados y prioridades configurables por lista
-- ============================================================

-- Config por lista (JSONB arrays: { key, label, color, hidden_by_default? })
ALTER TABLE task_lists
  ADD COLUMN IF NOT EXISTS statuses JSONB,
  ADD COLUMN IF NOT EXISTS priorities JSONB;

-- Defaults por workspace (para listas nuevas)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS default_statuses JSONB,
  ADD COLUMN IF NOT EXISTS default_priorities JSONB;

-- Liberar status/priority de CHECK fijos (configurable por lista)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_check') THEN
    ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_check') THEN
    ALTER TABLE tasks DROP CONSTRAINT tasks_priority_check;
  END IF;
END $$;

-- Backfill: config actual para listas y workspaces existentes
UPDATE task_lists
SET
  statuses = '[
    {"key":"backlog","label":"Backlog","color":"#6b7280"},
    {"key":"todo","label":"Pendiente","color":"#3b82f6"},
    {"key":"in_progress","label":"En Progreso","color":"#eab308"},
    {"key":"review","label":"Revisión","color":"#a855f7"},
    {"key":"done","label":"Completado","color":"#10b981","hidden_by_default":true},
    {"key":"cancelled","label":"Cancelado","color":"#ef4444","hidden_by_default":true}
  ]'::jsonb,
  priorities = '[
    {"key":"low","label":"Baja","color":"#6b7280"},
    {"key":"medium","label":"Media","color":"#eab308"},
    {"key":"high","label":"Alta","color":"#f97316"},
    {"key":"urgent","label":"Urgente","color":"#ef4444"}
  ]'::jsonb
WHERE statuses IS NULL;

UPDATE workspaces
SET
  default_statuses = '[
    {"key":"backlog","label":"Backlog","color":"#6b7280"},
    {"key":"todo","label":"Pendiente","color":"#3b82f6"},
    {"key":"in_progress","label":"En Progreso","color":"#eab308"},
    {"key":"review","label":"Revisión","color":"#a855f7"},
    {"key":"done","label":"Completado","color":"#10b981","hidden_by_default":true},
    {"key":"cancelled","label":"Cancelado","color":"#ef4444","hidden_by_default":true}
  ]'::jsonb,
  default_priorities = '[
    {"key":"low","label":"Baja","color":"#6b7280"},
    {"key":"medium","label":"Media","color":"#eab308"},
    {"key":"high","label":"Alta","color":"#f97316"},
    {"key":"urgent","label":"Urgente","color":"#ef4444"}
  ]'::jsonb
WHERE default_statuses IS NULL;
