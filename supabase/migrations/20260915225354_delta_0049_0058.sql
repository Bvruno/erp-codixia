SET check_function_bodies = off;

-- ===== 0049_rename_tareas_url.sql =====
UPDATE profiles
SET preferences = jsonb_set(
    preferences,
    '{default_view}',
    '"proyectos"'::jsonb
)
WHERE preferences->>'default_view' = 'tareas';

-- ===== 0050_realtime_task_notes.sql =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_notes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_activity_log') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activity_log;
  END IF;
END $$;

-- ===== 0050_shift_break.sql =====
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS break_start_time TIME,
  ADD COLUMN IF NOT EXISTS break_end_time TIME;

-- ===== 0051_tasks_delete_cascade.sql =====
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_parent_task_id_fkey;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_parent_task_id_fkey
  FOREIGN KEY (parent_task_id)
  REFERENCES public.tasks(id)
  ON DELETE CASCADE;

-- ===== 0052_notes.sql =====
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  note_date date NOT NULL,
  title text NOT NULL DEFAULT 'Nota',
  content text,
  drawing jsonb,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_org_date ON public.notes (organization_id, note_date);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select_org" ON public.notes;
CREATE POLICY "notes_select_org" ON public.notes
  FOR SELECT USING (
    public.get_my_org_id() = organization_id
  );

DROP POLICY IF EXISTS "notes_write_org" ON public.notes;
CREATE POLICY "notes_write_org" ON public.notes
  FOR ALL USING (
    public.get_my_org_id() = organization_id
  )
  WITH CHECK (
    public.get_my_org_id() = organization_id
  );

DROP TRIGGER IF EXISTS notes_updated_at ON public.notes;
CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- ===== 0053_todo_realtime.sql =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'todo_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.todo_items;
  END IF;
END $$;

-- ===== 0054_error_logs.sql =====
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warning')),
  message TEXT NOT NULL CHECK (char_length(message) <= 4000),
  name TEXT,
  code TEXT,
  stack TEXT CHECK (stack IS NULL OR char_length(stack) <= 20000),
  route TEXT,
  method TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_agent TEXT,
  client_ip TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NOT NULL UNIQUE,
  count INT NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolved_at TIMESTAMPTZ,
  telegram_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_error_logs_last_seen ON error_logs(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_status ON error_logs(status, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_org ON error_logs(organization_id, last_seen DESC);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "error_logs_select_owner" ON error_logs;
CREATE POLICY "error_logs_select_owner" ON error_logs
  FOR SELECT USING (is_org_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_error(
  p_source text,
  p_message text,
  p_level text DEFAULT 'error',
  p_name text DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_stack text DEFAULT NULL,
  p_route text DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_client_ip text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_fingerprint text DEFAULT NULL
)
RETURNS TABLE (id uuid, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_message text;
  v_fingerprint text;
  v_row record;
BEGIN
  v_message := left(nullif(trim(p_message), ''), 4000);
  IF v_message IS NULL THEN
    v_message := 'unknown error';
  END IF;

  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object' OR p_context IS NULL THEN
    p_context := '{}'::jsonb;
  END IF;
  IF char_length(p_context::text) > 50000 THEN
    p_context := jsonb_build_object('truncated', true);
  END IF;

  IF p_level NOT IN ('error', 'warning') THEN p_level := 'error'; END IF;
  IF p_source NOT IN ('client', 'server') THEN p_source := 'server'; END IF;

  v_fingerprint := left(nullif(trim(p_fingerprint), ''), 128);
  IF v_fingerprint IS NULL THEN
    v_fingerprint := md5(coalesce(p_name, '') || '|' || v_message);
  END IF;

  IF p_client_ip IS NOT NULL AND (
    SELECT count(*) FROM public.error_logs
    WHERE client_ip = p_client_ip AND last_seen > now() - interval '1 hour'
  ) >= 100 THEN
    RETURN;
  END IF;

  INSERT INTO public.error_logs (
    source, level, message, name, code, stack, route, method,
    user_id, organization_id, user_agent, client_ip, context, fingerprint
  ) VALUES (
    p_source, p_level, v_message, left(p_name, 200), left(p_code, 20),
    left(p_stack, 20000), left(p_route, 500), left(p_method, 10),
    p_user_id, p_organization_id, left(p_user_agent, 500), left(p_client_ip, 64),
    p_context, v_fingerprint
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    count = error_logs.count + 1,
    last_seen = now(),
    status = 'open',
    resolved_at = NULL,
    telegram_sent_at = NULL
  RETURNING error_logs.id, (xmax = 0) AS is_new INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.is_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_error(text, text, text, text, text, text, text, text, uuid, uuid, text, text, jsonb, text)
  TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_error(text, text, text, text, text, text, text, text, uuid, uuid, text, text, jsonb, text)
  FROM public;

-- ===== 0054_fix_ancestor_workspace_permission.sql =====
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
        WHEN s.t = 'folder' THEN (CASE WHEN (SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'list' THEN (CASE WHEN (SELECT folder_id FROM public.task_lists WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'document' THEN (CASE WHEN (SELECT folder_id FROM public.documents WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'mindmap' THEN (CASE WHEN (SELECT folder_id FROM public.mind_maps WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'todo' THEN (CASE WHEN (SELECT folder_id FROM public.todos WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
        WHEN s.t = 'mindmap' THEN COALESCE((SELECT folder_id FROM public.mind_maps WHERE id = s.id), (SELECT workspace_id FROM public.mind_maps WHERE id = s.id))
        WHEN s.t = 'todo' THEN COALESCE((SELECT folder_id FROM public.todos WHERE id = s.id), (SELECT workspace_id FROM public.todos WHERE id = s.id))
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

CREATE OR REPLACE FUNCTION container_write_level(p_folder_id UUID, p_ws_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE scope(depth, t, id) AS (
    SELECT 0,
      CASE WHEN p_folder_id IS NOT NULL THEN 'folder' ELSE 'workspace' END,
      COALESCE(p_folder_id, p_ws_id)::uuid
    UNION ALL
    SELECT s.depth + 1,
      CASE WHEN f.parent_folder_id IS NOT NULL THEN 'folder' ELSE 'workspace' END,
      COALESCE(f.parent_folder_id, f.workspace_id)
    FROM scope s
    JOIN public.workspace_folders f ON f.id = s.id
    WHERE s.depth < 12 AND s.id IS NOT NULL AND s.t = 'folder'
  )
  SELECT max(public.perm_rank(ev.permission))
  FROM scope s
  JOIN public.entity_visibility ev
    ON ev.entity_type = s.t AND ev.entity_id = s.id
    AND ev.profile_id = auth.uid() AND ev.inherit = true
  WHERE public.entity_org_id(s.t, s.id) = public.get_my_org_id();
$$;

-- ===== 0055_tasks_delete_cascade.sql =====
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_list_id_fkey;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_list_id_fkey
  FOREIGN KEY (list_id)
  REFERENCES public.task_lists(id)
  ON DELETE CASCADE;

ALTER TABLE task_lists DISABLE TRIGGER trg_task_lists_creator_access;

INSERT INTO task_lists (workspace_id, organization_id, folder_id, name, position, visibility)
SELECT w.id, w.organization_id, NULL, 'tareas sin lista',
       COALESCE((SELECT MAX(position) + 1 FROM task_lists tl WHERE tl.workspace_id = w.id), 0),
       'public'
FROM workspaces w
WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.organization_id = w.organization_id AND t.list_id IS NULL)
  AND w.position = (SELECT MIN(position) FROM workspaces w2 WHERE w2.organization_id = w.organization_id);

ALTER TABLE task_lists ENABLE TRIGGER trg_task_lists_creator_access;

UPDATE tasks t
SET list_id = l.id
FROM task_lists l
WHERE t.list_id IS NULL
  AND l.organization_id = t.organization_id
  AND l.name = 'tareas sin lista';