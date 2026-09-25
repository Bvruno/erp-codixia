SET check_function_bodies = off;

-- ===== 0012_preferencias.sql =====
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}' NOT NULL;

-- ===== 0013_workspaces.sql =====
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES task_lists(id) ON DELETE SET NULL;

DO $$
DECLARE
  org RECORD;
  ws_id UUID;
  folder_id UUID;
  new_list_id UUID;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    INSERT INTO workspaces (organization_id, name, position)
    VALUES (org.id, 'General', 0) RETURNING id INTO ws_id;

    INSERT INTO workspace_folders (workspace_id, name, position)
    VALUES (ws_id, 'General', 0) RETURNING id INTO folder_id;

    INSERT INTO task_lists (folder_id, name, position)
    VALUES (folder_id, 'General', 0) RETURNING id INTO new_list_id;

    UPDATE tasks SET list_id = new_list_id
    WHERE organization_id = org.id AND list_id IS NULL;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(organization_id, position);
CREATE INDEX IF NOT EXISTS idx_folders_workspace ON workspace_folders(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_task_lists_folder ON task_lists(folder_id, position);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspaces_select_org" ON workspaces;
CREATE POLICY "workspaces_select_org" ON workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = workspaces.organization_id AND blocked = false
    )
  );
DROP POLICY IF EXISTS "workspaces_all_admin" ON workspaces;
CREATE POLICY "workspaces_all_admin" ON workspaces
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = workspaces.organization_id
      AND role = 'admin' AND blocked = false
    )
  );
DROP POLICY IF EXISTS "folders_select_org" ON workspace_folders;
CREATE POLICY "folders_select_org" ON workspace_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN profiles p ON p.id = auth.uid()
      WHERE w.id = workspace_folders.workspace_id
      AND p.organization_id = w.organization_id AND p.blocked = false
    )
  );
DROP POLICY IF EXISTS "folders_all_admin" ON workspace_folders;
CREATE POLICY "folders_all_admin" ON workspace_folders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN profiles p ON p.id = auth.uid()
      WHERE w.id = workspace_folders.workspace_id
      AND p.organization_id = w.organization_id
      AND p.role = 'admin' AND p.blocked = false
    )
  );
DROP POLICY IF EXISTS "task_lists_select_org" ON task_lists;
CREATE POLICY "task_lists_select_org" ON task_lists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_folders f
      JOIN workspaces w ON w.id = f.workspace_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.id = task_lists.folder_id
      AND p.organization_id = w.organization_id AND p.blocked = false
    )
  );
DROP POLICY IF EXISTS "task_lists_all_admin" ON task_lists;
CREATE POLICY "task_lists_all_admin" ON task_lists
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspace_folders f
      JOIN workspaces w ON w.id = f.workspace_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.id = task_lists.folder_id
      AND p.organization_id = w.organization_id
      AND p.role = 'admin' AND p.blocked = false
    )
  );

-- ===== 0014_visibilidad.sql =====
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));
ALTER TABLE workspace_folders ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));
ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));

CREATE TABLE IF NOT EXISTS entity_visibility (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('workspace','folder','list')),
  entity_id UUID NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_type, entity_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_visibility_entity ON entity_visibility(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_visibility_profile ON entity_visibility(profile_id);

ALTER TABLE entity_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ev_select" ON entity_visibility;
CREATE POLICY "ev_select" ON entity_visibility
  FOR SELECT USING (
    auth.uid() = profile_id
    OR EXISTS (
      SELECT 1 FROM profiles adm
      WHERE adm.id = auth.uid() AND adm.role = 'admin' AND adm.blocked = false
      AND (
        (entity_visibility.entity_type = 'workspace'
          AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id = entity_visibility.entity_id AND w.organization_id = adm.organization_id))
        OR (entity_visibility.entity_type = 'folder'
          AND EXISTS (SELECT 1 FROM workspace_folders f JOIN workspaces w ON w.id = f.workspace_id
            WHERE f.id = entity_visibility.entity_id AND w.organization_id = adm.organization_id))
        OR (entity_visibility.entity_type = 'list'
          AND EXISTS (SELECT 1 FROM task_lists l JOIN workspace_folders f ON f.id = l.folder_id
            JOIN workspaces w ON w.id = f.workspace_id
            WHERE l.id = entity_visibility.entity_id AND w.organization_id = adm.organization_id))
      )
    )
  );

DROP POLICY IF EXISTS "ev_write_admin" ON entity_visibility;
CREATE POLICY "ev_write_admin" ON entity_visibility
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles adm
      WHERE adm.id = auth.uid() AND adm.role = 'admin' AND adm.blocked = false
      AND (
        (entity_visibility.entity_type = 'workspace'
          AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id = entity_visibility.entity_id AND w.organization_id = adm.organization_id))
        OR (entity_visibility.entity_type = 'folder'
          AND EXISTS (SELECT 1 FROM workspace_folders f JOIN workspaces w ON w.id = f.workspace_id
            WHERE f.id = entity_visibility.entity_id AND w.organization_id = adm.organization_id))
        OR (entity_visibility.entity_type = 'list'
          AND EXISTS (SELECT 1 FROM task_lists l JOIN workspace_folders f ON f.id = l.folder_id
            JOIN workspaces w ON w.id = f.workspace_id
            WHERE l.id = entity_visibility.entity_id AND w.organization_id = adm.organization_id))
      )
    )
  );

DROP POLICY IF EXISTS "workspaces_select_org" ON workspaces;
CREATE POLICY "workspaces_select_org" ON workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.organization_id = workspaces.organization_id AND p.blocked = false
    )
    AND (
      workspaces.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.organization_id = workspaces.organization_id AND p.role = 'admin' AND p.blocked = false
      )
      OR (
        workspaces.visibility = 'restricted'
        AND EXISTS (
          SELECT 1 FROM entity_visibility ev
          WHERE ev.entity_type = 'workspace' AND ev.entity_id = workspaces.id
          AND ev.profile_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "folders_select_org" ON workspace_folders;
CREATE POLICY "folders_select_org" ON workspace_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN profiles p ON p.id = auth.uid()
      WHERE w.id = workspace_folders.workspace_id
      AND p.organization_id = w.organization_id AND p.blocked = false
    )
    AND (
      workspace_folders.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM workspaces w
        JOIN profiles p ON p.id = auth.uid()
        WHERE w.id = workspace_folders.workspace_id
        AND p.role = 'admin' AND p.blocked = false
      )
      OR (
        workspace_folders.visibility = 'restricted'
        AND EXISTS (
          SELECT 1 FROM entity_visibility ev
          WHERE ev.entity_type = 'folder' AND ev.entity_id = workspace_folders.id
          AND ev.profile_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "task_lists_select_org" ON task_lists;
CREATE POLICY "task_lists_select_org" ON task_lists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_folders f
      JOIN workspaces w ON w.id = f.workspace_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.id = task_lists.folder_id
      AND p.organization_id = w.organization_id AND p.blocked = false
    )
    AND (
      task_lists.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM workspace_folders f
        JOIN workspaces w ON w.id = f.workspace_id
        JOIN profiles p ON p.id = auth.uid()
        WHERE f.id = task_lists.folder_id
        AND p.role = 'admin' AND p.blocked = false
      )
      OR (
        task_lists.visibility = 'restricted'
        AND EXISTS (
          SELECT 1 FROM entity_visibility ev
          WHERE ev.entity_type = 'list' AND ev.entity_id = task_lists.id
          AND ev.profile_id = auth.uid()
        )
      )
    )
  );

-- ===== 0015_debug_fix.sql =====
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));
ALTER TABLE workspace_folders ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));
ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));

CREATE TABLE IF NOT EXISTS entity_visibility (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('workspace','folder','list')),
  entity_id UUID NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_type, entity_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_visibility_entity ON entity_visibility(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_visibility_profile ON entity_visibility(profile_id);

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

-- ===== 0016_documentos.sql =====
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_main BOOLEAN NOT NULL DEFAULT false,
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id, position);
CREATE INDEX IF NOT EXISTS idx_pages_document ON document_pages(document_id, position);

ALTER TABLE entity_visibility DROP CONSTRAINT entity_visibility_entity_type_check;
ALTER TABLE entity_visibility ADD CONSTRAINT entity_visibility_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document'));

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
    WHEN 'document' THEN (SELECT d.organization_id FROM public.documents d WHERE d.id = entity_id)
  END;
$$;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select_org" ON documents;
CREATE POLICY "documents_select_org" ON documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_folders f
      JOIN workspaces w ON w.id = f.workspace_id
      WHERE f.id = documents.folder_id
      AND w.organization_id = get_my_org_id()
    )
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR (visibility = 'restricted' AND is_entity_member('document', id))
    )
  );

DROP POLICY IF EXISTS "documents_all_admin" ON documents;
CREATE POLICY "documents_all_admin" ON documents
  FOR ALL USING (
    get_my_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM workspace_folders f
      JOIN workspaces w ON w.id = f.workspace_id
      WHERE f.id = documents.folder_id
      AND w.organization_id = get_my_org_id()
    )
  );

DROP POLICY IF EXISTS "pages_select_doc" ON document_pages;
CREATE POLICY "pages_select_doc" ON document_pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
      AND d.organization_id = get_my_org_id()
      AND (
        d.visibility = 'public'
        OR get_my_role() = 'admin'
        OR is_entity_member('document', d.id)
      )
    )
  );

DROP POLICY IF EXISTS "pages_write_visible" ON document_pages;
CREATE POLICY "pages_write_visible" ON document_pages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
      AND d.organization_id = get_my_org_id()
      AND (
        d.visibility = 'public'
        OR get_my_role() = 'admin'
        OR is_entity_member('document', d.id)
      )
    )
  );

-- ===== 0017_cleanup_visibilidad.sql =====
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

-- ===== 0018_subcarpetas.sql =====
ALTER TABLE workspace_folders ADD COLUMN IF NOT EXISTS parent_folder_id UUID REFERENCES workspace_folders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_folders_parent ON workspace_folders(parent_folder_id);

-- ===== 0019_listas_raiz.sql =====
ALTER TABLE task_lists ALTER COLUMN folder_id DROP NOT NULL;
ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE documents ALTER COLUMN folder_id DROP NOT NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE task_lists l
SET workspace_id = f.workspace_id, organization_id = w.organization_id
FROM workspace_folders f
JOIN workspaces w ON w.id = f.workspace_id
WHERE l.folder_id = f.id;

UPDATE documents d
SET workspace_id = f.workspace_id
FROM workspace_folders f
WHERE d.folder_id = f.id;

ALTER TABLE task_lists ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE task_lists ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE documents ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_lists_ws ON task_lists(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_documents_ws ON documents(workspace_id, position);

DROP POLICY IF EXISTS "task_lists_select_org" ON task_lists;
CREATE POLICY "task_lists_select_org" ON task_lists
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR (visibility = 'restricted' AND is_entity_member('list', id))
    )
  );

DROP POLICY IF EXISTS "task_lists_all_admin" ON task_lists;
CREATE POLICY "task_lists_all_admin" ON task_lists
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
  );

DROP POLICY IF EXISTS "documents_select_org" ON documents;
CREATE POLICY "documents_select_org" ON documents
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR (visibility = 'restricted' AND is_entity_member('document', id))
    )
  );

DROP POLICY IF EXISTS "documents_all_admin" ON documents;
CREATE POLICY "documents_all_admin" ON documents
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
  );

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
  END;
$$;

-- ===== 0020_due_time.sql =====
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_time TIME;

-- ===== 0021_estados_prioridades.sql =====
ALTER TABLE task_lists
  ADD COLUMN IF NOT EXISTS statuses JSONB,
  ADD COLUMN IF NOT EXISTS priorities JSONB;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS default_statuses JSONB,
  ADD COLUMN IF NOT EXISTS default_priorities JSONB;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_check') THEN
    ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_check') THEN
    ALTER TABLE tasks DROP CONSTRAINT tasks_priority_check;
  END IF;
END $$;

UPDATE task_lists
SET
  statuses = '[
    {"key":"backlog","label":"Backlog","color":"#6b7280"},
    {"key":"todo","label":"Pendiente","color":"#3b82f6"},
    {"key":"in_progress","label":"En Progreso","color":"#eab308"},
    {"key":"review","label":"Revisión","color":"#a855f7"},
    {"key":"done","label":"Completado","color":"#10b981","hidden_by_default":true},
    {"key":"cancelled","label":"Cancelado","color":"#ef4444","hidden_by_default":true}
  ]'::jsonb,
  priorities = '[
    {"key":"low","label":"Baja","color":"#6b7280"},
    {"key":"medium","label":"Media","color":"#eab308"},
    {"key":"high","label":"Alta","color":"#f97316"},
    {"key":"urgent","label":"Urgente","color":"#ef4444"}
  ]'::jsonb
WHERE statuses IS NULL;

UPDATE workspaces
SET
  default_statuses = '[
    {"key":"backlog","label":"Backlog","color":"#6b7280"},
    {"key":"todo","label":"Pendiente","color":"#3b82f6"},
    {"key":"in_progress","label":"En Progreso","color":"#eab308"},
    {"key":"review","label":"Revisión","color":"#a855f7"},
    {"key":"done","label":"Completado","color":"#10b981","hidden_by_default":true},
    {"key":"cancelled","label":"Cancelado","color":"#ef4444","hidden_by_default":true}
  ]'::jsonb,
  default_priorities = '[
    {"key":"low","label":"Baja","color":"#6b7280"},
    {"key":"medium","label":"Media","color":"#eab308"},
    {"key":"high","label":"Alta","color":"#f97316"},
    {"key":"urgent","label":"Urgente","color":"#ef4444"}
  ]'::jsonb
WHERE default_statuses IS NULL;

-- ===== 0022_oauth.sql =====
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ===== 0023_accesos.sql =====
ALTER TABLE entity_visibility
  ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'read'
    CHECK (permission IN ('read','write','manage')),
  ADD COLUMN IF NOT EXISTS inherit BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS entity_type TEXT
    CHECK (entity_type IN ('workspace','folder','list','document')),
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS permission TEXT
    CHECK (permission IN ('read','write','manage')),
  ADD COLUMN IF NOT EXISTS inherit BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_ev_permission ON entity_visibility(profile_id, permission);
CREATE INDEX IF NOT EXISTS idx_inv_scope ON invitations(entity_type, entity_id);

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
  END;
$$;

CREATE OR REPLACE FUNCTION perm_rank(p TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p WHEN 'read' THEN 1 WHEN 'write' THEN 2 WHEN 'manage' THEN 3 ELSE 0 END;
$$;

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
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
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

CREATE OR REPLACE FUNCTION task_permission(task_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.entity_permission('list', t.list_id)
  FROM public.tasks t
  WHERE t.id = task_id AND t.list_id IS NOT NULL;
$$;

DROP POLICY IF EXISTS "workspaces_select_org" ON workspaces;
CREATE POLICY "workspaces_select_org" ON workspaces
  FOR SELECT USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (organization_id = get_my_org_id() AND visibility = 'public')
    OR public.entity_permission('workspace', id) IS NOT NULL
  );

DROP POLICY IF EXISTS "workspaces_all_admin" ON workspaces;
CREATE POLICY "workspaces_all_admin" ON workspaces
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (public.perm_rank(public.entity_permission('workspace', id)) >= 3)
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
      OR public.entity_permission('folder', id) IS NOT NULL
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
    OR public.perm_rank(public.entity_permission('folder', id)) >= 3
  );

DROP POLICY IF EXISTS "task_lists_select_org" ON task_lists;
CREATE POLICY "task_lists_select_org" ON task_lists
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR public.entity_permission('list', id) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "task_lists_all_admin" ON task_lists;
CREATE POLICY "task_lists_all_admin" ON task_lists
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR public.perm_rank(public.entity_permission('list', id)) >= 3
  );

DROP POLICY IF EXISTS "documents_select_org" ON documents;
CREATE POLICY "documents_select_org" ON documents
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      visibility = 'public'
      OR get_my_role() = 'admin'
      OR public.entity_permission('document', id) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "documents_all_admin" ON documents;
CREATE POLICY "documents_all_admin" ON documents
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR public.perm_rank(public.entity_permission('document', id)) >= 3
  );

DROP POLICY IF EXISTS "pages_select_doc" ON document_pages;
CREATE POLICY "pages_select_doc" ON document_pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
      AND d.organization_id = get_my_org_id()
      AND (
        d.visibility = 'public'
        OR get_my_role() = 'admin'
        OR public.entity_permission('document', d.id) IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "pages_write_visible" ON document_pages;
CREATE POLICY "pages_write_visible" ON document_pages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
      AND d.organization_id = get_my_org_id()
      AND (
        get_my_role() = 'admin'
        OR public.perm_rank(public.entity_permission('document', d.id)) >= 2
      )
    )
  );

DROP POLICY IF EXISTS "tasks_select_own_org" ON tasks;
CREATE POLICY "tasks_select_own_org" ON tasks
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR assigned_to = auth.uid()
      OR public.task_permission(id) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "tasks_insert_admin" ON tasks;
CREATE POLICY "tasks_insert_admin" ON tasks
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (
      organization_id = get_my_org_id()
      AND list_id IS NOT NULL
      AND public.perm_rank(public.entity_permission('list', list_id)) >= 2
    )
  );

DROP POLICY IF EXISTS "tasks_update_admin" ON tasks;
CREATE POLICY "tasks_update_admin" ON tasks
  FOR UPDATE USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (organization_id = get_my_org_id() AND public.perm_rank(public.task_permission(id)) >= 2)
  );

DROP POLICY IF EXISTS "tasks_delete_admin" ON tasks;
CREATE POLICY "tasks_delete_admin" ON tasks
  FOR DELETE USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (organization_id = get_my_org_id() AND public.perm_rank(public.task_permission(id)) >= 2)
  );

DROP POLICY IF EXISTS "notes_select_in_org" ON task_notes;
CREATE POLICY "notes_select_in_org" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.organization_id = get_my_org_id()
      AND (
        get_my_role() = 'admin'
        OR t.assigned_to = auth.uid()
        OR public.task_permission(t.id) IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "notes_insert_in_org" ON task_notes;
CREATE POLICY "notes_insert_in_org" ON task_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.organization_id = get_my_org_id()
      AND (
        get_my_role() = 'admin'
        OR public.perm_rank(public.task_permission(t.id)) >= 2
      )
    )
  );