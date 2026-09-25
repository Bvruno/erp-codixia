-- ============================================================
-- PARTE 24: Configuración de organización (límites globales)
-- Límites de horas por org + timezone. Los límites globales
-- se referencian desde perfil ("la organización define límites
-- globales en Configuración") y se aplican a cálculos de horas.
-- ============================================================

CREATE TABLE org_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations ON DELETE CASCADE,
  daily_hours INT DEFAULT 8 NOT NULL,
  weekly_hours INT DEFAULT 40 NOT NULL,
  timezone TEXT DEFAULT 'America/Mexico_City' NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS: lectura para toda la org, escritura solo admin
CREATE POLICY "org_settings_select_own_org" ON org_settings
  FOR SELECT USING (organization_id = get_my_org_id());

CREATE POLICY "org_settings_all_admin" ON org_settings
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- Permitir que cualquier admin renombre la org (org_update_owner
-- solo habilita al owner; el page de configuración es admin-only)
DROP POLICY IF EXISTS "org_update_owner" ON organizations;
CREATE POLICY "org_update_owner" ON organizations
  FOR UPDATE USING (
    auth.uid() = owner_id
    OR (id = get_my_org_id() AND get_my_role() = 'admin')
  );

-- Backfill: una fila por org existente
INSERT INTO org_settings (organization_id)
SELECT id FROM organizations
ON CONFLICT (organization_id) DO NOTHING;
