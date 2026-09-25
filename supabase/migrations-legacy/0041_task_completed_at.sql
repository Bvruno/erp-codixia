-- ============================================================
-- PARTE 41: Completado y flujo de estados
-- - tasks.completed_at: momento exacto del cierre (NULL al reabrir)
-- - task_activity_log: registra transiciones de estado
--   (action='status_changed', old_value/new_value) para métricas
--   de flujo del pipeline.
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.handle_task_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'done' THEN
      NEW.completed_at = COALESCE(NEW.completed_at, now());
    ELSIF OLD.status = 'done' THEN
      NEW.completed_at = NULL;
    END IF;
    INSERT INTO task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'done' THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_status ON tasks;
CREATE TRIGGER trg_task_status
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION handle_task_status_change();

-- Backfill histórico: las done sin completed_at usan updated_at
-- como aproximación del cierre.
UPDATE tasks
   SET completed_at = updated_at
 WHERE status = 'done'
   AND completed_at IS NULL;