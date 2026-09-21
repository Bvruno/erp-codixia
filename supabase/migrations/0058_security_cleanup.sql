-- ============================================================
-- PARTE 58: Seguridad — search_path fijo + revokes anon
-- 1) Las 7 funciones con search_path mutable (lint 0011) ahora
--    fijan search_path = 'public': evita hijack por schemas
--    anteriores en el path del llamador.
-- 2) Revokes a `anon`:
--    - has_schedule(uuid) / is_org_owner(uuid): probe de usuarios
--      (info leak menor); siguen ejecutables por authenticated
--      porque las policies RLS las invocan.
--    - log_error(...): vector de spam/llenado de BD; el único
--      consumidor legítimo (src/lib/errors.ts) usa service role
--      (server-only), así que tampoco la necesita authenticated.
-- ============================================================

ALTER FUNCTION public.perm_rank(text) SET search_path = 'public';
ALTER FUNCTION public.shifts_overlap(time, time, time, time) SET search_path = 'public';
ALTER FUNCTION public.prevent_last_schedule_deletion() SET search_path = 'public';
ALTER FUNCTION public.prevent_overlapping_schedule() SET search_path = 'public';
ALTER FUNCTION public.require_schedule_for_time_entry() SET search_path = 'public';
ALTER FUNCTION public.require_schedule_for_task_assignment() SET search_path = 'public';
ALTER FUNCTION public.enforce_hours_org_control() SET search_path = 'public';

REVOKE EXECUTE ON FUNCTION public.has_schedule(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_owner(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_error(
  text, text, text, text, text, text, text, text,
  uuid, uuid, text, text, jsonb, text
) FROM anon, public, authenticated;