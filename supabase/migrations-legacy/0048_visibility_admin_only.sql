-- ============================================================
-- VISIBILIDAD SOLO ADMIN
--  Un colaborador con write puede editar el nombre pero no la
--  visibilidad (public/private/restricted) — ni siquiera por
--  API directa. Los admins sí pueden.
-- ============================================================

CREATE OR REPLACE FUNCTION protect_visibility_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility
     AND COALESCE((SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()), 'collaborator') <> 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden cambiar la visibilidad';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspaces_visibility ON workspaces;
CREATE TRIGGER trg_workspaces_visibility BEFORE UPDATE OF visibility ON workspaces
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_folders_visibility ON workspace_folders;
CREATE TRIGGER trg_folders_visibility BEFORE UPDATE OF visibility ON workspace_folders
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_lists_visibility ON task_lists;
CREATE TRIGGER trg_lists_visibility BEFORE UPDATE OF visibility ON task_lists
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_documents_visibility ON documents;
CREATE TRIGGER trg_documents_visibility BEFORE UPDATE OF visibility ON documents
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_mind_maps_visibility ON mind_maps;
CREATE TRIGGER trg_mind_maps_visibility BEFORE UPDATE OF visibility ON mind_maps
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

DROP TRIGGER IF EXISTS trg_todos_visibility ON todos;
CREATE TRIGGER trg_todos_visibility BEFORE UPDATE OF visibility ON todos
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();