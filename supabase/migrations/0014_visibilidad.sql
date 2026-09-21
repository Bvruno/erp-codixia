-- ============================================================
-- PARTE 14: Renombrar, visibilidad (public/private/restricted)
-- ============================================================

ALTER TABLE workspaces ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));

ALTER TABLE workspace_folders ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));

ALTER TABLE task_lists ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private','restricted'));

-- Miembros asignados para visibilidad 'restricted'
CREATE TABLE entity_visibility (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('workspace','folder','list')),
  entity_id UUID NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_type, entity_id, profile_id)
);

CREATE INDEX idx_entity_visibility_entity ON entity_visibility(entity_type, entity_id);
CREATE INDEX idx_entity_visibility_profile ON entity_visibility(profile_id);

-- ============================================================
-- RLS: visibilidad
-- ============================================================

ALTER TABLE entity_visibility ENABLE ROW LEVEL SECURITY;

-- SELECT: propia fila o admin de la org del entity
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

-- Escritura: solo admin de la org del entity
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

-- Workspaces: SELECT con visibilidad
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

-- Folders: SELECT con visibilidad
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

-- Lists: SELECT con visibilidad
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
