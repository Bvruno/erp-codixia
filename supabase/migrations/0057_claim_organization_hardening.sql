-- ============================================================
-- PARTE 57: Seguridad — claim_organization endurecida
-- Vulnerabilidad (alta): función SECURITY DEFINER ejecutable por
-- `anon` vía /rest/v1/rpc/claim_organization SIN verificar
-- auth.uid() = p_user_id → org takeover de empresas sin dueño.
-- Fix:
--   1) Solo service_role ejecuta: el flujo legítimo es server-side
--      (complete-onboarding.ts con admin client). REVOKE total a
--      anon/authenticated.
--   2) Verificación de membresía: el usuario reclamado debe tener
--      profile ligado a la organización (defensa en profundidad).
--   3) search_path fijo + objetos calificados.
-- ============================================================

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
  -- El reclamante debe ser miembro de la organización.
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