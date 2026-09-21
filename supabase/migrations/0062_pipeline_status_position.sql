-- ============================================================
-- 0062: orden manual del pipeline desacoplado del board.
-- ------------------------------------------------------------
-- `tasks.position` sigue siendo el orden del board por lista/ramas.
-- El kanban global (pipeline) usaba `position` para ordenar columnas y
-- al mover una tarjeta reescribía posiciones de toda la organización,
-- pisando el orden manual del board. Ahora el pipeline ordena por
-- `status_position` (por columna de estado).
-- ============================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS status_position INT NOT NULL DEFAULT 0;

-- Backfill: conserva el orden visual actual de cada columna.
WITH ranked AS (
  SELECT id,
         (row_number() OVER (
           PARTITION BY status
           ORDER BY position, due_date NULLS LAST, created_at, id
         ) - 1)::int AS rn
  FROM public.tasks
)
UPDATE public.tasks t
SET status_position = r.rn
FROM ranked r
WHERE t.id = r.id;

CREATE INDEX IF NOT EXISTS idx_tasks_status_position
  ON public.tasks (status, status_position);

-- Movimiento de tarjeta en el pipeline: status + orden en una sola
-- transacción. SECURITY INVOKER: aplican las policies RLS del usuario.
CREATE OR REPLACE FUNCTION public.reordenar_pipeline(items JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  item RECORD;
BEGIN
  IF items IS NULL OR jsonb_typeof(items) <> 'array' THEN
    RAISE EXCEPTION 'items debe ser un array JSON';
  END IF;

  FOR item IN
    SELECT *
    FROM jsonb_to_recordset(items)
      AS x(id UUID, status TEXT, status_position INT)
  LOOP
    IF item.id IS NULL OR item.status IS NULL OR item.status_position IS NULL THEN
      RAISE EXCEPTION 'item inválido: %', item;
    END IF;

    UPDATE public.tasks
    SET status = item.status,
        status_position = GREATEST(item.status_position, 0)
    WHERE id = item.id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reordenar_pipeline(JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reordenar_pipeline(JSONB) TO authenticated;
