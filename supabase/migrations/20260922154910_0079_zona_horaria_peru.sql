-- ============================================================
-- PARTE 79: Zona horaria por defecto de la plataforma → Perú
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
