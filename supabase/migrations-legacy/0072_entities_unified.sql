-- ============================================================
-- 0072: proyección unificada de entidades (fase infraestructura).
--
-- Crea `entity_types` (registro en datos de los tipos de entidad y su
-- tabla de contenido) y `entities` (jerarquía + visibilidad + org en un
-- solo lugar, con los MISMOS UUID que las tablas de contenido).
--
-- Las tablas de contenido siguen siendo la fuente de escritura: un
-- trigger por tabla proyecta INSERT/UPDATE/DELETE hacia `entities`.
--
-- NO cambia permisos todavía: las funciones y policies actuales siguen
-- intactas. La fase 0073 reemplaza la lógica de permisos por funciones
-- genéricas sobre `entities`.
--
-- Idempotente: puede re-ejecutarse (backfill ON CONFLICT DO NOTHING,
-- triggers DROP+CREATE).
-- ============================================================

SET check_function_bodies = off;

-- ------------------------------------------------------------
-- 1) Registro de tipos de entidad
--    parent_expr: expresión SQL (en la tabla de contenido) que resuelve
--    el padre al crear; NULL = solo admin (workspace).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_types (
  clave TEXT PRIMARY KEY,
  tabla TEXT NOT NULL,
  parent_expr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.entity_types (clave, tabla, parent_expr) VALUES
  ('workspace',  'workspaces',        NULL),
  ('folder',     'workspace_folders', 'coalesce(parent_folder_id, workspace_id)'),
  ('list',       'task_lists',        'coalesce(folder_id, workspace_id)'),
  ('document',   'documents',         'coalesce(folder_id, workspace_id)'),
  ('mindmap',    'mind_maps',         'coalesce(folder_id, workspace_id)'),
  ('todo',       'todos',             'coalesce(folder_id, workspace_id)'),
  ('formulario', 'formularios',       'coalesce(folder_id, workspace_id)')
ON CONFLICT (clave) DO UPDATE
  SET tabla = EXCLUDED.tabla,
      parent_expr = EXCLUDED.parent_expr;

-- ------------------------------------------------------------
-- 2) Tabla `entities`
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entities (
  id UUID PRIMARY KEY,
  entity_type TEXT NOT NULL REFERENCES public.entity_types(clave) ON UPDATE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'restricted', 'private')),
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entities_org ON public.entities(organization_id);
CREATE INDEX IF NOT EXISTS idx_entities_parent ON public.entities(parent_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON public.entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_visibility ON public.entities(visibility);

-- Proyección interna: se lee solo vía funciones SECURITY DEFINER.
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3) Backfill desde las tablas de contenido
-- ------------------------------------------------------------
INSERT INTO public.entities (id, entity_type, organization_id, parent_id, visibility, name, position, created_by, created_at)
SELECT w.id, 'workspace', w.organization_id, NULL, w.visibility, w.name, w.position, NULL, w.created_at
FROM public.workspaces w
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, entity_type, organization_id, parent_id, visibility, name, position, created_by, created_at)
SELECT f.id, 'folder', w.organization_id, COALESCE(f.parent_folder_id, f.workspace_id),
       f.visibility, f.name, f.position, NULL, f.created_at
FROM public.workspace_folders f
JOIN public.workspaces w ON w.id = f.workspace_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, entity_type, organization_id, parent_id, visibility, name, position, created_by, created_at)
SELECT l.id, 'list', l.organization_id, COALESCE(l.folder_id, l.workspace_id),
       l.visibility, l.name, l.position, NULL, l.created_at
FROM public.task_lists l
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, entity_type, organization_id, parent_id, visibility, name, position, created_by, created_at)
SELECT d.id, 'document', d.organization_id, COALESCE(d.folder_id, d.workspace_id),
       d.visibility, d.name, d.position, NULL, d.created_at
FROM public.documents d
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, entity_type, organization_id, parent_id, visibility, name, position, created_by, created_at)
SELECT m.id, 'mindmap', m.organization_id, COALESCE(m.folder_id, m.workspace_id),
       m.visibility, m.name, m.position, m.created_by, m.created_at
FROM public.mind_maps m
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, entity_type, organization_id, parent_id, visibility, name, position, created_by, created_at)
SELECT t.id, 'todo', t.organization_id, COALESCE(t.folder_id, t.workspace_id),
       t.visibility, t.name, t.position, t.created_by, t.created_at
FROM public.todos t
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, entity_type, organization_id, parent_id, visibility, name, position, created_by, created_at)
SELECT fo.id, 'formulario', fo.organization_id, COALESCE(fo.folder_id, fo.workspace_id),
       fo.visibility, fo.name, fo.position, fo.created_by, fo.created_at
FROM public.formularios fo
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 4) Trigger de sincronización contenido → entities
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_entity_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type TEXT := TG_ARGV[0];
  v_org UUID;
  v_parent UUID;
  v_created_by UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.entities WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF v_type = 'workspace' THEN
    v_org := NEW.organization_id;
    v_parent := NULL;
    v_created_by := NULL;
  ELSIF v_type = 'folder' THEN
    v_org := (SELECT organization_id FROM public.workspaces WHERE id = NEW.workspace_id);
    v_parent := COALESCE(NEW.parent_folder_id, NEW.workspace_id);
    v_created_by := NULL;
  ELSE
    v_org := NEW.organization_id;
    v_parent := COALESCE(NEW.folder_id, NEW.workspace_id);
    IF v_type IN ('mindmap', 'todo', 'formulario') THEN
      v_created_by := NEW.created_by;
    ELSE
      v_created_by := NULL;
    END IF;
  END IF;

  INSERT INTO public.entities
    (id, entity_type, organization_id, parent_id, visibility, name, position, created_by, created_at, updated_at)
  VALUES
    (NEW.id, v_type, v_org, v_parent, NEW.visibility, NEW.name, NEW.position, v_created_by, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    entity_type = EXCLUDED.entity_type,
    organization_id = EXCLUDED.organization_id,
    parent_id = EXCLUDED.parent_id,
    visibility = EXCLUDED.visibility,
    name = EXCLUDED.name,
    position = EXCLUDED.position,
    created_by = COALESCE(public.entities.created_by, EXCLUDED.created_by),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspaces_entity_sync ON public.workspaces;
CREATE TRIGGER trg_workspaces_entity_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('workspace');

DROP TRIGGER IF EXISTS trg_folders_entity_sync ON public.workspace_folders;
CREATE TRIGGER trg_folders_entity_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_folders
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('folder');

DROP TRIGGER IF EXISTS trg_lists_entity_sync ON public.task_lists;
CREATE TRIGGER trg_lists_entity_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.task_lists
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('list');

DROP TRIGGER IF EXISTS trg_documents_entity_sync ON public.documents;
CREATE TRIGGER trg_documents_entity_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('document');

DROP TRIGGER IF EXISTS trg_mindmaps_entity_sync ON public.mind_maps;
CREATE TRIGGER trg_mindmaps_entity_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.mind_maps
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('mindmap');

DROP TRIGGER IF EXISTS trg_todos_entity_sync ON public.todos;
CREATE TRIGGER trg_todos_entity_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('todo');

DROP TRIGGER IF EXISTS trg_formularios_entity_sync ON public.formularios;
CREATE TRIGGER trg_formularios_entity_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.formularios
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_projection('formulario');

-- ------------------------------------------------------------
-- 5) entity_visibility: FK real a entities + tipo sincronizado
-- ------------------------------------------------------------
-- Sin huérfanos: grants de entidades inexistentes se descartan.
DELETE FROM public.entity_visibility ev
WHERE NOT EXISTS (SELECT 1 FROM public.entities e WHERE e.id = ev.entity_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entity_visibility_entity_id_fkey'
  ) THEN
    ALTER TABLE public.entity_visibility
      ADD CONSTRAINT entity_visibility_entity_id_fkey
      FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_entity_visibility_entity_id ON public.entity_visibility(entity_id);

-- El tipo del grant se deriva de entities (evita drift al escribir).
CREATE OR REPLACE FUNCTION public.sync_grant_entity_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT entity_type INTO v_type FROM public.entities WHERE id = NEW.entity_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'El grant apunta a una entidad inexistente: %', NEW.entity_id;
  END IF;
  NEW.entity_type := v_type;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entity_visibility_type ON public.entity_visibility;
CREATE TRIGGER trg_entity_visibility_type
  BEFORE INSERT OR UPDATE ON public.entity_visibility
  FOR EACH ROW EXECUTE FUNCTION public.sync_grant_entity_type();
