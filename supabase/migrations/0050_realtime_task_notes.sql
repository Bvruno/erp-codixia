-- ============================================================
-- REALTIME: publicar notas y timeline de tareas
--  Los canales de postgres_changes (board de proyectos y vista de
--  detalle de tarea) emiten eventos de task_notes y task_activity_log
--  para actualizar contadores y timeline en vivo.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.task_notes,
  public.task_activity_log;