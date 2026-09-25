-- ============================================================
-- PARTE 42: Fix de límites del ciclo TO-DO
-- due_time=00:00 producía un ciclo de duración cero
-- (start == end): el item quedaba vencido de forma perpetua.
-- Ahora, si end <= start, el ciclo se extiende al día completo.
-- ============================================================

DROP FUNCTION IF EXISTS public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.todo_cycle_bounds(
  p_frequency TEXT,
  p_interval_days INT,
  p_now TIMESTAMPTZ,
  p_timezone TEXT,
  p_week_start INT,
  p_time TEXT
)
RETURNS TABLE (cycle_start TIMESTAMPTZ, cycle_end TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
BEGIN
  IF p_frequency = 'weekly' THEN
    v_start := (date_trunc('week', (p_now AT TIME ZONE p_timezone)::date)
      + (p_week_start - 1) * INTERVAL '1 day') AT TIME ZONE p_timezone;
    v_end := v_start + INTERVAL '7 days';
  ELSIF p_frequency = 'interval' THEN
    v_start := ((p_now AT TIME ZONE p_timezone)::date
      - (((p_now AT TIME ZONE p_timezone)::date - DATE '2000-01-01') % p_interval_days)
    ) AT TIME ZONE p_timezone;
    v_end := v_start + p_interval_days * INTERVAL '1 day';
  ELSE
    v_start := date_trunc('day', p_now AT TIME ZONE p_timezone) AT TIME ZONE p_timezone;
    v_end := v_start + CASE
      WHEN p_time ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN (p_time::time - TIME '00:00')
      ELSE INTERVAL '1 day'
    END;
    IF v_end <= v_start THEN
      v_end := v_start + INTERVAL '1 day';
    END IF;
  END IF;

  cycle_start := v_start;
  cycle_end := v_end;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.todo_cycle_bounds(TEXT, INT, TIMESTAMPTZ, TEXT, INT, TEXT) FROM public;