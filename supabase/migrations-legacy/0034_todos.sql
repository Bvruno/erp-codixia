-- ============================================================
-- PARTE 34: TO-DO recurrente (plantillas compartidas + progreso individual)
--
-- Tareas simples y repetitivas que un trabajador puede tener.
-- Plantillas visibles por lista; progreso individual por ciclo
-- (diario / semanal / por turno / cada N días). Reinicio lazy:
-- al leer o hacer tick, si el ciclo almacenado caducó se resetea.
-- ============================================================

SET check_function_bodies = off;

-- ============ 1. todo_templates ============

CREATE TABLE IF NOT EXISTS public.todo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES public.task_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('daily','weekly','shift','interval')),
  interval_days INT CHECK (interval_days IS NULL OR interval_days > 0),
  target_quantity INT NOT NULL DEFAULT 1 CHECK (target_quantity >= 1),
  active BOOLEAN NOT NULL DEFAULT true,
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT todo_templates_interval_requires_days
    CHECK (frequency <> 'interval' OR interval_days IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_todo_templates_list ON public.todo_templates(list_id, position);
CREATE INDEX IF NOT EXISTS idx_todo_templates_org ON public.todo_templates(organization_id);

DROP TRIGGER IF EXISTS todo_templates_updated_at ON public.todo_templates;
CREATE TRIGGER todo_templates_updated_at
  BEFORE UPDATE ON public.todo_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ 2. todo_progress ============

CREATE TABLE IF NOT EXISTS public.todo_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.todo_templates(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cycle_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  quantity_done INT NOT NULL DEFAULT 0 CHECK (quantity_done >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT todo_progress_unique_template_profile UNIQUE (template_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_todo_progress_profile ON public.todo_progress(profile_id);

DROP TRIGGER IF EXISTS todo_progress_updated_at ON public.todo_progress;
CREATE TRIGGER todo_progress_updated_at
  BEFORE UPDATE ON public.todo_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ 3. RLS ============

ALTER TABLE public.todo_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_progress ENABLE ROW LEVEL SECURITY;

-- Plantillas: visibles si la lista es visible para el usuario
DROP POLICY IF EXISTS "todo_templates_select_org" ON public.todo_templates;
CREATE POLICY "todo_templates_select_org" ON public.todo_templates
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
    AND EXISTS (
      SELECT 1 FROM public.task_lists l
      WHERE l.id = todo_templates.list_id
        AND (
          l.visibility = 'public'
          OR public.get_my_role() = 'admin'
          OR public.entity_permission('list', l.id) IS NOT NULL
        )
    )
  );

-- CRUD de plantillas: admin de org o manage sobre la lista
DROP POLICY IF EXISTS "todo_templates_all_admin" ON public.todo_templates;
CREATE POLICY "todo_templates_all_admin" ON public.todo_templates
  FOR ALL USING (
    public.get_my_role() = 'admin' AND organization_id = public.get_my_org_id()
    OR (
      organization_id = public.get_my_org_id()
      AND public.perm_rank(public.entity_permission('list', list_id)) >= 3
    )
  );

-- Progreso: solo filas propias
DROP POLICY IF EXISTS "todo_progress_select_own" ON public.todo_progress;
CREATE POLICY "todo_progress_select_own" ON public.todo_progress
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "todo_progress_insert_own" ON public.todo_progress;
CREATE POLICY "todo_progress_insert_own" ON public.todo_progress
  FOR INSERT WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "todo_progress_update_own" ON public.todo_progress;
CREATE POLICY "todo_progress_update_own" ON public.todo_progress
  FOR UPDATE USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "todo_progress_delete_own" ON public.todo_progress;
CREATE POLICY "todo_progress_delete_own" ON public.todo_progress
  FOR DELETE USING (profile_id = auth.uid());

-- ============ 4. Ciclo ============

-- Calcula inicio/fin del ciclo actual para una frecuencia dada.
-- p_week_start: 0 = domingo, 1 = lunes (convención JS getDay).
CREATE OR REPLACE FUNCTION public.todo_cycle_bounds(
  p_frequency TEXT,
  p_interval_days INT,
  p_now TIMESTAMPTZ,
  p_timezone TEXT,
  p_week_start INT
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
      ELSE
        (date_trunc('day', p_now AT TIME ZONE p_timezone) + INTERVAL '1 day') AT TIME ZONE p_timezone
    END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT) FROM public;

-- ============ 5. Tablero TO-DO ============

-- Templates de una lista + progreso del usuario con reset lazy:
-- si el ciclo almacenado caducó, se reinicia quantity_done a 0
-- (UPDATE implícito) y se devuelve el ciclo actual.
CREATE OR REPLACE FUNCTION public.todo_board(p_list_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  frequency TEXT,
  interval_days INT,
  target_quantity INT,
  active BOOLEAN,
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
    SELECT t.*, p.quantity_done AS stored_done, p.cycle_start AS stored_cycle_start
    FROM public.todo_templates t
    LEFT JOIN public.todo_progress p
      ON p.template_id = t.id AND p.profile_id = v_user_id
    WHERE t.list_id = p_list_id AND t.organization_id = v_org_id
    ORDER BY t.position ASC, t.created_at ASC
  LOOP
    SELECT * INTO v_bounds
    FROM public.todo_cycle_bounds(v_rec.frequency, v_rec.interval_days, now(), v_timezone, v_week_start);

    IF v_rec.stored_cycle_start IS NULL OR v_rec.stored_cycle_start < v_bounds.cycle_start THEN
      INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
      VALUES (v_rec.id, v_user_id, v_bounds.cycle_start, 0)
      ON CONFLICT (template_id, profile_id)
      DO UPDATE SET cycle_start = EXCLUDED.cycle_start, quantity_done = 0;
    END IF;

    id := v_rec.id;
    title := v_rec.title;
    frequency := v_rec.frequency;
    interval_days := v_rec.interval_days;
    target_quantity := v_rec.target_quantity;
    active := v_rec.active;
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

-- ============ 6. Tick (check / contador) ============

-- Suma p_delta al progreso del usuario (negativo permite deshacer),
-- clamp a [0, target_quantity], con reset lazy del ciclo caducado.
CREATE OR REPLACE FUNCTION public.todo_tick(p_template_id UUID, p_delta INT)
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
  v_bounds RECORD;
  v_row RECORD;
  v_new_done INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE id = v_user_id AND blocked = false;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT frequency, interval_days, target_quantity
    INTO v_frequency, v_interval_days, v_target
  FROM public.todo_templates
  WHERE id = p_template_id AND organization_id = v_org_id
    AND EXISTS (
      SELECT 1 FROM public.task_lists l
      WHERE l.id = todo_templates.list_id
        AND (
          l.visibility = 'public'
          OR public.get_my_role() = 'admin'
          OR public.entity_permission('list', l.id) IS NOT NULL
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

  SELECT preferences INTO v_prefs FROM public.profiles WHERE id = v_user_id;
  v_week_start := CASE WHEN v_prefs->>'week_start' = 'sunday' THEN 0 ELSE 1 END;

  SELECT * INTO v_bounds
  FROM public.todo_cycle_bounds(v_frequency, v_interval_days, now(), v_timezone, v_week_start);

  SELECT * INTO v_row
  FROM public.todo_progress
  WHERE template_id = p_template_id AND profile_id = v_user_id;

  IF v_row.id IS NULL THEN
    v_new_done := GREATEST(0, LEAST(v_target, p_delta));
    INSERT INTO public.todo_progress (template_id, profile_id, cycle_start, quantity_done)
    VALUES (p_template_id, v_user_id, v_bounds.cycle_start, v_new_done);
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