-- Sincroniza las contraseñas de los roles internos con POSTGRES_PASSWORD.
-- Se ejecuta una sola vez, durante la inicialización del volumen de datos.
-- Necesario porque la red de Docker usa autenticación scram-sha-256.
\set pgpass `echo "$PGPASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
