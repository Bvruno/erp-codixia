-- ============================================================
-- PARTE 15: Safety net idempotente + funciones de debug
-- (Corrige estados parciales de 0013/0014; se puede correr
--  varias veces sin error.)
--
-- v2: políticas RLS basadas en funciones SECURITY DEFINER
-- (get_my_org_id/get_my_role/entity_org_id/is_entity_member)
-- para eliminar la recursión infinita entre policies de
-- workspaces/folders/task_lists y entity_visibility.
-- ============================================================

-- Columnas de visibilidad (idempotente)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));
ALTER TABLE workspace_folders ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));
ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));

-- Tabla de miembros (idempotente)
CREATE TABLE IF NOT EXISTS entity_visibility (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('workspace','folder','list')),
  entity_id UUID NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_type, entity_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_visibility_entity ON entity_visibility(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_visibility_profile ON entity_visibility(profile_id);

-- ============================================================
-- Helpers anti-recursión (SECURITY DEFINER, sin RLS)
-- (get_my_org_id/get_my_role se redefinen por si 0008 no se
--  aplicó completo en la BD)
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND blocked = false;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND blocked = false;
$$;

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
    WHEN 'list' THEN (SELECT w.organization_id FROM public.task_lists l JOIN public.workspace_folders f ON f.id = l.folder_id JOIN public.workspaces w ON w.id = f.workspace_id WHERE l.id = entity_id)
  END;
$$;

CREATE OR REPLACE FUNCTION is_entity_member(entity_type TEXT, entity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_visibility
    WHERE entity_visibility.entity_type = is_entity_member.entity_type
      AND entity_visibility.entity_id = is_entity_member.entity_id
      AND entity_visibility.profile_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS (recreación idempotente, sin ciclos)
-- ============================================================

ALTER TABLE entity_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ev_select" ON entity_visibility;
CREATE POLICY "ev_select" ON entity_visibility
  FOR SELECT USING (
    auth.uid() = profile_id
    OR (get_my_role() = 'admin' AND entity_org_id(entity_type, entity_id) = get_my_org_id())
  );

DROP POLICY IF EXISTS "ev_write_admin" ON entity_visibility;
CREATE POLICY "ev_write_admin" ON entity_visibility
  FOR ALL USING (
    get_my_role() = 'admin' AND entity_org_id(entity_type, entity_id) = get_my_org_id()
  );

DROP POLICY IF EXISTS "workspaces_select_org" ON workspaces;
CREATE POLICY "workspaces_select_org" ON workspaces
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR (visibility = 'restricted' AND is_entity_member('workspace', id))
    )
  );

DROP POLICY IF EXISTS "workspaces_all_admin" ON workspaces;
CREATE POLICY "workspaces_all_admin" ON workspaces
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
  );

DROP POLICY IF EXISTS "folders_select_org" ON workspace_folders;
CREATE POLICY "folders_select_org" ON workspace_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_folders.workspace_id
      AND w.organization_id = get_my_org_id()
    )
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR (visibility = 'restricted' AND is_entity_member('folder', id))
    )
  );

DROP POLICY IF EXISTS "folders_all_admin" ON workspace_folders;
CREATE POLICY "folders_all_admin" ON workspace_folders
  FOR ALL USING (
    get_my_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_folders.workspace_id
      AND w.organization_id = get_my_org_id()
    )
  );

DROP POLICY IF EXISTS "task_lists_select_org" ON task_lists;
CREATE POLICY "task_lists_select_org" ON task_lists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_folders f
      JOIN workspaces w ON w.id = f.workspace_id
      WHERE f.id = task_lists.folder_id
      AND w.organization_id = get_my_org_id()
    )
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR (visibility = 'restricted' AND is_entity_member('list', id))
    )
  );

DROP POLICY IF EXISTS "task_lists_all_admin" ON task_lists;
CREATE POLICY "task_lists_all_admin" ON task_lists
  FOR ALL USING (
    get_my_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM workspace_folders f
      JOIN workspaces w ON w.id = f.workspace_id
      WHERE f.id = task_lists.folder_id
      AND w.organization_id = get_my_org_id()
    )
  );

-- ============================================================
-- Funciones de debug (para /debug y /api/debug-db)
-- ============================================================

CREATE OR REPLACE FUNCTION debug_policies()
RETURNS TABLE (tablename text, policyname text, cmd text, permissive text, qual text, with_check text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT tablename, policyname, cmd, permissive, qual::text, with_check::text
  FROM pg_policies
  WHERE tablename IN ('workspaces','workspace_folders','task_lists','entity_visibility')
  ORDER BY tablename, policyname;
$$;

CREATE OR REPLACE FUNCTION debug_rls_status()
RETURNS TABLE (tablename name, rowsecurity boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT tablename, rowsecurity FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename IN ('workspaces','workspace_folders','task_lists','entity_visibility')
  ORDER BY tablename;
$$;

CREATE OR REPLACE FUNCTION debug_columns()
RETURNS TABLE (table_name text, column_name text, data_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT table_name::text, column_name::text, data_type::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name IN ('workspaces','workspace_folders','task_lists','entity_visibility')
  ORDER BY table_name, ordinal_position;
$$;
