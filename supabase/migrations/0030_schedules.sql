-- ============================================================
-- PARTE 30: Horarios por usuario (schedules)
-- Regla de negocio: TODOS los miembros de la organización deben
-- tener un horario activo SIEMPRE. Única exención: el owner de la
-- organización (organizations.owner_id), sin importar permisos.
-- ============================================================

-- Tabla: un turno fijo por día de semana por usuario.
-- day_of_week: 0 = domingo ... 6 = sábado (getDay() / date-fns).
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

CREATE INDEX IF NOT EXISTS idx_schedules_org ON schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id);

-- ============================================================
-- Helpers SECURITY DEFINER (patrón migración 0008)
-- ============================================================

-- Owner de la organización a la que pertenece el usuario
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

-- El usuario tiene al menos un horario asignado
CREATE OR REPLACE FUNCTION has_schedule(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.schedules WHERE user_id = user_uuid);
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

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedules_select_org" ON schedules;
CREATE POLICY "schedules_select_org" ON schedules
  FOR SELECT USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "schedules_all_admin" ON schedules;
CREATE POLICY "schedules_all_admin" ON schedules
  FOR ALL USING (get_my_role() = 'admin' AND organization_id = get_my_org_id());

DROP POLICY IF EXISTS "schedules_all_org_owner" ON schedules;
CREATE POLICY "schedules_all_org_owner" ON schedules
  FOR ALL USING (is_org_owner(auth.uid()) AND organization_id = get_my_org_id());

-- ============================================================
-- Triggers de enforcement
-- ============================================================

-- 1) Un turno no puede solaparse con otro del mismo usuario el mismo día
DROP TRIGGER IF EXISTS schedules_no_overlap ON schedules;
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

CREATE TRIGGER schedules_no_overlap
  BEFORE INSERT OR UPDATE OF shift_id, day_of_week ON schedules
  FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_schedule();

-- 2) Nadie (salvo owner) puede quedarse sin horario
DROP TRIGGER IF EXISTS schedules_keep_last ON schedules;
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

CREATE TRIGGER schedules_keep_last
  BEFORE DELETE ON schedules
  FOR EACH ROW EXECUTE FUNCTION prevent_last_schedule_deletion();

-- 3) Registrar horas exige horario activo (solo owner exento)
DROP TRIGGER IF EXISTS time_entries_require_schedule ON time_entries;
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

CREATE TRIGGER time_entries_require_schedule
  BEFORE INSERT OR UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION require_schedule_for_time_entry();

-- 4) Asignar tarea exige horario activo (solo owner exento)
DROP TRIGGER IF EXISTS tasks_require_schedule ON tasks;
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

CREATE TRIGGER tasks_require_schedule
  BEFORE INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW EXECUTE FUNCTION require_schedule_for_task_assignment();

-- 5) Con horario asignado, nadie se auto-edita daily/weekly_hours:
-- lo administra la organización (admin/owner).
DROP TRIGGER IF EXISTS profiles_hours_org_controlled ON profiles;
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

CREATE TRIGGER profiles_hours_org_controlled
  BEFORE UPDATE OF daily_hours, weekly_hours ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_hours_org_control();