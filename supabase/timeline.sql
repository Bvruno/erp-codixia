-- Agregar tabla de actividad y triggers para timeline de cambios
-- Ejecutar en SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS task_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created','status_changed','assigned','priority_changed','due_date_changed','hours_changed','title_changed')),
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_task ON task_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON task_activity_log(created_at);

ALTER TABLE task_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_select_org" ON task_activity_log;
CREATE POLICY "activity_select_org" ON task_activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_activity_log.task_id AND t.organization_id = my_org_id())
  );

DROP POLICY IF EXISTS "activity_insert_org" ON task_activity_log;
CREATE POLICY "activity_insert_org" ON task_activity_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_activity_log.task_id AND t.organization_id = my_org_id())
  );

-- Trigger: log changes on task update
CREATE OR REPLACE FUNCTION log_task_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO task_activity_log (task_id, user_id, action, new_value)
    VALUES (NEW.id, NEW.created_by, 'created', NEW.status);
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'assigned', OLD.assigned_to::TEXT, NEW.assigned_to::TEXT);
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'priority_changed', OLD.priority, NEW.priority);
  END IF;

  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'due_date_changed', OLD.due_date::TEXT, NEW.due_date::TEXT);
  END IF;

  IF OLD.estimated_hours IS DISTINCT FROM NEW.estimated_hours THEN
    INSERT INTO task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'hours_changed', OLD.estimated_hours::TEXT, NEW.estimated_hours::TEXT);
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'title_changed', OLD.title, NEW.title);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_changes_trigger ON tasks;
CREATE TRIGGER task_changes_trigger
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_task_changes();
