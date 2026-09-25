-- ============================================================
-- PARTE 78: Telegram de la plataforma + campana in-app
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_telegram_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_token TEXT,
  chat_destino TEXT,
  chat_etiqueta TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  nivel_minimo TEXT NOT NULL DEFAULT 'error'
    CHECK (nivel_minimo IN ('warning', 'error')),
  agrupar_errores_segundos INT NOT NULL DEFAULT 300
    CHECK (agrupar_errores_segundos BETWEEN 0 AND 86400),
  rate_limit_hora INT NOT NULL DEFAULT 30
    CHECK (rate_limit_hora BETWEEN 1 AND 1000),
  quiet_hours JSONB NOT NULL DEFAULT
    '{"activo": false, "desde": "22:00", "hasta": "08:00", "timezone": "America/Mexico_City"}',
  markdown BOOLEAN NOT NULL DEFAULT true,
  digest_activo BOOLEAN NOT NULL DEFAULT true,
  digest_hora TIME NOT NULL DEFAULT '09:00',
  digest_timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  webhook_secret TEXT,
  update_offset BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users ON DELETE SET NULL
);

INSERT INTO platform_telegram_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_telegram_eventos (
  evento TEXT PRIMARY KEY,
  categoria TEXT NOT NULL,
  habilitado BOOLEAN NOT NULL DEFAULT true,
  plantilla TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0
);

INSERT INTO platform_telegram_eventos (evento, categoria, habilitado, plantilla, orden) VALUES
  ('solicitud_nueva', 'solicitudes', true,
   '📥 Nueva solicitud
Empresa: {{empresa}}
Contacto: {{contacto}} ({{email}})
País: {{pais}} · Sector: {{sector}}
Tamaño: {{tamano_equipo}}
Motivación: {{motivacion}}', 1),
  ('solicitud_en_revision', 'solicitudes', true,
   '🔎 Solicitud en revisión
{{empresa}} — {{contacto}}', 2),
  ('solicitud_aprobada', 'solicitudes', true,
   '✅ Solicitud aprobada
{{empresa}}
Plan: {{plan}}
Invitación: {{enlace_invitacion}}
Expira: {{expira_at}}', 3),
  ('solicitud_rechazada', 'solicitudes', true,
   '🚫 Solicitud rechazada
{{empresa}}
Motivo: {{motivo}}', 4),
  ('empresa_creada', 'empresas', true,
   '🏢 Empresa creada
{{empresa}}
Owner: {{owner_email}}
Invitación: {{enlace_invitacion}}', 5),
  ('empresa_activada', 'empresas', true,
   '🎉 Empresa activada
{{empresa}} — el owner {{owner}} completó el onboarding', 6),
  ('empresa_suspendida', 'empresas', true,
   '⏸️ Empresa suspendida
{{empresa}}
Motivo: {{motivo}}', 7),
  ('empresa_reactivada', 'empresas', true,
   '▶️ Empresa reactivada
{{empresa}}', 8),
  ('empresa_eliminada', 'empresas', true,
   '🗑️ Empresa eliminada
{{empresa}}', 9),
  ('factura_creada', 'facturacion', true,
   '🧾 Factura registrada
{{empresa}} · {{periodo}}
{{monto}} {{moneda}}', 10),
  ('factura_pagada', 'facturacion', true,
   '💰 Factura pagada
{{empresa}} · {{periodo}}
{{monto}} {{moneda}}', 11),
  ('factura_vencida', 'facturacion', true,
   '⚠️ Factura pendiente
{{empresa}} · periodo {{periodo}}
{{monto}} {{moneda}}', 12),
  ('suscripcion_actualizada', 'facturacion', true,
   '📦 Suscripción actualizada
{{empresa}}
Plan: {{plan}} · Estado: {{estado}}', 13),
  ('admin_agregado', 'administracion', true,
   '🛡️ Nuevo admin de plataforma
{{email}}', 14),
  ('admin_quitado', 'administracion', true,
   '🛡️ Admin de plataforma removido
{{email}}', 15),
  ('error_nuevo', 'salud', true,
   '🚨 Error [{{origen}}]
{{mensaje}}
{{ruta}}
Organización: {{empresa}}
Veces: {{veces}}', 16),
  ('uso_limite_plan', 'salud', true,
   '📊 Límite de plan alcanzado
{{empresa}}: {{miembros}}/{{limite}} miembros (plan {{plan}})', 17),
  ('resumen_diario', 'resumen', true,
   '📅 Resumen diario
Solicitudes pendientes: {{solicitudes_pendientes}}
Empresas activas: {{empresas_activas}} · suspendidas: {{empresas_suspendidas}}
Nuevas (30d): {{empresas_nuevas_30d}}
Errores abiertos: {{errores_abiertos}}
Facturas pendientes: {{facturas_pendientes}}
MRR estimado: {{mrr}}', 18),
  ('empresa_sin_owner', 'resumen', true,
   '⏳ Empresa sin owner
{{empresa}} sigue sin reclamar (creada {{creada}})', 19),
  ('owner_inactivo', 'resumen', true,
   '💤 Owner inactivo
{{empresa}} — {{owner}} sin actividad desde {{ultima_actividad}}', 20)
ON CONFLICT (evento) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_telegram_envios (
  id BIGSERIAL PRIMARY KEY,
  evento TEXT NOT NULL,
  chat TEXT,
  ok BOOLEAN NOT NULL,
  status_code INT,
  error TEXT,
  texto TEXT,
  referencia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_notifications (
  id BIGSERIAL PRIMARY KEY,
  evento TEXT NOT NULL,
  titulo TEXT NOT NULL,
  cuerpo TEXT,
  entidad_tipo TEXT,
  entidad_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_notification_reads (
  admin_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  notification_id BIGINT NOT NULL REFERENCES platform_notifications ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, notification_id)
);

ALTER TABLE platform_telegram_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_telegram_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_telegram_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_notification_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE platform_telegram_config FROM anon, authenticated;
REVOKE ALL ON TABLE platform_telegram_eventos FROM anon, authenticated;
REVOKE ALL ON TABLE platform_telegram_envios FROM anon, authenticated;
REVOKE ALL ON TABLE platform_notifications FROM anon, authenticated;
REVOKE ALL ON TABLE platform_notification_reads FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS platform_telegram_envios_created_idx
  ON platform_telegram_envios (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_telegram_envios_evento_idx
  ON platform_telegram_envios (evento, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_telegram_envios_referencia_idx
  ON platform_telegram_envios (referencia, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_notifications_created_idx
  ON platform_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_notification_reads_admin_idx
  ON platform_notification_reads (admin_id);
