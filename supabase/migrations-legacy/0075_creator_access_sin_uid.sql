-- ============================================================
-- 0075: `grant_creator_access` tolera contextos sin usuario.
--
-- Con service role (o postgres) `auth.uid()` es NULL y el trigger
-- intentaba insertar un grant con profile_id NULL → NOT NULL violation
-- (rompía seeds/backfills que crean entidades con service role).
-- Sin usuario no hay "creador" al que otorgar manage: se omite.
-- ============================================================

CREATE OR REPLACE FUNCTION public.grant_creator_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.entity_visibility (entity_type, entity_id, profile_id, permission, inherit)
  VALUES (TG_ARGV[0], NEW.id, auth.uid(), 'manage', false)
  ON CONFLICT (entity_type, entity_id, profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;
