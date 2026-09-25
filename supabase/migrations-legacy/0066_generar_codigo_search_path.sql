-- ============================================================
-- 0066: generar_codigo_corto con search_path fijo
-- ------------------------------------------------------------
-- El advisor de seguridad marcaba la función creada en 0064
-- (search_path mutable). Se recrea idéntica pero con
-- `SET search_path = 'public'`. La usan los triggers/backfills de
-- formularios.
--
-- IDEMPOTENTE: puede re-ejecutarse sin error.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generar_codigo_corto()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  alfabeto TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  resultado TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    resultado := resultado || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  END LOOP;
  RETURN resultado;
END;
$$;
