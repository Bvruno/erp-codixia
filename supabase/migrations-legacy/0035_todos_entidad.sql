-- ============================================================
-- PARTE 35: TO-DO como entidad (como documento / mapa mental)
-- Cada "TO-DO" es un tablero con items repetitivos (todo_items).
-- Se reemplaza el vínculo por lista (list_id) por todo_id.
--
-- IDEMPOTENTE: puede re-ejecutarse sin error (verifica existencia
-- de tablas/columnas antes de cada ALTER; backfill solo si quedan
-- items sin vincular).
-- ============================================================

SET check_function_bodies = off;

-- ============ 1. Entidad todos (tableros) ============

CREATE TABLE IF NOT EXISTS public.todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.workspace_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todos_org ON public.todos(organization_id, position);
CREATE INDEX IF NOT EXISTS idx_todos_ws ON public.todos(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_todos_folder ON public.todos(folder_id, position);

DROP TRIGGER IF EXISTS todos_updated_at ON public.todos;
CREATE TRIGGER todos_updated_at
  BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ 2. Items: todo_templates -> todo_items ============

-- Renombrar tabla solo si la fuente existe y el destino no
DO $$
BEGIN
  IF to_regclass('public.todo_templates') IS NOT NULL
     AND to_regclass('public.todo_items') IS NULL THEN
    ALTER TABLE public.todo_templates RENAME TO todo_items;
  END IF;
END;
$$;

-- Renombrar columna title -> name solo si existe
DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'todo_items' AND column_name = 'title'
     ) THEN
    ALTER TABLE public.todo_items RENAME COLUMN title TO name;
  END IF;
END;
$$;

-- Quitar policies viejas que dependen de list_id (viven en todo_items
-- tras el rename; NO referenciar todo_templates: si no existe, DROP POLICY
-- falla con 42P01 aunque use IF EXISTS)
DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "todo_templates_select_org" ON public.todo_items;
    DROP POLICY IF EXISTS "todo_templates_all_admin" ON public.todo_items;
  END IF;
END;
$$;

-- Vincular items al tablero
ALTER TABLE public.todo_items ADD COLUMN IF NOT EXISTS todo_id UUID REFERENCES public.todos(id) ON DELETE CASCADE;

-- Backfill: cada item legacy (sin todo_id) se convierte en su propio
-- TO-DO (match por org+name+created_by). Solo corre si hay items sin vincular.
DO $$
DECLARE
  v_pending INT;
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    SELECT count(*) INTO v_pending FROM public.todo_items WHERE todo_id IS NULL;
    IF v_pending > 0 THEN
      CREATE TEMP TABLE _todo_map (item_id UUID PRIMARY KEY, todo_id UUID) ON COMMIT DROP;

      INSERT INTO public.todos (organization_id, workspace_id, folder_id, name, position, created_by)
      SELECT tt.organization_id, l.workspace_id, l.folder_id, tt.name, 0, tt.created_by
      FROM public.todo_items tt
      LEFT JOIN public.task_lists l ON l.id = tt.list_id
      WHERE tt.todo_id IS NULL;

      INSERT INTO _todo_map (item_id, todo_id)
      SELECT tt.id, t.id
      FROM public.todo_items tt
      JOIN public.todos t
        ON t.name = tt.name AND t.organization_id = tt.organization_id
       AND t.created_by IS NOT DISTINCT FROM tt.created_by
      WHERE tt.todo_id IS NULL;

      UPDATE public.todo_items tt SET todo_id = m.todo_id FROM _todo_map m WHERE m.item_id = tt.id;

      DROP TABLE _todo_map;
    END IF;
  END IF;
END;
$$;

-- Limpieza de columnas legacy y NOT NULL (solo si la tabla existe)
DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    ALTER TABLE public.todo_items DROP COLUMN IF EXISTS list_id;
    ALTER TABLE public.todo_items DROP COLUMN IF EXISTS organization_id;
    IF EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'todo_items' AND column_name = 'todo_id'
       )
       AND NOT EXISTS (SELECT 1 FROM public.todo_items WHERE todo_id IS NULL) THEN
      ALTER TABLE public.todo_items ALTER COLUMN todo_id SET NOT NULL;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_todo_items_todo ON public.todo_items(todo_id, position);
  END IF;
END;
$$;

DROP INDEX IF EXISTS idx_todo_templates_list;
DROP INDEX IF EXISTS idx_todo_templates_org;

-- ============ 3. Tipos habilitados ============

ALTER TABLE public.entity_visibility DROP CONSTRAINT IF EXISTS entity_visibility_entity_type_check;
ALTER TABLE public.entity_visibility ADD CONSTRAINT entity_visibility_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap','todo'));

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_entity_type_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_entity_type_check
  CHECK (entity_type IN ('workspace','folder','list','document','mindmap','todo'));

-- ============ 4. Helpers (entity_org_id / entity_permission) ============

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

-- ============ 5. RLS ============

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todos_select_org" ON public.todos;
CREATE POLICY "todos_select_org" ON public.todos
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
    AND (
      visibility = 'public'
      OR public.get_my_role() = 'admin'
      OR public.entity_permission('todo', id) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "todos_all_admin" ON public.todos;
CREATE POLICY "todos_all_admin" ON public.todos
  FOR ALL USING (
    public.get_my_role() = 'admin' AND organization_id = public.get_my_org_id()
    OR public.perm_rank(public.entity_permission('todo', id)) >= 3
  );

-- Policies de items: solo si la tabla existe (BD parcialmente migrada)
DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "todo_items_select_org" ON public.todo_items;
    CREATE POLICY "todo_items_select_org" ON public.todo_items
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.todos t
          WHERE t.id = todo_items.todo_id
            AND t.organization_id = public.get_my_org_id()
            AND (
              t.visibility = 'public'
              OR public.get_my_role() = 'admin'
              OR public.entity_permission('todo', t.id) IS NOT NULL
            )
        )
      );

    DROP POLICY IF EXISTS "todo_items_all_admin" ON public.todo_items;
    CREATE POLICY "todo_items_all_admin" ON public.todo_items
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.todos t
          WHERE t.id = todo_items.todo_id
            AND t.organization_id = public.get_my_org_id()
            AND (
              public.get_my_role() = 'admin'
              OR public.perm_rank(public.entity_permission('todo', t.id)) >= 3
            )
        )
      );
  END IF;
END;
$$;

-- ============ 6. RPCs (estado final, incluye días/hora de 0036) ============

DROP FUNCTION IF EXISTS public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT);
DROP FUNCTION IF EXISTS public.todo_board(uuid);
DROP FUNCTION IF EXISTS public.todo_tick(uuid, integer);

CREATE OR REPLACE FUNCTION public.todo_cycle_bounds(
  p_frequency TEXT,
  p_interval_days INT,
  p_now TIMESTAMPTZ,
  p_timezone TEXT,
  p_week_start INT,
  p_time TEXT
)
RETURNS TABLE (cycle_start TIMESTAMPTZ, cycle_end TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE p_frequency
      WHEN 'weekly' THEN
        (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
          + (p_week_start - 1) * INTERVAL '1 day') AT TIME ZONE p_timezone
      WHEN 'interval' THEN
        ((p_now AT TIME ZONE p_timezone)::date
          - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
        ) AT TIME ZONE p_timezone
      ELSE
        (date_trunc('day', p_now AT TIME ZONE p_timezone)) AT TIME ZONE p_timezone
    END,
    CASE p_frequency
      WHEN 'weekly' THEN
        (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
          + (p_week_start - 1) * INTERVAL '1 day' + 7 * INTERVAL '1 day') AT TIME ZONE p_timezone
      WHEN 'interval' THEN
        ((p_now AT TIME ZONE p_timezone)::date
          - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
          + p_interval_days) AT TIME ZONE p_timezone
      WHEN 'daily' THEN
        (date_trunc('day', p_now AT TIME ZONE p_timezone)
          + CASE WHEN p_time ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN (p_time::time - TIME '00:00') ELSE INTERVAL '1 day' END) AT TIME ZONE p_timezone
      ELSE
        (date_trunc('day', p_now AT TIME ZONE p_timezone)
          + CASE WHEN p_time ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN (p_time::time - TIME '00:00') ELSE INTERVAL '1 day' END) AT TIME ZONE p_timezone
    END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) FROM public;

CREATE OR REPLACE FUNCTION public.todo_board(p_todo_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  frequency TEXT,
  interval_days INT,
  target_quantity INT,
  active BOOLEAN,
  week_days INT[],
  due_time TEXT,
  quantity_done INT,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_timezone TEXT := 'UTC';
  v_week_start INT := 1;
  v_prefs JSONB;
  v_rec RECORD;
  v_bounds RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles p WHERE p.id = v_user_id AND p.blocked = false;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT timezone INTO v_timezone
  FROM public.org_settings WHERE organization_id = v_org_id;
  IF v_timezone IS NULL OR v_timezone = '' THEN
    v_timezone := 'UTC';
  END IF;

  SELECT preferences INTO v_prefs FROM public.profiles p WHERE p.id = v_user_id;
  v_week_start := CASE WHEN v_prefs->>'week_start' = 'sunday' THEN 0 ELSE 1 END;

  FOR v_rec IN
    SELECT i.*, p.quantity_done AS stored_done, p.cycle_start AS stored_cycle_start
    FROM public.todo_items i
    LEFT JOIN public.todo_progress p
      ON p.template_id = i.id AND p.profile_id = v_user_id
    WHERE i.todo_id = p_todo_id
      AND EXISTS (
        SELECT 1 FROM public.todos td
        WHERE td.id = i.todo_id AND td.organization_id = v_org_id
      )
    ORDER BY i.position ASC, i.created_at ASC
  LOOP
    SELECT * INTO v_bounds
    FROM public.todo_cycle_bounds(v_rec.frequency, v_rec.interval_days, now(), v_timezone, v_week_start, v_rec.due_time);

    IF v_rec.stored_cycle_start IS NULL OR v_rec.stored_cycle_start < v_bounds.cycle_start THEN
      INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
      VALUES (v_rec.id, v_user_id, v_bounds.cycle_start, 0)
      ON CONFLICT (template_id, profile_id)
      DO UPDATE SET cycle_start = EXCLUDED.cycle_start, quantity_done = 0;
    END IF;

    id := v_rec.id;
    name := v_rec.name;
    frequency := v_rec.frequency;
    interval_days := v_rec.interval_days;
    target_quantity := v_rec.target_quantity;
    active := v_rec.active;
    week_days := v_rec.week_days;
    due_time := v_rec.due_time;
    quantity_done := CASE
      WHEN v_rec.stored_cycle_start IS NULL OR v_rec.stored_cycle_start < v_bounds.cycle_start
      THEN 0
      ELSE COALESCE(v_rec.stored_done, 0)
    END;
    cycle_start := v_bounds.cycle_start;
    cycle_end := v_bounds.cycle_end;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_board(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_board(UUID) FROM public;

CREATE OR REPLACE FUNCTION public.todo_tick(p_item_id UUID, p_delta INT)
RETURNS TABLE (
  quantity_done INT,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_timezone TEXT := 'UTC';
  v_week_start INT := 1;
  v_prefs JSONB;
  v_frequency TEXT;
  v_interval_days INT;
  v_target INT;
  v_due_time TEXT;
  v_bounds RECORD;
  v_row RECORD;
  v_new_done INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles p WHERE p.id = v_user_id AND p.blocked = false;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT i.frequency, i.interval_days, i.target_quantity, i.due_time
    INTO v_frequency, v_interval_days, v_target, v_due_time
  FROM public.todo_items i
  WHERE i.id = p_item_id
    AND EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = i.todo_id
        AND t.organization_id = v_org_id
        AND (
          t.visibility = 'public'
          OR public.get_my_role() = 'admin'
          OR public.entity_permission('todo', t.id) IS NOT NULL
        )
    );
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT timezone INTO v_timezone
  FROM public.org_settings WHERE organization_id = v_org_id;
  IF v_timezone IS NULL OR v_timezone = '' THEN
    v_timezone := 'UTC';
  END IF;

  SELECT preferences INTO v_prefs FROM public.profiles p WHERE p.id = v_user_id;
  v_week_start := CASE WHEN v_prefs->>'week_start' = 'sunday' THEN 0 ELSE 1 END;

  SELECT * INTO v_bounds
  FROM public.todo_cycle_bounds(v_frequency, v_interval_days, now(), v_timezone, v_week_start, v_due_time);

  SELECT * INTO v_row
  FROM public.todo_progress
  WHERE template_id = p_item_id AND profile_id = v_user_id;

  IF v_row.id IS NULL THEN
    v_new_done := GREATEST(0, LEAST(v_target, p_delta));
    INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
    VALUES (p_item_id, v_user_id, v_bounds.cycle_start, v_new_done);
  ELSIF v_row.cycle_start < v_bounds.cycle_start THEN
    v_new_done := GREATEST(0, LEAST(v_target, p_delta));
    UPDATE public.todo_progress
    SET cycle_start = v_bounds.cycle_start, quantity_done = v_new_done
    WHERE id = v_row.id;
  ELSE
    v_new_done := GREATEST(0, LEAST(v_target, v_row.quantity_done + p_delta));
    UPDATE public.todo_progress SET quantity_done = v_new_done WHERE id = v_row.id;
  END IF;

  quantity_done := v_new_done;
  cycle_start := v_bounds.cycle_start;
  cycle_end := v_bounds.cycle_end;
  RETURN NEXT;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_tick(UUID, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_tick(UUID, INT) FROM public;