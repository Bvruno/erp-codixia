-- ============================================================
-- PARTE 11: Hardening RLS perfiles
-- ============================================================

-- Reemplaza profiles_update_org_admin: cualquier admin podía
-- demotar/bloquear a cualquiera, incluido el owner y otros admins.

DROP POLICY IF EXISTS "profiles_update_org_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;

-- Owner: control total sobre miembros (excepto su propio perfil)
CREATE POLICY "profiles_update_owner" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = profiles.organization_id
      AND o.owner_id = auth.uid()
    )
    AND auth.uid() <> profiles.id
  );

-- Admin no-owner: solo filas de colaboradores, nunca self/owner/admins
CREATE POLICY "profiles_update_admin_collaborators" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.organization_id = profiles.organization_id
      AND p.role = 'admin' AND p.blocked = false
    )
    AND auth.uid() <> profiles.id
    AND profiles.role = 'collaborator'
  );

-- Self: un colaborador puede actualizar su propio perfil (p. ej.
-- aceptar invitación) pero nunca promoverse a admin
CREATE POLICY "profiles_update_own_collaborator" ON profiles
  FOR UPDATE USING (
    auth.uid() = profiles.id
    AND profiles.role = 'collaborator'
    AND profiles.blocked = false
  )
  WITH CHECK (profiles.role = 'collaborator');

-- Self: un admin puede editar su propio perfil pero nunca demotarse
CREATE POLICY "profiles_update_own_admin" ON profiles
  FOR UPDATE USING (
    auth.uid() = profiles.id
    AND profiles.role = 'admin'
    AND profiles.blocked = false
  )
  WITH CHECK (profiles.role = 'admin');
