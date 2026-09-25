DO $$
DECLARE
  dup RECORD;
BEGIN
  SELECT COALESCE(folder_id, workspace_id) AS contenedor,
         lower(btrim(name)) AS normal,
         count(*) AS n,
         string_agg(id::text, ', ') AS ids
    INTO dup
  FROM public.formularios
  GROUP BY 1, 2
  HAVING count(*) > 1
  LIMIT 1;
  IF dup.n IS NOT NULL THEN
    RAISE EXCEPTION 'Hay nombres duplicados en formularios (%): %', dup.normal, dup.ids;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_formularios_nombre
  ON public.formularios (COALESCE(folder_id, workspace_id), lower(btrim(name)));

ALTER TABLE public.formularios ADD COLUMN IF NOT EXISTS codigo_publico TEXT;
ALTER TABLE public.formulario_invitados ADD COLUMN IF NOT EXISTS codigo TEXT;

CREATE OR REPLACE FUNCTION public.generar_codigo_corto()
RETURNS TEXT
LANGUAGE plpgsql
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

DO $$
DECLARE
  fila RECORD;
  intento TEXT;
BEGIN
  FOR fila IN SELECT id FROM public.formularios WHERE codigo_publico IS NULL LOOP
    LOOP
      intento := public.generar_codigo_corto();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.formularios WHERE codigo_publico = intento
      );
    END LOOP;
    UPDATE public.formularios SET codigo_publico = intento WHERE id = fila.id;
  END LOOP;

  FOR fila IN SELECT id FROM public.formulario_invitados WHERE codigo IS NULL LOOP
    LOOP
      intento := public.generar_codigo_corto();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.formulario_invitados WHERE codigo = intento
      );
    END LOOP;
    UPDATE public.formulario_invitados SET codigo = intento WHERE id = fila.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_formularios_codigo
  ON public.formularios (codigo_publico)
  WHERE codigo_publico IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_formulario_invitados_codigo
  ON public.formulario_invitados (codigo)
  WHERE codigo IS NOT NULL;

ALTER TABLE public.formularios DROP CONSTRAINT IF EXISTS formularios_codigo_publico_check;
ALTER TABLE public.formularios ADD CONSTRAINT formularios_codigo_publico_check
  CHECK (codigo_publico IS NULL OR codigo_publico ~ '^[a-z0-9]{6}$');

ALTER TABLE public.formulario_invitados DROP CONSTRAINT IF EXISTS formulario_invitados_codigo_check;
ALTER TABLE public.formulario_invitados ADD CONSTRAINT formulario_invitados_codigo_check
  CHECK (codigo IS NULL OR codigo ~ '^[a-z0-9]{6}$');