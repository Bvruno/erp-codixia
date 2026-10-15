\set pguser `echo "$POSTGRES_USER"`

-- Base de datos interna de Supabase (analytics/logs). Requerida por algunas
-- herramientas de Studio; en este stack se crea vacía.
CREATE DATABASE _supabase WITH OWNER :pguser;
