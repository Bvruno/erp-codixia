-- ============================================================
-- PARTE 82: zona horaria de organización por defecto → Perú
-- ============================================================

ALTER TABLE org_settings
  ALTER COLUMN timezone SET DEFAULT 'America/Lima';

UPDATE org_settings
   SET timezone = 'America/Lima'
 WHERE timezone = 'America/Mexico_City';
