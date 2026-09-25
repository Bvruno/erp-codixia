-- ============================================================
-- PARTE 79: Zona horaria por defecto de la plataforma → Perú
-- Los defaults de silencio y resumen diario pasan a America/Lima.
-- La fila existente se actualiza SOLO si seguía con el default
-- anterior (America/Mexico_City), para no pisar configuración.
-- ============================================================

ALTER TABLE platform_telegram_config
  ALTER COLUMN digest_timezone SET DEFAULT 'America/Lima',
  ALTER COLUMN quiet_hours SET DEFAULT
    '{"activo": false, "desde": "22:00", "hasta": "08:00", "timezone": "America/Lima"}';

UPDATE platform_telegram_config
   SET digest_timezone = 'America/Lima'
 WHERE id = 1 AND digest_timezone = 'America/Mexico_City';

UPDATE platform_telegram_config
   SET quiet_hours = jsonb_set(quiet_hours, '{timezone}', '"America/Lima"')
 WHERE id = 1 AND quiet_hours->>'timezone' = 'America/Mexico_City';
