-- ============================================================
-- PARTE 18: Sub-carpetas (parent_folder_id) y mover carpetas
-- ============================================================

ALTER TABLE workspace_folders ADD COLUMN parent_folder_id UUID REFERENCES workspace_folders(id) ON DELETE CASCADE;

CREATE INDEX idx_folders_parent ON workspace_folders(parent_folder_id);
