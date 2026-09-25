-- ============================================================
-- PARTE 81: integridad owner/admin de la organización
--
-- Contexto: el modelo de permisos v2 (0073) decide los INSERT de
-- contenido con `entity_writable(...)`: exige get_my_role() = 'admin'
-- o permiso efectivo >= write. Un perfil con organización pero sin
-- `role = 'admin'` conserva la lectura (visibilidad pública sobre
-- organization_id válido) pero no puede crear/editar nada, y el
-- usuario solo ve errores RLS crípticos.
--
-- Esta migración:
--   1) Repara los perfiles que son owner de una organización:
--      role='admin', is_owner=true, blocked=false, access_mode='org'
--      y organization_id de su propia organización.
--   2) Blinda: no se puede dejar una organización sin ningún admin
--      activo (por UPDATE ni por DELETE de perfiles).
-- ============================================================

-- 1) Reparación idempotente de owners.
UPDATE public.profiles p
   SET role            = 'admin',
       is_owner        = true,
       blocked         = false,
       access_mode     = 'org',
       organization_id = o.id
  FROM public.organizations o
 WHERE o.owner_id = p.id
   AND (
     p.role            IS DISTINCT FROM 'admin'
     OR p.is_owner     IS DISTINCT FROM true
     OR p.blocked      IS DISTINCT FROM false
     OR p.access_mode  IS DISTINCT FROM 'org'
     OR p.organization_id IS DISTINCT FROM o.id
   );

-- 2) Guarda: la organización debe conservar al menos un admin activo.
CREATE OR REPLACE FUNCTION public.proteger_admins_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quedan int;
  v_org uuid;
  v_era_admin boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org := OLD.organization_id;
    v_era_admin := (OLD.role = 'admin' AND OLD.blocked = false);
  ELSE
    v_org := OLD.organization_id;
    v_era_admin := (OLD.role = 'admin' AND OLD.blocked = false);
    -- Si el cambio lo mantiene como admin activo de la misma org, no hay nada que cuidar.
    IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND NEW.role = 'admin'
       AND NEW.blocked = false THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_org IS NULL OR NOT v_era_admin THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO v_quedan
    FROM public.profiles p
   WHERE p.organization_id = v_org
     AND p.id <> OLD.id
     AND p.role = 'admin'
     AND p.blocked = false;

  IF v_quedan = 0 THEN
    RAISE EXCEPTION 'La organización debe conservar al menos un administrador activo'
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_proteger_admins_upd ON public.profiles;
CREATE TRIGGER trg_profiles_proteger_admins_upd
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_admins_org();

DROP TRIGGER IF EXISTS trg_profiles_proteger_admins_del ON public.profiles;
CREATE TRIGGER trg_profiles_proteger_admins_del
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_admins_org();
