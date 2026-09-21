-- ============================================================
-- PARTE 31: Mapas mentales (canvas tipo Miro)
-- Nodos/edges/viewport persisten como snapshot JSONB en
-- content (el grafo es atómico; autosave debounced).
-- Permisos: misma arquitectura que documentos (read/write/manage
-- + herencia vía entity_visibility / entity_permission).
-- ============================================================

-- PG16+ valida el cuerpo de funciones SQL al crearlas usando el
-- search_path de la función (''), por lo que las referencias a
-- otras funciones fallan. Todas las referencias van calificadas
-- con public./auth. y se desactiva la validación de respaldo.
SET check_function_bodies = off;

-- ============ 1. Schema ============

CREATE TABLE mind_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  content JSONB NOT NULL DEFAULT '{"version":1,"nodes":[],"edges":[],"viewport":null}',
  position INT DEFAULT 0 NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_mind_maps_org ON mind_maps(organization_id, position);
CREATE INDEX idx_mind_maps_workspace ON mind_maps(workspace_id, position);
CREATE INDEX idx_mind_maps_folder ON mind_maps(folder_id, position);

-- entity_visibility: habilitar tipo 'mindmap'
ALTER TABLE entity_visibility DROP CONSTRAINT entity_visibility_entity_type_check;
ALTER TABLE entity_visibility ADD CONSTRAINT entity_visibility_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap'));

-- invitations: habilitar tipo 'mindmap'
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_entity_type_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap'));

-- updated_at automático (reutiliza update_updated_at de 0007)
CREATE TRIGGER mind_maps_updated_at
  BEFORE UPDATE ON mind_maps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============ 2. Helpers ============

CREATE OR REPLACE FUNCTION entity_org_id(entity_type TEXT, entity_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE entity_type
    WHEN 'workspace' THEN (SELECT organization_id FROM public.workspaces WHERE id = entity_id)
    WHEN 'folder' THEN (SELECT w.organization_id FROM public.workspace_folders f JOIN public.workspaces w ON w.id = f.workspace_id WHERE f.id = entity_id)
    WHEN 'list' THEN (SELECT organization_id FROM public.task_lists WHERE id = entity_id)
    WHEN 'document' THEN (SELECT organization_id FROM public.documents WHERE id = entity_id)
    WHEN 'mindmap' THEN (SELECT organization_id FROM public.mind_maps WHERE id = entity_id)
  END;
$$;

-- Nivel efectivo de permiso del usuario actual sobre una entidad,
-- caminando ancestros (carpeta -> parent_folder... -> workspace).
-- El grant propio cuenta siempre; los de ancestros solo si inherit=true.
CREATE OR REPLACE FUNCTION entity_permission(e_type TEXT, e_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE scope(depth, t, id) AS (
    SELECT 0, e_type::text, e_id::uuid
    UNION ALL
    SELECT s.depth + 1,
      CASE
        WHEN s.t = 'folder' THEN 'folder'
        WHEN s.t = 'list' THEN (CASE WHEN (SELECT folder_id FROM public.task_lists WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'document' THEN (CASE WHEN (SELECT folder_id FROM public.documents WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'mindmap' THEN (CASE WHEN (SELECT folder_id FROM public.mind_maps WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
        WHEN s.t = 'mindmap' THEN COALESCE((SELECT folder_id FROM public.mind_maps WHERE id = s.id), (SELECT workspace_id FROM public.mind_maps WHERE id = s.id))
        ELSE NULL
      END
    FROM scope s
    WHERE s.depth < 12 AND s.id IS NOT NULL
  ),
  grants AS (
    SELECT ev.permission
    FROM public.entity_visibility ev
    WHERE ev.entity_type = e_type AND ev.entity_id = e_id
      AND ev.profile_id = auth.uid()
      AND public.entity_org_id(e_type, e_id) = public.get_my_org_id()
    UNION ALL
    SELECT ev.permission
    FROM scope s
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid() AND ev.inherit = true
    WHERE s.depth > 0
      AND public.entity_org_id(s.t, s.id) = public.get_my_org_id()
  )
  SELECT CASE max(public.perm_rank(g.permission))
    WHEN 3 THEN 'manage'
    WHEN 2 THEN 'write'
    WHEN 1 THEN 'read'
    ELSE NULL
  END
  FROM grants g;
$$;

-- ============ 3. RLS: mind_maps ============

ALTER TABLE mind_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mind_maps_select_org" ON mind_maps;
CREATE POLICY "mind_maps_select_org" ON mind_maps
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR public.entity_permission('mindmap', id) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "mind_maps_all_admin" ON mind_maps;
CREATE POLICY "mind_maps_all_admin" ON mind_maps
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 3
  );

-- ============ 4. Limpieza de grants al eliminar ============

DROP TRIGGER IF EXISTS trg_ev_mindmap ON mind_maps;
CREATE TRIGGER trg_ev_mindmap
  AFTER DELETE ON mind_maps
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('mindmap');

-- ============ 5. Storage: bucket mindmap-images ============
-- Lectura pública de objetos, escritura solo autenticados de la org.
-- El bucket se crea con scripts/create-mindmap-bucket.mjs.

CREATE POLICY "mindmap_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'mindmap-images');

CREATE POLICY "mindmap_images_authenticated_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'mindmap-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (get_my_org_id())::text
  );

CREATE POLICY "mindmap_images_authenticated_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'mindmap-images'
    AND auth.role() = 'authenticated'
  );