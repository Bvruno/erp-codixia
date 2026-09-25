-- ============================================================
-- PARTE 13: Espacios de trabajo, carpetas y listas
-- ============================================================

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE workspace_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE task_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE tasks ADD COLUMN list_id UUID REFERENCES task_lists(id) ON DELETE SET NULL;

-- Estructura por defecto por organización y migración de tareas existentes
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

CREATE INDEX idx_tasks_list_id ON tasks(list_id);
CREATE INDEX idx_workspaces_org ON workspaces(organization_id, position);
CREATE INDEX idx_folders_workspace ON workspace_folders(workspace_id, position);
CREATE INDEX idx_task_lists_folder ON task_lists(folder_id, position);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_select_org" ON workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = workspaces.organization_id AND blocked = false
    )
  );

CREATE POLICY "workspaces_all_admin" ON workspaces
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND organization_id = workspaces.organization_id
      AND role = 'admin' AND blocked = false
    )
  );

CREATE POLICY "folders_select_org" ON workspace_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN profiles p ON p.id = auth.uid()
      WHERE w.id = workspace_folders.workspace_id
      AND p.organization_id = w.organization_id AND p.blocked = false
    )
  );

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
