-- ============================================================
-- HARDENING: revocar acceso público a funciones de debug y
-- reemplazar SELECT público de invitations por RPC acotada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) debug_policies / debug_rls_status / debug_columns:
--    SECURITY DEFINER que enumeran políticas y esquema. Por
--    defecto PostgreSQL otorga EXECUTE a PUBLIC: cualquier
--    anónimo podía mapear el modelo de permisos RLS completo.
--    Se revoca de anon/authenticated; queda solo service_role.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION debug_policies() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_rls_status() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_columns() FROM public, anon, authenticated;

-- ------------------------------------------------------------
-- 2) Invitaciones: el policy "invitations_select_public"
--    (FOR SELECT USING (true)) exponía tokens de invitación de
--    todas las organizaciones a cualquier anónimo.
--    Se elimina y se sustituye por una RPC SECURITY DEFINER que
--    solo devuelve los datos mínimos de una invitación pendiente
--    y vigente, validada por token.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "invitations_select_public" ON invitations;

CREATE OR REPLACE FUNCTION get_invitation(p_token TEXT)
RETURNS TABLE (organization_id UUID, role TEXT, status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.organization_id, i.role, i.status, i.expires_at
  FROM invitations i
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now();
$$;

-- Única excepción: el flujo de signup (anon) valida el token de su
-- invitación antes de crear la cuenta. La función no expone nada más.
GRANT EXECUTE ON FUNCTION get_invitation(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_invitation(TEXT) FROM public;
