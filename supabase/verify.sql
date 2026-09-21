-- ============================================================
-- VERIFY — diagnóstico de integridad del esquema
-- Correr en SQL Editor (postgres). Cada bloque devuelve
-- SOLO anomalías; filas vacías = todo en orden.
-- Base: estado canónico (supabase/schema.sql) + delta 0033.
-- ============================================================

-- 1) Helpers faltantes (todos deberían existir)
SELECT 'FALTA helper' AS problema, p.proname
FROM (
  SELECT 'get_my_org_id' AS proname UNION ALL SELECT 'get_my_role'
  UNION ALL SELECT 'get_my_profile_id' UNION ALL SELECT 'is_org_owner'
  UNION ALL SELECT 'has_schedule' UNION ALL SELECT 'is_entity_member'
  UNION ALL SELECT 'entity_org_id' UNION ALL SELECT 'entity_permission'
  UNION ALL SELECT 'task_permission' UNION ALL SELECT 'perm_rank'
  UNION ALL SELECT 'shifts_overlap' UNION ALL SELECT 'get_invitation'
) p
LEFT JOIN pg_proc f ON f.proname = p.proname AND f.pronamespace = 'public'::regnamespace
WHERE f.proname IS NULL;

-- 2) Regresión de seguridad: profiles_update_admin presente
SELECT 'REGRESION 0032' AS problema, policyname, tablename
FROM pg_policies
WHERE policyname = 'profiles_update_admin' AND schemaname = 'public';

-- 3) Trigger de auth: debe ser SECURITY DEFINER
SELECT 'handle_new_user sin SECURITY DEFINER' AS problema
FROM pg_proc
WHERE proname = 'handle_new_user'
  AND pronamespace = 'public'::regnamespace
  AND NOT prosecdef;

-- 4) Exposición: invitations_select_public aún presente
SELECT 'invitations_select_public AUN presente' AS problema
FROM pg_policies
WHERE policyname = 'invitations_select_public' AND schemaname = 'public';

-- 5) Tablas sin RLS habilitada (deberían estar vacío)
SELECT 'tabla sin RLS' AS problema, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('organizations','profiles','shifts','schedules','workspaces',
    'workspace_folders','task_lists','documents','document_pages','mind_maps',
    'tasks','task_notes','task_activity_log','invitations','time_entries',
    'permissions','notifications','telegram_config','org_settings','audit_logs',
    'entity_visibility','error_logs')
  AND NOT rowsecurity;

-- 6) Tablas sin NINGUNA policy (acceso cerrado por defecto)
SELECT 'tabla sin policies' AS problema, t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
  AND t.tablename IN ('organizations','profiles','shifts','schedules','workspaces',
    'workspace_folders','task_lists','documents','document_pages','mind_maps',
    'tasks','task_notes','task_activity_log','invitations','time_entries',
    'permissions','notifications','telegram_config','org_settings','audit_logs',
    'entity_visibility','error_logs')
  AND t.rowsecurity
GROUP BY t.tablename
HAVING count(p.policyname) = 0;

-- 7) Triggers de enforcement esperados
SELECT 'falta trigger' AS problema, nombre
FROM (
  SELECT 'time_entries_require_schedule' AS nombre UNION ALL
  SELECT 'tasks_require_schedule' UNION ALL
  SELECT 'schedules_no_overlap' UNION ALL
  SELECT 'schedules_keep_last' UNION ALL
  SELECT 'profiles_hours_org_controlled' UNION ALL
  SELECT 'on_auth_user_created' UNION ALL
  SELECT 'task_changes_trigger' UNION ALL
  SELECT 'trg_ev_workspace' UNION ALL
  SELECT 'trg_ev_folder' UNION ALL
  SELECT 'trg_ev_list' UNION ALL
  SELECT 'trg_ev_document' UNION ALL
  SELECT 'trg_ev_mindmap' UNION ALL
  SELECT 'tasks_updated_at' UNION ALL
  SELECT 'mind_maps_updated_at'
) t
LEFT JOIN pg_trigger tr ON tr.tgname = t.nombre AND NOT tr.tgisinternal
WHERE tr.tgname IS NULL;

-- 8) Storage: policies del bucket mindmap-images
SELECT 'falta storage policy' AS problema, p.policyname
FROM (
  SELECT 'mindmap_images_public_read' AS policyname UNION ALL
  SELECT 'mindmap_images_authenticated_write' UNION ALL
  SELECT 'mindmap_images_authenticated_update'
) p
LEFT JOIN pg_policies pol
  ON pol.policyname = p.policyname AND pol.schemaname = 'storage'
WHERE pol.policyname IS NULL;

-- 9) Conteo informativo: policies por tabla
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;