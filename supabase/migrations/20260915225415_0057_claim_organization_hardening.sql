CREATE OR REPLACE FUNCTION public.claim_organization(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_claimed boolean;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
    FROM public.profiles
   WHERE id = p_user_id;
  IF v_org_id IS NULL OR v_org_id <> p_org_id THEN
    RETURN false;
  END IF;

  UPDATE public.organizations
     SET owner_id = p_user_id
   WHERE id = p_org_id
     AND owner_id IS NULL
  RETURNING true INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
     SET is_owner = true
   WHERE id = p_user_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_organization(uuid, uuid)
  FROM anon, public, authenticated;