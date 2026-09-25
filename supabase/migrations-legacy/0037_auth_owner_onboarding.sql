-- ============================================================
-- PARTE 37: Modelo SaaS multi-empresa — owner reclamable
-- - organizations.owner_id pasa a ser nullable: el desarrollador
--   crea la empresa (sin dueño) y el primer admin la reclama.
-- - profiles.is_owner: flag booleano que distingue al dueño
--   (único) del resto de admins; el rol queda admin/collaborator.
-- - claim_organization(): reclamo atómico y exclusivo (owner_id
--   NULL → dueño) sin race conditions.
-- - handle_new_user(): rol por defecto 'collaborator' (antes
--   'admin'); el owner solo se asigna vía claim, nunca por
--   invitación.
-- ============================================================

ALTER TABLE organizations
  ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), 'collaborator');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION public.claim_organization(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  UPDATE organizations
     SET owner_id = p_user_id
   WHERE id = p_org_id
     AND owner_id IS NULL
  RETURNING true INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN false;
  END IF;

  UPDATE profiles SET is_owner = true WHERE id = p_user_id;
  RETURN true;
END;
$$;