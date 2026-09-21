-- ============================================================
-- PARTE 19: Listas y documentos en raíz de workspace
-- (folder_id nullable + workspace_id; RLS por organización)
-- ============================================================

ALTER TABLE task_lists ALTER COLUMN folder_id DROP NOT NULL;
ALTER TABLE task_lists ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE task_lists ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE documents ALTER COLUMN folder_id DROP NOT NULL;
ALTER TABLE documents ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Backfill desde la carpeta actual
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

CREATE INDEX idx_task_lists_ws ON task_lists(workspace_id, position);
CREATE INDEX idx_documents_ws ON documents(workspace_id, position);

-- ============================================================
-- RLS simplificada (org directa, sin join a carpetas)
-- ============================================================

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

-- entity_org_id: rama list más simple (org directa)
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
