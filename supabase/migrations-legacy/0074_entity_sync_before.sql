-- ============================================================
-- 0074: la proyección a `entities` debe correr ANTES de los triggers
-- de creador.
--
-- `grant_creator_access` (AFTER INSERT) inserta un grant que valida
-- contra `entities` (FK + sync de tipo). Los triggers de proyección
-- eran AFTER y, por orden alfabético, `trg_*_creator_access` corría
-- primero → "El grant apunta a una entidad inexistente".
--
-- Fix: la proyección pasa a BEFORE INSERT/UPDATE/DELETE. Así la fila
-- de `entities` existe antes de cualquier trigger AFTER.
-- ============================================================

SET check_function_bodies = off;

DROP TRIGGER IF EXISTS trg_workspaces_entity_sync ON public.workspaces;
CREATE TRIGGER trg_workspaces_entity_sync
  BEFORE INSERT OR UPDATE OR DELETE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('workspace');

DROP TRIGGER IF EXISTS trg_folders_entity_sync ON public.workspace_folders;
CREATE TRIGGER trg_folders_entity_sync
  BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_folders
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('folder');

DROP TRIGGER IF EXISTS trg_lists_entity_sync ON public.task_lists;
CREATE TRIGGER trg_lists_entity_sync
  BEFORE INSERT OR UPDATE OR DELETE ON public.task_lists
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('list');

DROP TRIGGER IF EXISTS trg_documents_entity_sync ON public.documents;
CREATE TRIGGER trg_documents_entity_sync
  BEFORE INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('document');

DROP TRIGGER IF EXISTS trg_mindmaps_entity_sync ON public.mind_maps;
CREATE TRIGGER trg_mindmaps_entity_sync
  BEFORE INSERT OR UPDATE OR DELETE ON public.mind_maps
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('mindmap');

DROP TRIGGER IF EXISTS trg_todos_entity_sync ON public.todos;
CREATE TRIGGER trg_todos_entity_sync
  BEFORE INSERT OR UPDATE OR DELETE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('todo');

DROP TRIGGER IF EXISTS trg_formularios_entity_sync ON public.formularios;
CREATE TRIGGER trg_formularios_entity_sync
  BEFORE INSERT OR UPDATE OR DELETE ON public.formularios
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('formulario');
