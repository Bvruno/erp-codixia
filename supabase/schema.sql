-- ============================================================
-- SCHEMA CANÓNICO — ERP Codixia (estado final consolidado)
-- Fuente: migraciones 0001–0032 (aplicado + corregido).
-- Idempotente: se puede correr varias veces sin error.
--
-- USO:
--   * BD NUEVA  → correr este archivo completo (SQL Editor).
--   * BD VIVA   → NO correr aquí; usar migración delta (0033+).
--
-- Correcciones vs migraciones históricas:
--   * Helpers SECURITY DEFINER con search_path='' y referencias
--     calificadas public.* (0008 tenía tablas sin calificar).
--   * Triggers de auth con SECURITY DEFINER (0007 no lo tenía).
--   * Sin policy regresiva profiles_update_admin (0032 la
--     reintrodujo contra el hardening de 0011).
--   * timeline (task_activity_log) integrado con get_my_org_id.
-- ============================================================

-- PG16+ valida funciones al crearlas con search_path='': las
-- referencias cruzadas se resuelven calificadas; se desactiva
-- la validación de respaldo (patrón 0023/0031/0032).
SET check_function_bodies = off;

-- ============================================================
-- 1. EXTENSIÓN
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. TABLAS (estado final de columnas)
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Nullable a propósito: la plataforma crea la empresa y el primer
  -- admin la reclama con claim_organization() durante el onboarding.
  owner_id UUID REFERENCES auth.users,
  status TEXT NOT NULL DEFAULT 'activa'
    CHECK (status IN ('activa','suspendida')),
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  plan_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'collaborator')) DEFAULT 'collaborator',
  full_name TEXT NOT NULL,
  telegram_chat_id TEXT,
  blocked BOOLEAN DEFAULT false NOT NULL,
  daily_hours INT DEFAULT 8 NOT NULL,
  weekly_hours INT DEFAULT 40 NOT NULL,
  phone TEXT,
  position TEXT,
  bio TEXT,
  language TEXT NOT NULL DEFAULT 'es',
  birth_date DATE,
  address TEXT,
  alternate_phones TEXT[] DEFAULT '{}' NOT NULL,
  emergency_contacts JSONB DEFAULT '[]' NOT NULL,
  preferences JSONB DEFAULT '{}' NOT NULL,
  avatar_url TEXT,
  -- 'grants_only': invitado por link scoped; ve solo sus grants
  access_mode TEXT NOT NULL DEFAULT 'org'
    CHECK (access_mode IN ('org', 'grants_only')),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  crosses_midnight BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  shift_id UUID REFERENCES shifts(id) ON DELETE RESTRICT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INT DEFAULT 0 NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  default_statuses JSONB,
  default_priorities JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  parent_folder_id UUID REFERENCES workspace_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT DEFAULT 0 NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT DEFAULT 0 NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  statuses JSONB,
  priorities JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_main BOOLEAN NOT NULL DEFAULT false,
  position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS mind_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  content JSONB NOT NULL DEFAULT '{"version":1,"nodes":[],"edges":[],"viewport":null}',
  position INT DEFAULT 0 NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  list_id UUID REFERENCES task_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  due_date DATE,
  due_time TIME,
  start_date DATE,
  estimated_hours NUMERIC(5,2),
  position INT DEFAULT 0 NOT NULL,
  status_position INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS task_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created','status_changed','assigned','priority_changed','due_date_changed','hours_changed','title_changed')),
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  -- SHA-256 hex del token (el token crudo solo viaja en el link)
  token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','expired','cancelled')) DEFAULT 'pending',
  role TEXT NOT NULL DEFAULT 'collaborator'
    CHECK (role IN ('admin', 'collaborator')),
  entity_type TEXT
    CHECK (entity_type IN ('workspace','folder','list','document','mindmap','todo','formulario')),
  entity_id UUID,
  permission TEXT
    CHECK (permission IN ('read','write','manage')),
  inherit BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('worked','permission','overtime','makeup')) DEFAULT 'worked',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  date DATE NOT NULL,
  estimated_hours NUMERIC(4,2) NOT NULL,
  makeup_date DATE,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('task_assigned','task_status','note_added','invitation','permission','reminder')),
  title TEXT NOT NULL,
  body TEXT,
  reference_type TEXT,
  reference_id UUID,
  read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE UNIQUE NOT NULL,
  bot_token TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS org_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations ON DELETE CASCADE,
  daily_hours INT DEFAULT 8 NOT NULL,
  weekly_hours INT DEFAULT 40 NOT NULL,
  timezone TEXT DEFAULT 'America/Mexico_City' NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Grants por entidad (read/write/manage + herencia).
-- Documentos y mapas mentales comparten esta tabla vía CHECK.
CREATE TABLE IF NOT EXISTS entity_visibility (
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('workspace','folder','list','document','mindmap','todo','formulario')),
  entity_id UUID NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  permission TEXT NOT NULL DEFAULT 'read'
    CHECK (permission IN ('read','write','manage')),
  inherit BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_type, entity_id, profile_id)
);

-- ---- formularios (0063) ----
-- Entidad del árbol con canal externo (clientes sin cuenta): token
-- público, listas blancas/negras por DNI/correo y links personales.
CREATE TABLE IF NOT EXISTS formularios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  folder_id UUID REFERENCES workspace_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private','restricted')),
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','publicado','cerrado')),
  position INT DEFAULT 0 NOT NULL,
  esquema JSONB NOT NULL DEFAULT '{"version":1,"secciones":[]}',
  ajustes JSONB NOT NULL DEFAULT '{"modo_acceso":"publico","lista_modo":"blanca","identificadores":["dni","email"],"una_respuesta_por_persona":false,"requiere_consentimiento":false,"texto_privacidad":"","mensaje_confirmacion":"Gracias por tu respuesta."}',
  token_publico_hash TEXT UNIQUE,
  codigo_publico TEXT
    CHECK (codigo_publico IS NULL OR codigo_publico ~ '^[a-z0-9]{6}$'),
  publicado_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS formulario_listas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id UUID REFERENCES formularios(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('dni','email')),
  valor TEXT NOT NULL,
  etiqueta TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (formulario_id, tipo, valor)
);

CREATE TABLE IF NOT EXISTS formulario_invitados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id UUID REFERENCES formularios(id) ON DELETE CASCADE NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('dni','email')),
  valor TEXT,
  token_hash TEXT UNIQUE NOT NULL,
  codigo TEXT
    CHECK (codigo IS NULL OR codigo ~ '^[a-z0-9]{6}$'),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','respondido','revocado')),
  respondido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS formulario_respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulario_id UUID REFERENCES formularios(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  invitado_id UUID REFERENCES formulario_invitados(id) ON DELETE SET NULL,
  identificador_hash TEXT,
  consentimiento BOOLEAN NOT NULL DEFAULT false,
  respuestas JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 3. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_position ON tasks(status, status_position);
CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_task_notes_task ON task_notes(task_id);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_inv_scope ON invitations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(organization_id, position);
CREATE INDEX IF NOT EXISTS idx_folders_workspace ON workspace_folders(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON workspace_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_task_lists_folder ON task_lists(folder_id, position);
CREATE INDEX IF NOT EXISTS idx_task_lists_ws ON task_lists(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id, position);
CREATE INDEX IF NOT EXISTS idx_documents_ws ON documents(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_pages_document ON document_pages(document_id, position);
CREATE INDEX IF NOT EXISTS idx_mind_maps_org ON mind_maps(organization_id, position);
CREATE INDEX IF NOT EXISTS idx_mind_maps_workspace ON mind_maps(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_mind_maps_folder ON mind_maps(folder_id, position);
CREATE INDEX IF NOT EXISTS idx_entity_visibility_entity ON entity_visibility(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_visibility_profile ON entity_visibility(profile_id);
CREATE INDEX IF NOT EXISTS idx_ev_permission ON entity_visibility(profile_id, permission);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_task ON task_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON task_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_schedules_org ON schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_formularios_org ON formularios(organization_id, position);
CREATE INDEX IF NOT EXISTS idx_formularios_ws ON formularios(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_formularios_folder ON formularios(folder_id, position);
CREATE INDEX IF NOT EXISTS idx_formulario_respuestas_form ON formulario_respuestas(formulario_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_formulario_respuesta_invitado
  ON formulario_respuestas(formulario_id, invitado_id)
  WHERE invitado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_formulario_listas_form ON formulario_listas(formulario_id);
CREATE INDEX IF NOT EXISTS idx_formulario_invitados_form ON formulario_invitados(formulario_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_formularios_nombre
  ON formularios (COALESCE(folder_id, workspace_id), lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_formularios_codigo
  ON formularios (codigo_publico)
  WHERE codigo_publico IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_formulario_invitados_codigo
  ON formulario_invitados (codigo)
  WHERE codigo IS NOT NULL;

-- ============================================================
-- 4. HELPERS (SECURITY DEFINER, search_path='', calificados)
-- ============================================================

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

CREATE OR REPLACE FUNCTION is_org_owner(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.profiles p ON p.organization_id = o.id
    WHERE o.owner_id = user_uuid AND p.id = user_uuid
  );
$$;

CREATE OR REPLACE FUNCTION has_schedule(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.schedules WHERE user_id = user_uuid);
$$;

CREATE OR REPLACE FUNCTION is_entity_member(entity_type TEXT, entity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_visibility
    WHERE entity_visibility.entity_type = is_entity_member.entity_type
      AND entity_visibility.entity_id = is_entity_member.entity_id
      AND entity_visibility.profile_id = auth.uid()
  );
$$;

-- Org de una entidad, caminando ancestros según tipo
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
    WHEN 'todo' THEN (SELECT organization_id FROM public.todos WHERE id = entity_id)
    WHEN 'formulario' THEN (SELECT organization_id FROM public.formularios WHERE id = entity_id)
  END;
$$;

CREATE OR REPLACE FUNCTION perm_rank(p TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p WHEN 'read' THEN 1 WHEN 'write' THEN 2 WHEN 'manage' THEN 3 ELSE 0 END;
$$;

-- Nivel efectivo de permiso del usuario actual sobre una entidad,
-- caminando ancestros (carpeta -> parent_folder... -> workspace).
-- El grant propio cuenta siempre (aislado); los de ancestros solo
-- si inherit=true Y la entidad es public, con nivel capado a write
-- (el contenido privado/restricted siempre exige grant directo y
-- eliminar requiere manage directo o ser el creador).
CREATE OR REPLACE FUNCTION entity_permission(e_type TEXT, e_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE scope(depth, t, id) AS (
    SELECT 0, e_type::text, e_id::uuid
    UNION ALL
    SELECT s.depth + 1,
      CASE
        WHEN s.t = 'folder' THEN 'folder'
        WHEN s.t = 'list' THEN (CASE WHEN (SELECT folder_id FROM public.task_lists WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'document' THEN (CASE WHEN (SELECT folder_id FROM public.documents WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'mindmap' THEN (CASE WHEN (SELECT folder_id FROM public.mind_maps WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'todo' THEN (CASE WHEN (SELECT folder_id FROM public.todos WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'formulario' THEN (CASE WHEN (SELECT folder_id FROM public.formularios WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
        WHEN s.t = 'mindmap' THEN COALESCE((SELECT folder_id FROM public.mind_maps WHERE id = s.id), (SELECT workspace_id FROM public.mind_maps WHERE id = s.id))
        WHEN s.t = 'todo' THEN COALESCE((SELECT folder_id FROM public.todos WHERE id = s.id), (SELECT workspace_id FROM public.todos WHERE id = s.id))
        WHEN s.t = 'formulario' THEN COALESCE((SELECT folder_id FROM public.formularios WHERE id = s.id), (SELECT workspace_id FROM public.formularios WHERE id = s.id))
        ELSE NULL
      END
    FROM scope s
    WHERE s.depth < 12 AND s.id IS NOT NULL
  ),
  target_public AS (
    SELECT (CASE e_type
      WHEN 'workspace' THEN (SELECT visibility FROM public.workspaces WHERE id = e_id)
      WHEN 'folder' THEN (SELECT visibility FROM public.workspace_folders WHERE id = e_id)
      WHEN 'list' THEN (SELECT visibility FROM public.task_lists WHERE id = e_id)
      WHEN 'document' THEN (SELECT visibility FROM public.documents WHERE id = e_id)
      WHEN 'mindmap' THEN (SELECT visibility FROM public.mind_maps WHERE id = e_id)
      WHEN 'todo' THEN (SELECT visibility FROM public.todos WHERE id = e_id)
      WHEN 'formulario' THEN (SELECT visibility FROM public.formularios WHERE id = e_id)
    END = 'public') AS is_public
  ),
  grants AS (
    SELECT ev.permission
    FROM public.entity_visibility ev
    WHERE ev.entity_type = e_type AND ev.entity_id = e_id
      AND ev.profile_id = auth.uid()
      AND public.entity_org_id(e_type, e_id) = public.get_my_org_id()
    UNION ALL
    SELECT CASE WHEN public.perm_rank(ev.permission) >= 2 THEN 'write' ELSE ev.permission END
    FROM scope s
    CROSS JOIN target_public tp
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid() AND ev.inherit = true
    WHERE s.depth > 0 AND tp.is_public
      AND public.entity_org_id(s.t, s.id) = public.get_my_org_id()
  )
  SELECT CASE max(public.perm_rank(g.permission))
    WHEN 3 THEN 'manage'
    WHEN 2 THEN 'write'
    WHEN 1 THEN 'read'
    ELSE NULL
  END
  FROM grants g;
$$;

-- Igual que entity_permission() pero para varias entidades en una sola
-- llamada (evita N+1 en listados); usada por GET /calendario/datos.
CREATE OR REPLACE FUNCTION entity_permissions_bulk(e_type TEXT, e_ids UUID[])
RETURNS TABLE(entity_id UUID, permission TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE scope(entity_id, depth, t, id) AS (
    SELECT e.eid, 0, e_type::text, e.eid
    FROM unnest(e_ids) AS e(eid)
    UNION ALL
    SELECT s.entity_id, s.depth + 1,
      CASE
        WHEN s.t = 'folder' THEN 'folder'
        WHEN s.t = 'list' THEN (CASE WHEN (SELECT folder_id FROM public.task_lists WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'document' THEN (CASE WHEN (SELECT folder_id FROM public.documents WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'mindmap' THEN (CASE WHEN (SELECT folder_id FROM public.mind_maps WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'todo' THEN (CASE WHEN (SELECT folder_id FROM public.todos WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        WHEN s.t = 'formulario' THEN (CASE WHEN (SELECT folder_id FROM public.formularios WHERE id = s.id) IS NOT NULL THEN 'folder' ELSE 'workspace' END)
        ELSE 'workspace'
      END,
      CASE
        WHEN s.t = 'folder' THEN COALESCE((SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id), (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id))
        WHEN s.t = 'list' THEN COALESCE((SELECT folder_id FROM public.task_lists WHERE id = s.id), (SELECT workspace_id FROM public.task_lists WHERE id = s.id))
        WHEN s.t = 'document' THEN COALESCE((SELECT folder_id FROM public.documents WHERE id = s.id), (SELECT workspace_id FROM public.documents WHERE id = s.id))
        WHEN s.t = 'mindmap' THEN COALESCE((SELECT folder_id FROM public.mind_maps WHERE id = s.id), (SELECT workspace_id FROM public.mind_maps WHERE id = s.id))
        WHEN s.t = 'todo' THEN COALESCE((SELECT folder_id FROM public.todos WHERE id = s.id), (SELECT workspace_id FROM public.todos WHERE id = s.id))
        WHEN s.t = 'formulario' THEN COALESCE((SELECT folder_id FROM public.formularios WHERE id = s.id), (SELECT workspace_id FROM public.formularios WHERE id = s.id))
        ELSE NULL
      END
    FROM scope s
    WHERE s.depth < 12 AND s.id IS NOT NULL
  ),
  target_public AS (
    SELECT s.entity_id,
      (CASE s.t
        WHEN 'workspace' THEN (SELECT visibility FROM public.workspaces WHERE id = s.id)
        WHEN 'folder' THEN (SELECT visibility FROM public.workspace_folders WHERE id = s.id)
        WHEN 'list' THEN (SELECT visibility FROM public.task_lists WHERE id = s.id)
        WHEN 'document' THEN (SELECT visibility FROM public.documents WHERE id = s.id)
        WHEN 'mindmap' THEN (SELECT visibility FROM public.mind_maps WHERE id = s.id)
        WHEN 'todo' THEN (SELECT visibility FROM public.todos WHERE id = s.id)
        WHEN 'formulario' THEN (SELECT visibility FROM public.formularios WHERE id = s.id)
      END = 'public') AS is_public
    FROM scope s
    WHERE s.depth = 0
  ),
  grants AS (
    SELECT s.entity_id, ev.permission
    FROM scope s
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid()
    WHERE s.depth = 0
      AND public.entity_org_id(s.t, s.id) = public.get_my_org_id()
    UNION ALL
    SELECT s.entity_id,
      CASE WHEN public.perm_rank(ev.permission) >= 2 THEN 'write' ELSE ev.permission END
    FROM scope s
    JOIN target_public tp ON tp.entity_id = s.entity_id
    JOIN public.entity_visibility ev
      ON ev.entity_type = s.t AND ev.entity_id = s.id
      AND ev.profile_id = auth.uid() AND ev.inherit = true
    WHERE s.depth > 0 AND tp.is_public
      AND public.entity_org_id(s.t, s.id) = public.get_my_org_id()
  )
  SELECT e.eid AS entity_id,
    CASE max(public.perm_rank(g.permission))
      WHEN 3 THEN 'manage'
      WHEN 2 THEN 'write'
      WHEN 1 THEN 'read'
      ELSE NULL
    END AS permission
  FROM unnest(e_ids) AS e(eid)
  LEFT JOIN grants g ON g.entity_id = e.eid
  GROUP BY e.eid;
$$;

-- Nivel de escritura de los ancestros del contenedor (carpeta o
-- workspace): permite crear contenido dentro con write heredado.
CREATE OR REPLACE FUNCTION container_write_level(p_folder_id UUID, p_ws_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE scope(depth, t, id) AS (
    SELECT 0,
      CASE WHEN p_folder_id IS NOT NULL THEN 'folder' ELSE 'workspace' END,
      COALESCE(p_folder_id, p_ws_id)::uuid
    UNION ALL
    SELECT s.depth + 1,
      'folder',
      COALESCE(
        (SELECT parent_folder_id FROM public.workspace_folders WHERE id = s.id),
        (SELECT workspace_id FROM public.workspace_folders WHERE id = s.id)
      )
    FROM scope s
    WHERE s.depth < 12 AND s.id IS NOT NULL AND s.t = 'folder'
  )
  SELECT max(public.perm_rank(ev.permission))
  FROM scope s
  JOIN public.entity_visibility ev
    ON ev.entity_type = s.t AND ev.entity_id = s.id
    AND ev.profile_id = auth.uid() AND ev.inherit = true
  WHERE public.entity_org_id(s.t, s.id) = public.get_my_org_id();
$$;

-- El autor del contenido recibe manage automático (leer/editar/eliminar
-- lo que creó). Para tareas: created_by con fallback al autor.
CREATE OR REPLACE FUNCTION grant_creator_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.entity_visibility (entity_type, entity_id, profile_id, permission, inherit)
  VALUES (TG_ARGV[0], NEW.id, auth.uid(), 'manage', false)
  ON CONFLICT (entity_type, entity_id, profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_task_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Nivel sobre una tarea vía su lista (cadena de ancestros)
CREATE OR REPLACE FUNCTION task_permission(task_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.entity_permission('list', t.list_id)
  FROM public.tasks t
  WHERE t.id = task_id AND t.list_id IS NOT NULL;
$$;

-- Movimiento de tarjeta en el pipeline: status + orden en una sola
-- transacción. SECURITY INVOKER: aplican las policies RLS del usuario.
CREATE OR REPLACE FUNCTION reordenar_pipeline(items JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  item RECORD;
BEGIN
  IF items IS NULL OR jsonb_typeof(items) <> 'array' THEN
    RAISE EXCEPTION 'items debe ser un array JSON';
  END IF;

  FOR item IN
    SELECT *
    FROM jsonb_to_recordset(items)
      AS x(id UUID, status TEXT, status_position INT)
  LOOP
    IF item.id IS NULL OR item.status IS NULL OR item.status_position IS NULL THEN
      RAISE EXCEPTION 'item inválido: %', item;
    END IF;

    UPDATE public.tasks
    SET status = item.status,
        status_position = GREATEST(item.status_position, 0)
    WHERE id = item.id;
  END LOOP;
END;
$$;

-- Solapamiento entre dos turnos (mismos segmentos que shift-utils.ts,
-- soporta turnos nocturnos que cruzan medianoche).
CREATE OR REPLACE FUNCTION shifts_overlap(a_start TIME, a_end TIME, b_start TIME, b_end TIME)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  a_s INT; a_e INT; b_s INT; b_e INT;
  a_segs INT[][]; b_segs INT[][];
  i INT; j INT;
BEGIN
  a_s := EXTRACT(EPOCH FROM a_start)::INT / 60;
  a_e := EXTRACT(EPOCH FROM a_end)::INT / 60;
  b_s := EXTRACT(EPOCH FROM b_start)::INT / 60;
  b_e := EXTRACT(EPOCH FROM b_end)::INT / 60;

  IF a_s < a_e THEN
    a_segs := ARRAY[ARRAY[a_s, a_e]];
  ELSE
    a_segs := ARRAY[ARRAY[a_s, 1440]];
    IF a_e > 0 THEN a_segs := a_segs || ARRAY[ARRAY[0, a_e]]; END IF;
  END IF;

  IF b_s < b_e THEN
    b_segs := ARRAY[ARRAY[b_s, b_e]];
  ELSE
    b_segs := ARRAY[ARRAY[b_s, 1440]];
    IF b_e > 0 THEN b_segs := b_segs || ARRAY[ARRAY[0, b_e]]; END IF;
  END IF;

  FOR i IN 1..array_length(a_segs, 1) LOOP
    FOR j IN 1..array_length(b_segs, 1) LOOP
      IF a_segs[i][1] < b_segs[j][2] AND b_segs[j][1] < a_segs[i][2] THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

-- Validación de invitación por token (reemplaza el SELECT público).
-- invitations.token almacena el hash SHA-256 (hex) del token; el
-- servidor (login/signup) calcula el hash antes de llamar.
CREATE OR REPLACE FUNCTION get_invitation(p_token TEXT)
RETURNS TABLE (organization_id UUID, role TEXT, status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.organization_id, i.role, i.status, i.expires_at
  FROM public.invitations i
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now();
$$;

-- Modo de acceso del usuario: 'org' (acceso por visibilidad) o
-- 'grants_only' (invitado scoped: solo ve sus grants).
CREATE OR REPLACE FUNCTION get_my_access_mode()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(p.access_mode, 'org')
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.blocked = false;
$$;

-- Navegación fantasma: una carpeta es navegable si tiene grant
-- propio, una entidad hija con grant, o una subcarpeta navegable.
CREATE OR REPLACE FUNCTION folder_navigation_visible(p_folder_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.folder_id = p_folder_id
      AND public.entity_permission('document', d.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.mind_maps m
    WHERE m.folder_id = p_folder_id
      AND public.entity_permission('mindmap', m.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.todos t
    WHERE t.folder_id = p_folder_id
      AND public.entity_permission('todo', t.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.formularios fo
    WHERE fo.folder_id = p_folder_id
      AND public.entity_permission('formulario', fo.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.task_lists l
    WHERE l.folder_id = p_folder_id
      AND public.entity_permission('list', l.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.workspace_folders f
    WHERE f.parent_folder_id = p_folder_id
      AND public.folder_navigation_visible(f.id)
  );
END;
$$;

-- Workspace navegable si tiene entidad root con grant o carpeta
-- raíz navegable.
CREATE OR REPLACE FUNCTION workspace_navigation_visible(p_ws_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.workspace_id = p_ws_id AND d.folder_id IS NULL
      AND public.entity_permission('document', d.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.mind_maps m
    WHERE m.workspace_id = p_ws_id AND m.folder_id IS NULL
      AND public.entity_permission('mindmap', m.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.todos t
    WHERE t.workspace_id = p_ws_id AND t.folder_id IS NULL
      AND public.entity_permission('todo', t.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.formularios fo
    WHERE fo.workspace_id = p_ws_id AND fo.folder_id IS NULL
      AND public.entity_permission('formulario', fo.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.task_lists l
    WHERE l.workspace_id = p_ws_id AND l.folder_id IS NULL
      AND public.entity_permission('list', l.id) IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.workspace_folders f
    WHERE f.workspace_id = p_ws_id AND f.parent_folder_id IS NULL
      AND public.folder_navigation_visible(f.id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_access_mode() TO authenticated;
GRANT EXECUTE ON FUNCTION folder_navigation_visible(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION workspace_navigation_visible(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reordenar_pipeline(JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION get_my_access_mode() FROM public, anon;
REVOKE EXECUTE ON FUNCTION folder_navigation_visible(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION workspace_navigation_visible(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION reordenar_pipeline(JSONB) FROM public, anon;

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mind_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_visibility ENABLE ROW LEVEL SECURITY;

-- ---- organizations ----
DROP POLICY IF EXISTS "org_select_own" ON organizations;
CREATE POLICY "org_select_own" ON organizations
  FOR SELECT USING (id = get_my_org_id());

DROP POLICY IF EXISTS "org_update_owner" ON organizations;
CREATE POLICY "org_update_owner" ON organizations
  FOR UPDATE USING (
    auth.uid() = owner_id
    OR (id = get_my_org_id() AND get_my_role() = 'admin')
  );

-- ---- profiles ----
DROP POLICY IF EXISTS "profiles_select_own_org" ON profiles;
CREATE POLICY "profiles_select_own_org" ON profiles
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Owner: control total sobre miembros (excepto su propio perfil)
DROP POLICY IF EXISTS "profiles_update_owner" ON profiles;
CREATE POLICY "profiles_update_owner" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = profiles.organization_id
      AND o.owner_id = auth.uid()
    )
    AND auth.uid() <> profiles.id
  );

-- Admin no-owner: solo filas de colaboradores, nunca self/owner/admins.
-- WITH CHECK: un admin no puede cambiar el rol de un colaborador
-- (promover/demotar a admin es exclusivo del owner).
DROP POLICY IF EXISTS "profiles_update_admin_collaborators" ON profiles;
CREATE POLICY "profiles_update_admin_collaborators" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.organization_id = profiles.organization_id
      AND p.role = 'admin' AND p.blocked = false
    )
    AND auth.uid() <> profiles.id
    AND profiles.role = 'collaborator'
  )
  WITH CHECK (profiles.role = 'collaborator');

-- Self colaborador: nunca promoverse a admin
DROP POLICY IF EXISTS "profiles_update_own_collaborator" ON profiles;
CREATE POLICY "profiles_update_own_collaborator" ON profiles
  FOR UPDATE USING (
    auth.uid() = profiles.id
    AND profiles.role = 'collaborator'
    AND profiles.blocked = false
  )
  WITH CHECK (profiles.role = 'collaborator');

-- Self admin: puede editar su perfil pero nunca demotarse
DROP POLICY IF EXISTS "profiles_update_own_admin" ON profiles;
CREATE POLICY "profiles_update_own_admin" ON profiles
  FOR UPDATE USING (
    auth.uid() = profiles.id
    AND profiles.role = 'admin'
    AND profiles.blocked = false
  )
  WITH CHECK (profiles.role = 'admin');

-- ---- shifts ----
DROP POLICY IF EXISTS "shifts_select_own_org" ON shifts;
CREATE POLICY "shifts_select_own_org" ON shifts
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "shifts_all_admin" ON shifts;
CREATE POLICY "shifts_all_admin" ON shifts
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- ---- schedules ----
DROP POLICY IF EXISTS "schedules_select_org" ON schedules;
CREATE POLICY "schedules_select_org" ON schedules
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "schedules_all_admin" ON schedules;
CREATE POLICY "schedules_all_admin" ON schedules
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "schedules_all_org_owner" ON schedules;
CREATE POLICY "schedules_all_org_owner" ON schedules
  FOR ALL USING (is_org_owner(auth.uid()) AND organization_id = get_my_org_id());

-- ---- workspaces ----
DROP POLICY IF EXISTS "workspaces_select_org" ON workspaces;
CREATE POLICY "workspaces_select_org" ON workspaces
  FOR SELECT USING (
    get_my_role() = 'admin'
    OR public.entity_permission('workspace', id) IS NOT NULL
    OR (get_my_access_mode() = 'org' AND visibility = 'public')
    OR (get_my_access_mode() = 'grants_only' AND public.workspace_navigation_visible(id))
  );

DROP POLICY IF EXISTS "workspaces_all_admin" ON workspaces;
CREATE POLICY "workspaces_all_admin" ON workspaces
  FOR ALL USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (public.perm_rank(public.entity_permission('workspace', id)) >= 3)
  );

-- ---- workspace_folders ----
DROP POLICY IF EXISTS "folders_select_org" ON workspace_folders;
CREATE POLICY "folders_select_org" ON workspace_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_folders.workspace_id
      AND w.organization_id = get_my_org_id()
    )
    AND (
      get_my_role() = 'admin'
      OR public.entity_permission('folder', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
      OR (get_my_access_mode() = 'grants_only' AND public.folder_navigation_visible(id))
    )
  );

DROP POLICY IF EXISTS "folders_all_admin" ON workspace_folders;
CREATE POLICY "folders_insert_write" ON workspace_folders
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(parent_folder_id, workspace_id) >= 2
  );
CREATE POLICY "folders_update_write" ON workspace_folders
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('folder', id)) >= 2
  );
CREATE POLICY "folders_delete_manage" ON workspace_folders
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('folder', id)) >= 3
  );

-- ---- task_lists ----
DROP POLICY IF EXISTS "task_lists_select_org" ON task_lists;
CREATE POLICY "task_lists_select_org" ON task_lists
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR public.entity_permission('list', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "task_lists_all_admin" ON task_lists;
CREATE POLICY "task_lists_insert_write" ON task_lists
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
CREATE POLICY "task_lists_update_write" ON task_lists
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('list', id)) >= 2
  );
CREATE POLICY "task_lists_delete_manage" ON task_lists
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('list', id)) >= 3
  );

-- ---- documents ----
DROP POLICY IF EXISTS "documents_select_org" ON documents;
CREATE POLICY "documents_select_org" ON documents
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR public.entity_permission('document', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "documents_all_admin" ON documents;
CREATE POLICY "documents_insert_write" ON documents
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
CREATE POLICY "documents_update_write" ON documents
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('document', id)) >= 2
  );
CREATE POLICY "documents_delete_manage" ON documents
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('document', id)) >= 3
  );

-- ---- document_pages ----
DROP POLICY IF EXISTS "pages_select_doc" ON document_pages;
CREATE POLICY "pages_select_doc" ON document_pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
      AND d.organization_id = get_my_org_id()
      AND (
        d.visibility = 'public'
        OR get_my_role() = 'admin'
        OR public.entity_permission('document', d.id) IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "pages_write_visible" ON document_pages;
CREATE POLICY "pages_write_visible" ON document_pages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
      AND d.organization_id = get_my_org_id()
      AND (
        get_my_role() = 'admin'
        OR public.perm_rank(public.entity_permission('document', d.id)) >= 2
      )
    )
  );

-- ---- mind_maps ----
DROP POLICY IF EXISTS "mind_maps_select_org" ON mind_maps;
CREATE POLICY "mind_maps_select_org" ON mind_maps
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR public.entity_permission('mindmap', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "mind_maps_all_admin" ON mind_maps;
CREATE POLICY "mind_maps_insert_write" ON mind_maps
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );
CREATE POLICY "mind_maps_update_write" ON mind_maps
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 2
  );
CREATE POLICY "mind_maps_delete_manage" ON mind_maps
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('mindmap', id)) >= 3
  );

-- ---- formularios (0063) ----
DROP POLICY IF EXISTS "formularios_select_org" ON formularios;
CREATE POLICY "formularios_select_org" ON formularios
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR public.entity_permission('formulario', id) IS NOT NULL
      OR (get_my_access_mode() = 'org' AND visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "formularios_insert_write" ON formularios;
CREATE POLICY "formularios_insert_write" ON formularios
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
    OR public.container_write_level(folder_id, workspace_id) >= 2
  );

DROP POLICY IF EXISTS "formularios_update_write" ON formularios;
CREATE POLICY "formularios_update_write" ON formularios
  FOR UPDATE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('formulario', id)) >= 2
  );

DROP POLICY IF EXISTS "formularios_delete_manage" ON formularios;
CREATE POLICY "formularios_delete_manage" ON formularios
  FOR DELETE USING (
    get_my_role() = 'admin'
    OR public.perm_rank(public.entity_permission('formulario', id)) >= 3
  );

DROP POLICY IF EXISTS "formulario_respuestas_select" ON formulario_respuestas;
CREATE POLICY "formulario_respuestas_select" ON formulario_respuestas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM formularios f
      WHERE f.id = formulario_respuestas.formulario_id
        AND f.organization_id = get_my_org_id()
        AND (
          get_my_role() = 'admin'
          OR public.perm_rank(public.entity_permission('formulario', f.id)) >= 2
        )
    )
  );

DROP POLICY IF EXISTS "formulario_respuestas_delete" ON formulario_respuestas;
CREATE POLICY "formulario_respuestas_delete" ON formulario_respuestas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM formularios f
      WHERE f.id = formulario_respuestas.formulario_id
        AND f.organization_id = get_my_org_id()
        AND (
          get_my_role() = 'admin'
          OR public.perm_rank(public.entity_permission('formulario', f.id)) >= 3
        )
    )
  );

DROP POLICY IF EXISTS "formulario_listas_all_manage" ON formulario_listas;
CREATE POLICY "formulario_listas_all_manage" ON formulario_listas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM formularios f
      WHERE f.id = formulario_listas.formulario_id
        AND f.organization_id = get_my_org_id()
        AND (
          get_my_role() = 'admin'
          OR public.perm_rank(public.entity_permission('formulario', f.id)) >= 3
        )
    )
  );

DROP POLICY IF EXISTS "formulario_invitados_all_manage" ON formulario_invitados;
CREATE POLICY "formulario_invitados_all_manage" ON formulario_invitados
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM formularios f
      WHERE f.id = formulario_invitados.formulario_id
        AND f.organization_id = get_my_org_id()
        AND (
          get_my_role() = 'admin'
          OR public.perm_rank(public.entity_permission('formulario', f.id)) >= 3
        )
    )
  );

-- ---- entity_visibility ----
DROP POLICY IF EXISTS "ev_select" ON entity_visibility;
CREATE POLICY "ev_select" ON entity_visibility
  FOR SELECT USING (
    auth.uid() = profile_id
    OR (get_my_role() = 'admin' AND entity_org_id(entity_type, entity_id) = get_my_org_id())
  );

DROP POLICY IF EXISTS "ev_write_admin" ON entity_visibility;
CREATE POLICY "ev_write_admin" ON entity_visibility
  FOR ALL USING (
    get_my_role() = 'admin' AND entity_org_id(entity_type, entity_id) = get_my_org_id()
  );

-- ---- tasks ----
DROP POLICY IF EXISTS "tasks_select_own_org" ON tasks;
CREATE POLICY "tasks_select_own_org" ON tasks
  FOR SELECT USING (
    organization_id = get_my_org_id()
    AND (
      get_my_role() = 'admin'
      OR assigned_to = auth.uid()
      OR public.task_permission(id) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "tasks_insert_admin" ON tasks;
CREATE POLICY "tasks_insert_admin" ON tasks
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (
      organization_id = get_my_org_id()
      AND list_id IS NOT NULL
      AND public.perm_rank(public.entity_permission('list', list_id)) >= 2
    )
  );

DROP POLICY IF EXISTS "tasks_update_admin" ON tasks;
CREATE POLICY "tasks_update_admin" ON tasks
  FOR UPDATE USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (organization_id = get_my_org_id() AND public.perm_rank(public.task_permission(id)) >= 2)
  );

DROP POLICY IF EXISTS "tasks_delete_admin" ON tasks;
CREATE POLICY "tasks_delete_admin" ON tasks
  FOR DELETE USING (
    get_my_role() = 'admin' AND organization_id = get_my_org_id()
    OR (organization_id = get_my_org_id() AND public.perm_rank(public.task_permission(id)) >= 3)
    OR (organization_id = get_my_org_id() AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "tasks_update_assigned" ON tasks;
CREATE POLICY "tasks_update_assigned" ON tasks
  FOR UPDATE USING (auth.uid() = assigned_to);

-- ---- task_notes ----
DROP POLICY IF EXISTS "notes_select_in_org" ON task_notes;
CREATE POLICY "notes_select_in_org" ON task_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.organization_id = get_my_org_id()
      AND (
        get_my_role() = 'admin'
        OR t.assigned_to = auth.uid()
        OR public.task_permission(t.id) IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "notes_insert_in_org" ON task_notes;
CREATE POLICY "notes_insert_in_org" ON task_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
      AND t.organization_id = get_my_org_id()
      AND (
        get_my_role() = 'admin'
        OR public.perm_rank(public.task_permission(t.id)) >= 2
      )
    )
  );

-- ---- task_activity_log ----
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

-- ---- invitations (sin SELECT público; validación vía RPC) ----
DROP POLICY IF EXISTS "invitations_all_admin" ON invitations;
CREATE POLICY "invitations_all_admin" ON invitations
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- ---- time_entries ----
DROP POLICY IF EXISTS "time_select_own_org" ON time_entries;
CREATE POLICY "time_select_own_org" ON time_entries
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "time_all_admin" ON time_entries;
CREATE POLICY "time_all_admin" ON time_entries
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "time_insert_own" ON time_entries;
CREATE POLICY "time_insert_own" ON time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "time_own_update" ON time_entries;
CREATE POLICY "time_own_update" ON time_entries
  FOR UPDATE USING (auth.uid() = user_id AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "time_own_delete" ON time_entries;
CREATE POLICY "time_own_delete" ON time_entries
  FOR DELETE USING (auth.uid() = user_id AND organization_id = get_my_org_id());

-- ---- permissions ----
DROP POLICY IF EXISTS "perm_select_own_org" ON permissions;
CREATE POLICY "perm_select_own_org" ON permissions
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "perm_insert_own" ON permissions;
CREATE POLICY "perm_insert_own" ON permissions
  FOR INSERT WITH CHECK (auth.uid() = user_id AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "perm_update_admin" ON permissions;
CREATE POLICY "perm_update_admin" ON permissions
  FOR UPDATE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "perm_delete_admin" ON permissions;
CREATE POLICY "perm_delete_admin" ON permissions
  FOR DELETE USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "perm_delete_own_pending" ON permissions;
CREATE POLICY "perm_delete_own_pending" ON permissions
  FOR DELETE USING (
    auth.uid() = user_id
    AND status = 'pending'
    AND organization_id = get_my_org_id()
  );

-- ---- notifications ----
DROP POLICY IF EXISTS "notif_all_own" ON notifications;
CREATE POLICY "notif_all_own" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- ---- telegram_config ----
DROP POLICY IF EXISTS "telegram_all_admin" ON telegram_config;
CREATE POLICY "telegram_all_admin" ON telegram_config
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- ---- org_settings ----
DROP POLICY IF EXISTS "org_settings_select_own_org" ON org_settings;
CREATE POLICY "org_settings_select_own_org" ON org_settings
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "org_settings_all_admin" ON org_settings;
CREATE POLICY "org_settings_all_admin" ON org_settings
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

-- ---- audit_logs ----
DROP POLICY IF EXISTS "audit_select_admin" ON audit_logs;
CREATE POLICY "audit_select_admin" ON audit_logs
  FOR SELECT USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "audit_insert_org" ON audit_logs;
CREATE POLICY "audit_insert_org" ON audit_logs
  FOR INSERT WITH CHECK (organization_id = get_my_org_id());

-- ============================================================
-- 6. TRIGGERS (SECURITY DEFINER cuando insertan en tablas con RLS)
-- ============================================================

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

DROP TRIGGER IF EXISTS mind_maps_updated_at ON mind_maps;
CREATE TRIGGER mind_maps_updated_at
  BEFORE UPDATE ON mind_maps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS formularios_updated_at ON formularios;
CREATE TRIGGER formularios_updated_at
  BEFORE UPDATE ON formularios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_formularios_creator_access ON formularios;
CREATE TRIGGER trg_formularios_creator_access AFTER INSERT ON formularios
  FOR EACH ROW EXECUTE FUNCTION grant_creator_access('formulario');

DROP TRIGGER IF EXISTS trg_formularios_visibility ON formularios;
CREATE TRIGGER trg_formularios_visibility BEFORE UPDATE OF visibility ON formularios
  FOR EACH ROW EXECUTE FUNCTION protect_visibility_change();

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

-- Timeline de cambios en tareas
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

-- Limpieza de grants al eliminar entidades
CREATE OR REPLACE FUNCTION cleanup_entity_visibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.entity_visibility
  WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_ev_workspace ON workspaces;
CREATE TRIGGER trg_ev_workspace
  AFTER DELETE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('workspace');

DROP TRIGGER IF EXISTS trg_ev_folder ON workspace_folders;
CREATE TRIGGER trg_ev_folder
  AFTER DELETE ON workspace_folders
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('folder');

DROP TRIGGER IF EXISTS trg_ev_list ON task_lists;
CREATE TRIGGER trg_ev_list
  AFTER DELETE ON task_lists
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('list');

DROP TRIGGER IF EXISTS trg_ev_document ON documents;
CREATE TRIGGER trg_ev_document
  AFTER DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('document');

DROP TRIGGER IF EXISTS trg_ev_mindmap ON mind_maps;
CREATE TRIGGER trg_ev_mindmap
  AFTER DELETE ON mind_maps
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('mindmap');

DROP TRIGGER IF EXISTS trg_ev_formulario ON formularios;
CREATE TRIGGER trg_ev_formulario
  AFTER DELETE ON formularios
  FOR EACH ROW EXECUTE FUNCTION cleanup_entity_visibility('formulario');

-- ---- Enforcement de horarios (0030) ----
-- Los triggers corren con el search_path del rol (no SECURITY
-- DEFINER): auth.uid()/is_org_owner() se resuelven sin calificar.

CREATE OR REPLACE FUNCTION prevent_overlapping_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_start TIME; v_new_end TIME;
BEGIN
  SELECT start_time, end_time INTO v_new_start, v_new_end
  FROM shifts WHERE id = NEW.shift_id;

  IF EXISTS (
    SELECT 1
    FROM schedules s
    JOIN shifts x ON x.id = s.shift_id
    WHERE s.user_id = NEW.user_id
      AND s.day_of_week = NEW.day_of_week
      AND s.id <> NEW.id
      AND shifts_overlap(x.start_time, x.end_time, v_new_start, v_new_end)
  ) THEN
    RAISE EXCEPTION 'El turno se solapa con otro turno asignado para el mismo día';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedules_no_overlap ON schedules;
CREATE TRIGGER schedules_no_overlap
  BEFORE INSERT OR UPDATE OF shift_id, day_of_week ON schedules
  FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_schedule();

CREATE OR REPLACE FUNCTION prevent_last_schedule_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_org_owner(OLD.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM schedules WHERE user_id = OLD.user_id AND id <> OLD.id
     ) THEN
    RAISE EXCEPTION
      'El usuario debe tener un horario siempre: asigna un turno antes de eliminar este';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS schedules_keep_last ON schedules;
CREATE TRIGGER schedules_keep_last
  BEFORE DELETE ON schedules
  FOR EACH ROW EXECUTE FUNCTION prevent_last_schedule_deletion();

CREATE OR REPLACE FUNCTION require_schedule_for_time_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT is_org_owner(NEW.user_id)
     AND NOT has_schedule(NEW.user_id) THEN
    RAISE EXCEPTION
      'Sin horario asignado: el administrador debe asignar un turno antes de registrar horas';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_entries_require_schedule ON time_entries;
CREATE TRIGGER time_entries_require_schedule
  BEFORE INSERT OR UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION require_schedule_for_time_entry();

CREATE OR REPLACE FUNCTION require_schedule_for_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND auth.role() <> 'service_role'
     AND NOT is_org_owner(NEW.assigned_to)
     AND NOT has_schedule(NEW.assigned_to) THEN
    RAISE EXCEPTION
      'El usuario asignado no tiene horario: asígnale un turno primero';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_require_schedule ON tasks;
CREATE TRIGGER tasks_require_schedule
  BEFORE INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW EXECUTE FUNCTION require_schedule_for_task_assignment();

CREATE OR REPLACE FUNCTION enforce_hours_org_control()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND auth.uid() = NEW.id
     AND has_schedule(NEW.id)
     AND NOT is_org_owner(NEW.id) THEN
    RAISE EXCEPTION
      'Tu horario lo administra la organización: solicita cambios al administrador';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_hours_org_controlled ON profiles;
CREATE TRIGGER profiles_hours_org_controlled
  BEFORE UPDATE OF daily_hours, weekly_hours ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_hours_org_control();

-- ============================================================
-- 7. STORAGE (bucket mindmap-images; se crea con
--    scripts/create-mindmap-bucket.mjs)
-- ============================================================

DROP POLICY IF EXISTS "mindmap_images_public_read" ON storage.objects;
CREATE POLICY "mindmap_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'mindmap-images');

DROP POLICY IF EXISTS "mindmap_images_authenticated_write" ON storage.objects;
CREATE POLICY "mindmap_images_authenticated_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'mindmap-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (get_my_org_id())::text
  );

DROP POLICY IF EXISTS "mindmap_images_authenticated_update" ON storage.objects;
CREATE POLICY "mindmap_images_authenticated_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'mindmap-images'
    AND auth.role() = 'authenticated'
  );

-- ============================================================
-- 8. HARDENING (0029): debug solo service_role, invitación por RPC
-- ============================================================

CREATE OR REPLACE FUNCTION debug_policies()
RETURNS TABLE (tablename text, policyname text, cmd text, permissive text, qual text, with_check text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT tablename, policyname, cmd, permissive, qual::text, with_check::text
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
$$;

CREATE OR REPLACE FUNCTION debug_rls_status()
RETURNS TABLE (tablename name, rowsecurity boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT tablename, rowsecurity FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
$$;

CREATE OR REPLACE FUNCTION debug_columns()
RETURNS TABLE (table_name text, column_name text, data_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT table_name::text, column_name::text, data_type::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position;
$$;

REVOKE EXECUTE ON FUNCTION debug_policies() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_rls_status() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION debug_columns() FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION get_invitation(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_invitation(TEXT) FROM public;

-- ============================================================
-- 9. PARIDAD 0052-0065 (consolidado de deltas aplicados a prod/dev)
-- ------------------------------------------------------------
-- Estas secciones reproducen el estado final de las migraciones que
-- no estaban volcadas aquí: notas (0052 + hotfix 0065), error_logs
-- (0054), revokes de audit_logs (0056), claim_organization (0057),
-- search_path/revokes (0058), document_mentions (0060) y la
-- publicación realtime (0046/0053/0061/0063).
-- ============================================================

-- ---- Notas del calendario: privadas del creador (0052 + 0065) ----

CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  note_date date NOT NULL,
  title text NOT NULL DEFAULT 'Nota',
  content text,
  drawing jsonb,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_org_date ON public.notes (organization_id, note_date);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select_org" ON public.notes;
DROP POLICY IF EXISTS "notes_write_org" ON public.notes;
DROP POLICY IF EXISTS "notes_select_own" ON public.notes;
DROP POLICY IF EXISTS "notes_insert_org" ON public.notes;
DROP POLICY IF EXISTS "notes_update_own" ON public.notes;
DROP POLICY IF EXISTS "notes_delete_own" ON public.notes;

CREATE POLICY "notes_select_own" ON public.notes
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "notes_insert_org" ON public.notes
  FOR INSERT WITH CHECK (
    public.get_my_org_id() = organization_id
    AND created_by = auth.uid()
  );

CREATE POLICY "notes_update_own" ON public.notes
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "notes_delete_own" ON public.notes
  FOR DELETE USING (created_by = auth.uid());

DROP TRIGGER IF EXISTS notes_updated_at ON public.notes;
CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Documenta el drop aplicado a mano en prod (drop_tasks_select_org).
DROP POLICY IF EXISTS "tasks_select_org" ON public.tasks;

-- ---- Registro centralizado de errores (0054; revocado en 0058) ----

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warning')),
  message TEXT NOT NULL CHECK (char_length(message) <= 4000),
  name TEXT,
  code TEXT,
  stack TEXT CHECK (stack IS NULL OR char_length(stack) <= 20000),
  route TEXT,
  method TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_agent TEXT,
  client_ip TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NOT NULL UNIQUE,
  count INT NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolved_at TIMESTAMPTZ,
  telegram_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_error_logs_last_seen ON error_logs(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_status ON error_logs(status, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_org ON error_logs(organization_id, last_seen DESC);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "error_logs_select_owner" ON error_logs;
CREATE POLICY "error_logs_select_owner" ON error_logs
  FOR SELECT USING (is_org_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_error(
  p_source text,
  p_message text,
  p_level text DEFAULT 'error',
  p_name text DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_stack text DEFAULT NULL,
  p_route text DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_client_ip text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_fingerprint text DEFAULT NULL
)
RETURNS TABLE (id uuid, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_message text;
  v_fingerprint text;
  v_row record;
BEGIN
  v_message := left(nullif(trim(p_message), ''), 4000);
  IF v_message IS NULL THEN
    v_message := 'unknown error';
  END IF;

  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object' OR p_context IS NULL THEN
    p_context := '{}'::jsonb;
  END IF;
  IF char_length(p_context::text) > 50000 THEN
    p_context := jsonb_build_object('truncated', true);
  END IF;

  IF p_level NOT IN ('error', 'warning') THEN p_level := 'error'; END IF;
  IF p_source NOT IN ('client', 'server') THEN p_source := 'server'; END IF;

  v_fingerprint := left(nullif(trim(p_fingerprint), ''), 128);
  IF v_fingerprint IS NULL THEN
    v_fingerprint := md5(coalesce(p_name, '') || '|' || v_message);
  END IF;

  IF p_client_ip IS NOT NULL AND (
    SELECT count(*) FROM public.error_logs
    WHERE client_ip = p_client_ip AND last_seen > now() - interval '1 hour'
  ) >= 100 THEN
    RETURN;
  END IF;

  INSERT INTO public.error_logs (
    source, level, message, name, code, stack, route, method,
    user_id, organization_id, user_agent, client_ip, context, fingerprint
  ) VALUES (
    p_source, p_level, v_message, left(p_name, 200), left(p_code, 20),
    left(p_stack, 20000), left(p_route, 500), left(p_method, 10),
    p_user_id, p_organization_id, left(p_user_agent, 500), left(p_client_ip, 64),
    p_context, v_fingerprint
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    count = error_logs.count + 1,
    last_seen = now(),
    status = 'open',
    resolved_at = NULL,
    telegram_sent_at = NULL
  RETURNING error_logs.id, (xmax = 0) AS is_new INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.is_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_error(
  text, text, text, text, text, text, text, text,
  uuid, uuid, text, text, jsonb, text
) FROM public, anon, authenticated;

-- ---- audit_logs: revokes de 0056 ----

REVOKE TRUNCATE, REFERENCES, DELETE, UPDATE ON audit_logs FROM anon, authenticated;
REVOKE SELECT, INSERT ON audit_logs FROM anon;

-- ---- claim_organization endurecida (0057) ----

CREATE OR REPLACE FUNCTION public.claim_organization(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_claimed boolean;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
    FROM public.profiles
   WHERE id = p_user_id;
  IF v_org_id IS NULL OR v_org_id <> p_org_id THEN
    RETURN false;
  END IF;

  UPDATE public.organizations
     SET owner_id = p_user_id
   WHERE id = p_org_id
     AND owner_id IS NULL
  RETURNING true INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
     SET is_owner = true
   WHERE id = p_user_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_organization(uuid, uuid)
  FROM anon, public, authenticated;

-- ---- search_path fijo + revokes de 0058 ----

ALTER FUNCTION public.perm_rank(text) SET search_path = 'public';
ALTER FUNCTION public.shifts_overlap(time, time, time, time) SET search_path = 'public';
ALTER FUNCTION public.prevent_last_schedule_deletion() SET search_path = 'public';
ALTER FUNCTION public.prevent_overlapping_schedule() SET search_path = 'public';
ALTER FUNCTION public.require_schedule_for_time_entry() SET search_path = 'public';
ALTER FUNCTION public.require_schedule_for_task_assignment() SET search_path = 'public';
ALTER FUNCTION public.enforce_hours_org_control() SET search_path = 'public';

REVOKE EXECUTE ON FUNCTION public.has_schedule(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_owner(uuid) FROM anon, public;

-- ---- Código corto de formularios (0064 + 0066) ----

CREATE OR REPLACE FUNCTION public.generar_codigo_corto()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  alfabeto TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  resultado TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    resultado := resultado || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  END LOOP;
  RETURN resultado;
END;
$$;

-- ---- Menciones en documentos (0060) ----

CREATE TABLE IF NOT EXISTS document_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mentioned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, profile_id)
);

CREATE INDEX IF NOT EXISTS document_mentions_document_idx
  ON document_mentions(document_id);

ALTER TABLE document_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_mentions_select" ON document_mentions;
CREATE POLICY "document_mentions_select" ON document_mentions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d WHERE d.id = document_mentions.document_id
    )
  );

REVOKE INSERT, UPDATE, DELETE ON document_mentions FROM anon, authenticated;

-- ---- Publicación realtime (0046/0053/0061/0063) ----

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entity_visibility', 'workspaces', 'workspace_folders', 'task_lists',
    'documents', 'mind_maps', 'todos', 'todo_items', 'tasks', 'task_notes',
    'task_activity_log', 'profiles', 'invitations', 'schedules', 'notes',
    'notifications', 'formularios', 'formulario_respuestas'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- ---- Plataforma de owners (0067–0070) ----
-- Todo vive fuera del modelo de organizaciones: solo la API con
-- service role accede. RLS ON sin policies + REVOKE.

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS owner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_contacto TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT,
  empresa TEXT NOT NULL,
  sitio_web TEXT,
  pais TEXT,
  sector TEXT,
  tamano_equipo TEXT,
  motivacion TEXT,
  referido_por TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_revision', 'aprobada', 'rechazada', 'invitada', 'activada')),
  notas_admin TEXT,
  organization_id UUID REFERENCES organizations ON DELETE SET NULL,
  invitation_id UUID REFERENCES invitations ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  ip_hash TEXT,
  consentimiento_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio_mensual NUMERIC(12, 2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'USD',
  limites JSONB NOT NULL DEFAULT '{}',
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (id, nombre, precio_mensual, moneda, limites, orden) VALUES
  ('base', 'Base', 0, 'USD', '{"miembros": 10, "almacenamiento_mb": 1024}', 1),
  ('pro', 'Pro', 49, 'USD', '{"miembros": 50, "almacenamiento_mb": 10240}', 2),
  ('empresa', 'Empresa', 149, 'USD', '{"miembros": 500, "almacenamiento_mb": 102400}', 3)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_plan_id_fkey'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS org_subscriptions (
  organization_id UUID PRIMARY KEY REFERENCES organizations ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('prueba', 'activa', 'mora', 'cancelada')),
  periodo_inicio DATE,
  periodo_fin DATE,
  precio_acordado NUMERIC(12, 2),
  notas TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations ON DELETE CASCADE,
  periodo DATE NOT NULL,
  monto NUMERIC(12, 2) NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'USD',
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagada', 'anulada')),
  pagado_at TIMESTAMPTZ,
  metodo TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES auth.users ON DELETE SET NULL,
  accion TEXT NOT NULL,
  entidad_tipo TEXT,
  entidad_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_admins_created_at_idx
  ON platform_admins (created_at DESC);
CREATE INDEX IF NOT EXISTS owner_applications_estado_idx
  ON owner_applications (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS owner_applications_email_idx
  ON owner_applications (lower(email));
CREATE INDEX IF NOT EXISTS org_subscriptions_plan_idx
  ON org_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS billing_records_org_idx
  ON billing_records (organization_id, periodo DESC);
CREATE INDEX IF NOT EXISTS organizations_status_idx
  ON organizations (status);
CREATE INDEX IF NOT EXISTS profiles_last_active_idx
  ON profiles (last_active_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_logs_created_idx
  ON platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_logs_entidad_idx
  ON platform_audit_logs (entidad_tipo, entidad_id);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE platform_admins FROM anon, authenticated;
REVOKE ALL ON TABLE owner_applications FROM anon, authenticated;
REVOKE ALL ON TABLE plans FROM anon, authenticated;
REVOKE ALL ON TABLE org_subscriptions FROM anon, authenticated;
REVOKE ALL ON TABLE billing_records FROM anon, authenticated;
REVOKE ALL ON TABLE platform_audit_logs FROM anon, authenticated;