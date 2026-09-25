-- ============================================================
-- PARTE 17: Limpieza de entity_visibility al eliminar entidades
-- (las FK ON DELETE CASCADE eliminan hijos; estos triggers
--  limpian las filas huérfanas de visibilidad, incluidas las
--  de los descendientes vía cascada)
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_entity_visibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.entity_visibility
  WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_ev_workspace ON workspaces;
CREATE TRIGGER trg_ev_workspace
  AFTER DELETE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('workspace');

DROP TRIGGER IF EXISTS trg_ev_folder ON workspace_folders;
CREATE TRIGGER trg_ev_folder
  AFTER DELETE ON workspace_folders
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('folder');

DROP TRIGGER IF EXISTS trg_ev_list ON task_lists;
CREATE TRIGGER trg_ev_list
  AFTER DELETE ON task_lists
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('list');

DROP TRIGGER IF EXISTS trg_ev_document ON documents;
CREATE TRIGGER trg_ev_document
  AFTER DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('document');
