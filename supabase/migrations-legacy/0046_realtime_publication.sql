-- ============================================================
-- REALTIME: publicar tablas en supabase_realtime
--  Los canales de postgres_changes (árbol de tareas, página de
--  colaboradores) emiten eventos solo para tablas publicadas.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.entity_visibility,
  public.workspaces,
  public.workspace_folders,
  public.task_lists,
  public.documents,
  public.mind_maps,
  public.todos,
  public.tasks,
  public.profiles,
  public.invitations,
  public.schedules;