-- ============================================================
-- PARTE 68: Solicitudes de acceso de owners (funnel del SaaS)
-- - owner_applications: formulario público → revisión manual →
--   aprobación (crea org + invitación) o rechazo.
-- - La aprobación enlaza la org y la invitación generadas.
-- - RLS ON sin policies + REVOKE: solo service role accede. El
--   POST público corre en la API con service role y rate limit.
-- ============================================================

CREATE TABLE IF NOT EXISTS owner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_contacto TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT,
  empresa TEXT NOT NULL,
  sitio_web TEXT,
  pais TEXT,
  sector TEXT,
  tamano_equipo TEXT,
  motivacion TEXT,
  referido_por TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_revision', 'aprobada', 'rechazada', 'invitada', 'activada')),
  notas_admin TEXT,
  organization_id UUID REFERENCES organizations ON DELETE SET NULL,
  invitation_id UUID REFERENCES invitations ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  ip_hash TEXT,
  consentimiento_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE owner_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE owner_applications FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS owner_applications_estado_idx
  ON owner_applications (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS owner_applications_email_idx
  ON owner_applications (lower(email));
