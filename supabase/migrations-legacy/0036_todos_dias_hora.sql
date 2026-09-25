-- ============================================================
-- PARTE 36: Frecuencia con días de semana y hora límite
-- week_days: INT[] convención JS getDay (0=domingo .. 6=sábado).
--   NULL/vacío = todos los días.
-- due_time: HH:MM hora límite del ciclo (aplica a daily/shift).
-- ============================================================

SET check_function_bodies = off;

-- ============ 1. Columnas (idempotente) ============

DO $$
BEGIN
  IF to_regclass('public.todo_items') IS NOT NULL THEN
    ALTER TABLE public.todo_items ADD COLUMN IF NOT EXISTS week_days INT[]
      CHECK (week_days IS NULL OR week_days <@ ARRAY[0,1,2,3,4,5,6]);
    ALTER TABLE public.todo_items ADD COLUMN IF NOT EXISTS due_time TEXT
      CHECK (due_time IS NULL OR due_time ~ '^([01]\d|2[0-3]):[0-5]\d$');
  END IF;
END;
$$;

-- ============ 2. Ciclo con hora límite ============

DROP FUNCTION IF EXISTS public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT);

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

-- ============ 3. Board / Tick actualizados ============

DROP FUNCTION IF EXISTS public.todo_board(UUID);
DROP FUNCTION IF EXISTS public.todo_tick(UUID, INT);

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