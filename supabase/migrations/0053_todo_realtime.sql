-- ============================================================
-- REALTIME: publicar items de TO-DO
--  La vista de TO-DO escucha postgres_changes en todo_items
--  para reflejar en vivo las tareas creadas/renombradas.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.todo_items;