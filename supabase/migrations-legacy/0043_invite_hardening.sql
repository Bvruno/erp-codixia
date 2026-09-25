-- ============================================================
-- HARDENING DE INVITACIONES Y PERMISOS
--  1) Tokens de invitación: SHA-256 en lugar de texto plano.
--  2) profiles: elimina self-update sin restricciones y la
--     regresión profiles_update_admin; admin no puede promover.
--  3) permissions: check de org al insertar + políticas DELETE.
--  4) RPC get_invitation endurecida (search_path='') — recibe el
--     hash SHA-256 del token (lo calcula el server, no la DB).
--  5) Limpieza de políticas duplicadas (my_* leftovers).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Hash de tokens
--    El token queda almacenado como SHA-256 hex (64 chars).
--    Los links ya distribuidos siguen funcionando: las
--    búsquedas hashean el token entrante antes de comparar.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE invitations
SET token = encode(digest(token, 'sha256'), 'hex')
WHERE token !~ '^[0-9a-f]{64}$';

-- ------------------------------------------------------------
-- 2) profiles
--    - DROP profiles_update_admin (regresión reintroducida en el
--      entorno live: permitía a cualquier admin editar admins).
--    - DROP profiles_update_own (sin WITH CHECK: un colaborador
--      podía promoverse a admin y desbloquearse a sí mismo).
--    - profiles_update_admin_collaborators: WITH CHECK impide que
--      un admin cambie el rol de un colaborador (solo el owner
--      gestiona admins); bloquear/desbloquear sigue permitido.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

DROP POLICY IF EXISTS "profiles_update_admin_collaborators" ON profiles;
CREATE POLICY "profiles_update_admin_collaborators" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.organization_id = profiles.organization_id
      AND p.role = 'admin' AND p.blocked = false
    )
    AND auth.uid() <> profiles.id
    AND profiles.role = 'collaborator'
  )
  WITH CHECK (profiles.role = 'collaborator');

-- ------------------------------------------------------------
-- 3) permissions (solicitudes de permiso/ausencia)
--    - Insert con check de org (antes solo auth.uid() = user_id).
--    - DELETE: admin de la org o el propio usuario si está pending.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "perm_insert_own" ON permissions;
CREATE POLICY "perm_insert_own" ON permissions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND organization_id = get_my_org_id()
  );

DROP POLICY IF EXISTS "perm_delete_admin" ON permissions;
CREATE POLICY "perm_delete_admin" ON permissions
  FOR DELETE USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
  );

DROP POLICY IF EXISTS "perm_delete_own_pending" ON permissions;
CREATE POLICY "perm_delete_own_pending" ON permissions
  FOR DELETE USING (
    auth.uid() = user_id
    AND status = 'pending'
    AND organization_id = get_my_org_id()
  );

-- ------------------------------------------------------------
-- 4) RPC get_invitation endurecida
--    p_token ahora recibe el hash SHA-256 (hex) del token; el
--    server (login/signup) lo calcula antes de llamar. Compare
--    directa contra la columna token, sin funciones en el body.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_invitation(p_token TEXT)
RETURNS TABLE (organization_id UUID, role TEXT, status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.organization_id, i.role, i.status, i.expires_at
  FROM public.invitations i
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION get_invitation(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_invitation(TEXT) FROM public;

-- ------------------------------------------------------------
-- 5) Limpieza de políticas duplicadas del entorno live
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "invitations_manage_admin" ON invitations;
DROP POLICY IF EXISTS "perm_select_org" ON permissions;
DROP POLICY IF EXISTS "profiles_select_same_org" ON profiles;