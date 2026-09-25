SET check_function_bodies = off;

CREATE TABLE IF NOT EXISTS public.formularios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.workspace_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','publicado','cerrado')),
  position INT NOT NULL DEFAULT 0,
  esquema JSONB NOT NULL DEFAULT '{"version":1,"secciones":[]}',
  ajustes JSONB NOT NULL DEFAULT '{"modo_acceso":"publico","lista_modo":"blanca","identificadores":["dni","email"],"una_respuesta_por_persona":false,"requiere_consentimiento":false,"texto_privacidad":"","mensaje_confirmacion":"Gracias por tu respuesta."}',
  token_publico_hash TEXT UNIQUE,
  publicado_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_formularios_org ON public.formularios(organization_id, position);
CREATE INDEX IF NOT EXISTS idx_formularios_ws ON public.formularios(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_formularios_folder ON public.formularios(folder_id, position);

CREATE TABLE IF NOT EXISTS public.formulario_listas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id UUID NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('dni','email')),
  valor TEXT NOT NULL,
  etiqueta TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (formulario_id, tipo, valor)
);

CREATE INDEX IF NOT EXISTS idx_formulario_listas_form ON public.formulario_listas(formulario_id);

CREATE TABLE IF NOT EXISTS public.formulario_invitados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id UUID NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('dni','email')),
  valor TEXT,
  token_hash TEXT UNIQUE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','respondido','revocado')),
  respondido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_formulario_invitados_form ON public.formulario_invitados(formulario_id);

CREATE TABLE IF NOT EXISTS public.formulario_respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id UUID NOT NULL REFERENCES public.formularios(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invitado_id UUID REFERENCES public.formulario_invitados(id) ON DELETE SET NULL,
  identificador_hash TEXT,
  consentimiento BOOLEAN NOT NULL DEFAULT false,
  respuestas JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_formulario_respuestas_form
  ON public.formulario_respuestas(formulario_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_formulario_respuesta_invitado
  ON public.formulario_respuestas(formulario_id, invitado_id)
  WHERE invitado_id IS NOT NULL;

DROP TRIGGER IF EXISTS formularios_updated_at ON public.formularios;
CREATE TRIGGER formularios_updated_at
  BEFORE UPDATE ON public.formularios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_formularios_creator_access ON public.formularios;
CREATE TRIGGER trg_formularios_creator_access AFTER INSERT ON public.formularios
  FOR EACH ROW EXECUTE FUNCTION public.grant_creator_access('formulario');

DROP TRIGGER IF EXISTS trg_formularios_visibility ON public.formularios;
CREATE TRIGGER trg_formularios_visibility BEFORE UPDATE OF visibility ON public.formularios
  FOR EACH ROW EXECUTE FUNCTION public.protect_visibility_change();

DROP TRIGGER IF EXISTS trg_ev_formulario ON public.formularios;
CREATE TRIGGER trg_ev_formulario
  AFTER DELETE ON public.formularios
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_entity_visibility('formulario');

ALTER TABLE public.entity_visibility DROP CONSTRAINT IF EXISTS entity_visibility_entity_type_check;
ALTER TABLE public.entity_visibility ADD CONSTRAINT entity_visibility_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap','todo','formulario'));

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_entity_type_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap','todo','formulario'));

CREATE OR REPLACE FUNCTION public.entity_org_id(entity_type TEXT, entity_id UUID)
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
    WHEN 'todo' THEN (SELECT organization_id FROM public.todos WHERE id = entity_id)
    WHEN 'formulario' THEN (SELECT organization_id FROM public.formularios WHERE id = entity_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.entity_permission(e_type TEXT, e_id UUID)
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
        WHEN s.t = 'todo' THEN (CASE WHEN (SELECT folder_id FROM public.todos WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'formulario' THEN (CASE WHEN (SELECT folder_id FROM public.formularios WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
        WHEN s.t = 'mindmap' THEN COALESCE((SELECT folder_id FROM public.mind_maps WHERE id = s.id), (SELECT workspace_id FROM public.mind_maps WHERE id = s.id))
        WHEN s.t = 'todo' THEN COALESCE((SELECT folder_id FROM public.todos WHERE id = s.id), (SELECT workspace_id FROM public.todos WHERE id = s.id))
        WHEN s.t = 'formulario' THEN COALESCE((SELECT folder_id FROM public.formularios WHERE id = s.id), (SELECT workspace_id FROM public.formularios WHERE id = s.id))
        ELSE NULL
      END
    FROM scope s
    WHERE s.depth < 12 AND s.id IS NOT NULL
  ),
  target_public AS (
    SELECT (CASE e_type
      WHEN 'workspace' THEN (SELECT visibility FROM public.workspaces WHERE id = e_id)
      WHEN 'folder' THEN (SELECT visibility FROM public.workspace_folders WHERE id = e_id)
      WHEN 'list' THEN (SELECT visibility FROM public.task_lists WHERE id = e_id)
      WHEN 'document' THEN (SELECT visibility FROM public.documents WHERE id = e_id)
      WHEN 'mindmap' THEN (SELECT visibility FROM public.mind_maps WHERE id = e_id)
      WHEN 'todo' THEN (SELECT visibility FROM public.todos WHERE id = e_id)
      WHEN 'formulario' THEN (SELECT visibility FROM public.formularios WHERE id = e_id)
    END = 'public') AS is_public
  ),
  grants AS (
    SELECT ev.permission
    FROM public.entity_visibility ev
    WHERE ev.entity_type = e_type AND ev.entity_id = e_id
      AND ev.profile_id = auth.uid()
      AND public.entity_org_id(e_type, e_id) = public.get_my_org_id()
    UNION ALL
    SELECT CASE WHEN public.perm_rank(ev.permission) >= 2 THEN 'write' ELSE ev.permission END
    FROM scope s
    CROSS JOIN target_public tp
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid() AND ev.inherit = true
    WHERE s.depth > 0 AND tp.is_public
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

CREATE OR REPLACE FUNCTION public.entity_permissions_bulk(e_type TEXT, e_ids UUID[])
RETURNS TABLE(entity_id UUID, permission TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE scope(entity_id, depth, t, id) AS (
    SELECT e.eid, 0, e_type::text, e.eid
    FROM unnest(e_ids) AS e(eid)
    UNION ALL
    SELECT s.entity_id, s.depth + 1,
      CASE
        WHEN s.t = 'folder' THEN 'folder'
        WHEN s.t = 'list' THEN (CASE WHEN (SELECT folder_id FROM public.task_lists WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'document' THEN (CASE WHEN (SELECT folder_id FROM public.documents WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'mindmap' THEN (CASE WHEN (SELECT folder_id FROM public.mind_maps WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'todo' THEN (CASE WHEN (SELECT folder_id FROM public.todos WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'formulario' THEN (CASE WHEN (SELECT folder_id FROM public.formularios WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
        WHEN s.t = 'mindmap' THEN COALESCE((SELECT folder_id FROM public.mind_maps WHERE id = s.id), (SELECT workspace_id FROM public.mind_maps WHERE id = s.id))
        WHEN s.t = 'todo' THEN COALESCE((SELECT folder_id FROM public.todos WHERE id = s.id), (SELECT workspace_id FROM public.todos WHERE id = s.id))
        WHEN s.t = 'formulario' THEN COALESCE((SELECT folder_id FROM public.formularios WHERE id = s.id), (SELECT workspace_id FROM public.formularios WHERE id = s.id))
        ELSE NULL
      END
    FROM scope s
    WHERE s.depth < 12 AND s.id IS NOT NULL
  ),
  target_public AS (
    SELECT s.entity_id,
      (CASE s.t
        WHEN 'workspace' THEN (SELECT visibility FROM public.workspaces WHERE id = s.id)
        WHEN 'folder' THEN (SELECT visibility FROM public.workspace_folders WHERE id = s.id)
        WHEN 'list' THEN (SELECT visibility FROM public.task_lists WHERE id = s.id)
        WHEN 'document' THEN (SELECT visibility FROM public.documents WHERE id = s.id)
        WHEN 'mindmap' THEN (SELECT visibility FROM public.mind_maps WHERE id = s.id)
        WHEN 'todo' THEN (SELECT visibility FROM public.todos WHERE id = s.id)
        WHEN 'formulario' THEN (SELECT visibility FROM public.formularios WHERE id = s.id)
      END = 'public') AS is_public
    FROM scope s
    WHERE s.depth = 0
  ),
  grants AS (
    SELECT s.entity_id, ev.permission
    FROM scope s
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid()
    WHERE s.depth = 0
      AND public.entity_org_id(s.t, s.id) = public.get_my_org_id()
    UNION ALL
    SELECT s.entity_id,
      CASE WHEN public.perm_rank(ev.permission) >= 2 THEN 'write' ELSE ev.permission END
    FROM scope s
    JOIN target_public tp ON tp.entity_id = s.entity_id
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid() AND ev.inherit = true
    WHERE s.depth > 0 AND tp.is_public
      AND public.entity_org_id(s.t, s.id) = public.get_my_org_id()
  )
  SELECT e.eid AS entity_id,
    CASE max(public.perm_rank(g.permission))
      WHEN 3 THEN 'manage'
      WHEN 2 THEN 'write'
      WHEN 1 THEN 'read'
      ELSE NULL
    END AS permission
  FROM unnest(e_ids) AS e(eid)
  LEFT JOIN grants g ON g.entity_id = e.eid
  GROUP BY e.eid;
$$;

CREATE OR REPLACE FUNCTION public.folder_navigation_visible(p_folder_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.folder_id = p_folder_id
      AND public.entity_permission('document', d.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.mind_maps m
    WHERE m.folder_id = p_folder_id
      AND public.entity_permission('mindmap', m.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.todos t
    WHERE t.folder_id = p_folder_id
      AND public.entity_permission('todo', t.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.formularios fo
    WHERE fo.folder_id = p_folder_id
      AND public.entity_permission('formulario', fo.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.task_lists l
    WHERE l.folder_id = p_folder_id
      AND public.entity_permission('list', l.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.workspace_folders f
    WHERE f.parent_folder_id = p_folder_id
      AND public.folder_navigation_visible(f.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_navigation_visible(p_ws_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.workspace_id = p_ws_id AND d.folder_id IS NULL
      AND public.entity_permission('document', d.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.mind_maps m
    WHERE m.workspace_id = p_ws_id AND m.folder_id IS NULL
      AND public.entity_permission('mindmap', m.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.todos t
    WHERE t.workspace_id = p_ws_id AND t.folder_id IS NULL
      AND public.entity_permission('todo', t.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.formularios fo
    WHERE fo.workspace_id = p_ws_id AND fo.folder_id IS NULL
      AND public.entity_permission('formulario', fo.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.task_lists l
    WHERE l.workspace_id = p_ws_id AND l.folder_id IS NULL
      AND public.entity_permission('list', l.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.workspace_folders f
    WHERE f.workspace_id = p_ws_id AND f.parent_folder_id IS NULL
      AND public.folder_navigation_visible(f.id)
  );
END;
$$;

ALTER TABLE public.formularios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formulario_respuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formulario_listas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formulario_invitados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "formularios_select_org" ON public.formularios;
CREATE POLICY "formularios_select_org" ON public.formularios
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
    AND (
      public.get_my_role() = 'admin'
      OR public.entity_permission('formulario', id) IS NOT NULL
      OR (public.get_my_access_mode() = 'org' AND visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "formularios_insert_write" ON public.formularios;
CREATE POLICY "formularios_insert_write" ON public.formularios
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );

DROP POLICY IF EXISTS "formularios_update_write" ON public.formularios;
CREATE POLICY "formularios_update_write" ON public.formularios
  FOR UPDATE USING (
    public.get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('formulario', id)) >= 2
  );

DROP POLICY IF EXISTS "formularios_delete_manage" ON public.formularios;
CREATE POLICY "formularios_delete_manage" ON public.formularios
  FOR DELETE USING (
    public.get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('formulario', id)) >= 3
  );

DROP POLICY IF EXISTS "formulario_respuestas_select" ON public.formulario_respuestas;
CREATE POLICY "formulario_respuestas_select" ON public.formulario_respuestas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.formularios f
      WHERE f.id = formulario_respuestas.formulario_id
        AND f.organization_id = public.get_my_org_id()
        AND (
          public.get_my_role() = 'admin'
          OR public.perm_rank(public.entity_permission('formulario', f.id)) >= 2
        )
    )
  );

DROP POLICY IF EXISTS "formulario_respuestas_delete" ON public.formulario_respuestas;
CREATE POLICY "formulario_respuestas_delete" ON public.formulario_respuestas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.formularios f
      WHERE f.id = formulario_respuestas.formulario_id
        AND f.organization_id = public.get_my_org_id()
        AND (
          public.get_my_role() = 'admin'
          OR public.perm_rank(public.entity_permission('formulario', f.id)) >= 3
        )
    )
  );

DROP POLICY IF EXISTS "formulario_listas_all_manage" ON public.formulario_listas;
CREATE POLICY "formulario_listas_all_manage" ON public.formulario_listas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.formularios f
      WHERE f.id = formulario_listas.formulario_id
        AND f.organization_id = public.get_my_org_id()
        AND (
          public.get_my_role() = 'admin'
          OR public.perm_rank(public.entity_permission('formulario', f.id)) >= 3
        )
    )
  );

DROP POLICY IF EXISTS "formulario_invitados_all_manage" ON public.formulario_invitados;
CREATE POLICY "formulario_invitados_all_manage" ON public.formulario_invitados
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.formularios f
      WHERE f.id = formulario_invitados.formulario_id
        AND f.organization_id = public.get_my_org_id()
        AND (
          public.get_my_role() = 'admin'
          OR public.perm_rank(public.entity_permission('formulario', f.id)) >= 3
        )
    )
  );

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['formularios', 'formulario_respuestas'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;