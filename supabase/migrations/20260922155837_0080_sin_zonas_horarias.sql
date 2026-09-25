-- ============================================================
-- PARTE 80: sin configuración de zonas horarias (hora de Perú)
-- ============================================================

ALTER TABLE platform_telegram_config
  DROP COLUMN IF EXISTS digest_timezone,
  ALTER COLUMN quiet_hours SET DEFAULT
    '{"activo": false, "desde": "22:00", "hasta": "08:00"}';

UPDATE platform_telegram_config
   SET quiet_hours = quiet_hours - 'timezone'
 WHERE id = 1 AND quiet_hours ? 'timezone';