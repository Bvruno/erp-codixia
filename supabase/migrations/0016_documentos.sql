-- ============================================================
-- PARTE 16: Documentos (panel tipo libro con páginas .md)
-- ============================================================

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_main BOOLEAN NOT NULL DEFAULT false,
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_documents_folder ON documents(folder_id, position);
CREATE INDEX idx_pages_document ON document_pages(document_id, position);

-- entity_visibility: habilitar tipo 'document'
ALTER TABLE entity_visibility DROP CONSTRAINT entity_visibility_entity_type_check;
ALTER TABLE entity_visibility ADD CONSTRAINT entity_visibility_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document'));

-- entity_org_id: soportar 'document'
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

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;

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
