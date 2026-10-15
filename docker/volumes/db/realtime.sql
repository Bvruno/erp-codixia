\set pguser `echo "$POSTGRES_USER"`

-- Esquema interno del servicio Realtime (compatible con supabase/realtime).
create schema if not exists _realtime;
alter schema _realtime owner to :pguser;
