-- ============================================================
-- PARTE 51: Eliminar tarea con sub-tareas (cascade real)
--  Antes: parent_task_id ON DELETE SET NULL -> las sub-tareas
--  quedaban huérfanas como tareas raíz al borrar el padre, y el
--  diálogo de confirmación prometía borrarlas (bug).
--  Ahora: ON DELETE CASCADE -> borrar una tarea borra todo su
--  subárbol (notas y timeline caen por los cascades existentes
--  de task_notes y task_activity_log).
-- ============================================================

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_parent_task_id_fkey;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_parent_task_id_fkey
  FOREIGN KEY (parent_task_id)
  REFERENCES public.tasks(id)
  ON DELETE CASCADE;