-- ============================================================
-- PARTE 33: FIXES DE ESQUEMA (delta para BD existente)
-- Cura, de forma idempotente, defectos heredados de
-- migraciones históricas (0007, 0008, 0032, timeline.sql).
--
-- NO necesario en BD nuevas: supabase/schema.sql ya incluye
-- todo esto. Verificar antes/después con supabase/verify.sql.
-- ============================================================

SET check_function_bodies = off;

-- ------------------------------------------------------------
-- 1) Helpers con search_path='' y referencias calificadas
--    (0008 los definió sin calificar: 42P01 si 0015 no aplicó)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND blocked = false;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND blocked = false;
$$;

CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.profiles WHERE id = auth.uid() AND blocked = false;
$$;

-- ------------------------------------------------------------
-- 2) entity_org_id en su versión final (con mindmap, 0031).
--    Idempotente: si la BD ya tiene una versión anterior
--    (0015/0016/0019/0023) la completa.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION entity_org_id(entity_type TEXT, entity_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE entity_type
    WHEN 'workspace' THEN (SELECT organization_id FROM public.workspaces WHERE id = entity_id)
    WHEN 'folder' THEN (SELECT w.organization_id FROM public.workspace_folders f JOIN public.workspaces w ON w.id = f.workspace_id WHERE f.id = entity_id)
    WHEN 'list' THEN (SELECT organization_id FROM public.task_lists WHERE id = entity_id)
    WHEN 'document' THEN (SELECT organization_id FROM public.documents WHERE id = entity_id)
    WHEN 'mindmap' THEN (SELECT organization_id FROM public.mind_maps WHERE id = entity_id)
  END;
$$;

-- ------------------------------------------------------------
-- 3) Triggers de auth con SECURITY DEFINER
--    (0007 los creó sin él: registrarse falla por RLS en BD
--    frescas; en prod dependía de fix_triggers.sql suelto)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), 'admin');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 4) Timeline de tareas (integrado; timeline.sql suelto usaba
--    my_org_id(), que no existe en BD creada por migraciones)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_task_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, auth'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, new_value)
    VALUES (NEW.id, NEW.created_by, 'created', NEW.status);
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'assigned', OLD.assigned_to::TEXT, NEW.assigned_to::TEXT);
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'priority_changed', OLD.priority, NEW.priority);
  END IF;

  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'due_date_changed', OLD.due_date::TEXT, NEW.due_date::TEXT);
  END IF;

  IF OLD.estimated_hours IS DISTINCT FROM NEW.estimated_hours THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'hours_changed', OLD.estimated_hours::TEXT, NEW.estimated_hours::TEXT);
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.task_activity_log (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'title_changed', OLD.title, NEW.title);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_changes_trigger ON tasks;
CREATE TRIGGER task_changes_trigger
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_task_changes();

-- Policies del timeline con el helper correcto
DROP POLICY IF EXISTS "activity_select_org" ON task_activity_log;
CREATE POLICY "activity_select_org" ON task_activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_activity_log.task_id AND t.organization_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "activity_insert_org" ON task_activity_log;
CREATE POLICY "activity_insert_org" ON task_activity_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_activity_log.task_id AND t.organization_id = get_my_org_id())
  );

-- ------------------------------------------------------------
-- 5) Regresión de 0032: profiles_update_admin
--    (0032 la reintrodujo contra el hardening de 0011:
--    cualquier admin podía editar a otros admins/owner)
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;

-- ------------------------------------------------------------
-- 6) Hardening de 0029 (idempotente por si no llegó a aplicar)
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "invitations_select_public" ON invitations;

REVOKE EXECUTE ON FUNCTION debug_policies() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_rls_status() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_columns() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION get_invitation(p_token TEXT)
RETURNS TABLE (organization_id UUID, role TEXT, status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.organization_id, i.role, i.status, i.expires_at
  FROM invitations i
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION get_invitation(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_invitation(TEXT) FROM public;