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