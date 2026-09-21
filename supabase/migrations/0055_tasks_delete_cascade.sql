-- ============================================================
-- PARTE 55: Borrar lista/carpeta/workspace borra sus tareas
--  Antes: tasks.list_id ON DELETE SET NULL -> al borrar una
--  lista (o carpeta/workspace en cascada) las tareas quedaban
--  huérfanas con list_id NULL: invisibles en el árbol pero
--  visibles en el calendario, sin navegación posible (bug).
--  Ahora: ON DELETE CASCADE -> borrar la lista borra sus
--  tareas (notas y timeline caen por los cascades existentes
--  de task_notes y task_activity_log). Mismo patrón que
--  0051 (sub-tareas) y que todos.list_id (0034).
--  Además: las tareas huérfanas pre-existentes se reasignan a
--  una lista raíz "tareas sin lista" en el primer workspace de
--  su org para que vuelvan a ser visibles y navegables.
-- ============================================================

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_list_id_fkey;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_list_id_fkey
  FOREIGN KEY (list_id)
  REFERENCES public.task_lists(id)
  ON DELETE CASCADE;

-- Una lista raíz por org con huérfanas, en el primer workspace (menor position)
-- El trigger trg_task_lists_creator_access inserta entity_visibility con
-- auth.uid(), que es NULL fuera de sesión autenticada (p.ej. migraciones);
-- se deshabilita solo durante el INSERT del rescate.
ALTER TABLE task_lists DISABLE TRIGGER trg_task_lists_creator_access;

INSERT INTO task_lists (workspace_id, organization_id, folder_id, name, position, visibility)
SELECT w.id, w.organization_id, NULL, 'tareas sin lista',
       COALESCE((SELECT MAX(position) + 1 FROM task_lists tl WHERE tl.workspace_id = w.id), 0),
       'public'
FROM workspaces w
WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.organization_id = w.organization_id AND t.list_id IS NULL)
  AND w.position = (SELECT MIN(position) FROM workspaces w2 WHERE w2.organization_id = w.organization_id);

ALTER TABLE task_lists ENABLE TRIGGER trg_task_lists_creator_access;

UPDATE tasks t
SET list_id = l.id
FROM task_lists l
WHERE t.list_id IS NULL
  AND l.organization_id = t.organization_id
  AND l.name = 'tareas sin lista';