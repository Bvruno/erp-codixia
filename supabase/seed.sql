-- ============================================================
-- SEED DATA - Ejecutar DESPUÉS de crear primer usuario admin
-- ============================================================

DO $$
DECLARE
  v_org_id UUID;
  v_admin_id UUID;
  v_collab_id UUID;
  v_shift_manana UUID;
  v_shift_tarde UUID;
  v_shift_noche UUID;
  v_collab2_id UUID;
  v_collab3_id UUID;
  v_task1 UUID;
  v_task2 UUID;
  v_task3 UUID;
  v_task4 UUID;
  v_task5 UUID;
  v_admin_email TEXT;
BEGIN
  -- Buscar el primer usuario admin creado
  SELECT p.id, p.organization_id, u.email
  INTO v_admin_id, v_org_id, v_admin_email
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'admin'
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No hay admin. Crea una cuenta primero en /signup';
    RETURN;
  END IF;

  RAISE NOTICE 'Admin: %, Org: %', v_admin_email, v_org_id;

  -- Crear colaboradores de prueba (idempotente: reusa el usuario Auth
-- si el email ya existe, p. ej. de un seed anterior).
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         'maria.garcia@demo.com', crypt('demo123456', gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}',
         '{"full_name":"María García"}', now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'maria.garcia@demo.com')
  RETURNING id INTO v_collab_id;

  IF v_collab_id IS NULL THEN
    SELECT id INTO v_collab_id FROM auth.users WHERE email = 'maria.garcia@demo.com';
  END IF;

  UPDATE profiles
  SET organization_id = v_org_id, role = 'collaborator', full_name = 'María García', daily_hours = 8, weekly_hours = 40
  WHERE id = v_collab_id;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         'carlos.lopez@demo.com', crypt('demo123456', gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}',
         '{"full_name":"Carlos López"}', now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'carlos.lopez@demo.com')
  RETURNING id INTO v_collab2_id;

  IF v_collab2_id IS NULL THEN
    SELECT id INTO v_collab2_id FROM auth.users WHERE email = 'carlos.lopez@demo.com';
  END IF;

  UPDATE profiles
  SET organization_id = v_org_id, role = 'collaborator', full_name = 'Carlos López', daily_hours = 6, weekly_hours = 30
  WHERE id = v_collab2_id;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         'ana.martinez@demo.com', crypt('demo123456', gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}',
         '{"full_name":"Ana Martínez"}', now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'ana.martinez@demo.com')
  RETURNING id INTO v_collab3_id;

  IF v_collab3_id IS NULL THEN
    SELECT id INTO v_collab3_id FROM auth.users WHERE email = 'ana.martinez@demo.com';
  END IF;

  UPDATE profiles
  SET organization_id = v_org_id, role = 'collaborator', full_name = 'Ana Martínez', daily_hours = 8, weekly_hours = 40
  WHERE id = v_collab3_id;

  -- Turnos
  INSERT INTO shifts (organization_id, name, start_time, end_time)
  VALUES (v_org_id, 'Mañana', '08:00', '14:00')
  RETURNING id INTO v_shift_manana;

  INSERT INTO shifts (organization_id, name, start_time, end_time)
  VALUES (v_org_id, 'Tarde', '14:00', '20:00')
  RETURNING id INTO v_shift_tarde;

  INSERT INTO shifts (organization_id, name, start_time, end_time)
  VALUES (v_org_id, 'Noche', '20:00', '02:00')
  RETURNING id INTO v_shift_noche;

  -- Horarios (regla: todos salvo el owner deben tener turno; Lun-Vie)
  INSERT INTO schedules (organization_id, user_id, shift_id, day_of_week, created_by) VALUES
  (v_org_id, v_collab_id,  v_shift_manana, 1, v_admin_id),
  (v_org_id, v_collab_id,  v_shift_manana, 2, v_admin_id),
  (v_org_id, v_collab_id,  v_shift_manana, 3, v_admin_id),
  (v_org_id, v_collab_id,  v_shift_manana, 4, v_admin_id),
  (v_org_id, v_collab_id,  v_shift_manana, 5, v_admin_id),
  (v_org_id, v_collab2_id, v_shift_tarde,  1, v_admin_id),
  (v_org_id, v_collab2_id, v_shift_tarde,  2, v_admin_id),
  (v_org_id, v_collab2_id, v_shift_tarde,  3, v_admin_id),
  (v_org_id, v_collab2_id, v_shift_tarde,  4, v_admin_id),
  (v_org_id, v_collab2_id, v_shift_tarde,  5, v_admin_id),
  (v_org_id, v_collab3_id, v_shift_noche,  1, v_admin_id),
  (v_org_id, v_collab3_id, v_shift_noche,  2, v_admin_id),
  (v_org_id, v_collab3_id, v_shift_noche,  3, v_admin_id),
  (v_org_id, v_collab3_id, v_shift_noche,  4, v_admin_id),
  (v_org_id, v_collab3_id, v_shift_noche,  5, v_admin_id);

  -- Tareas
  INSERT INTO tasks (organization_id, title, description, status, priority, assigned_to, created_by, shift_id, due_date, estimated_hours, position)
  VALUES (v_org_id, 'Revisar reporte mensual', 'Revisar y validar datos del reporte de ventas de julio', 'in_progress', 'high', v_collab_id, v_admin_id, v_shift_manana, CURRENT_DATE + 2, 4.0, 1)
  RETURNING id INTO v_task1;

  INSERT INTO tasks (organization_id, title, description, status, priority, assigned_to, created_by, shift_id, due_date, estimated_hours, position)
  VALUES (v_org_id, 'Diseñar presentación', 'Crear slides para la reunión de stakeholders del viernes', 'todo', 'medium', v_collab_id, v_admin_id, v_shift_tarde, CURRENT_DATE + 4, 3.0, 2)
  RETURNING id INTO v_task2;

  INSERT INTO tasks (organization_id, title, description, status, priority, assigned_to, created_by, shift_id, due_date, estimated_hours, position)
  VALUES (v_org_id, 'Actualizar base de datos', 'Migrar registros antiguos al nuevo formato', 'backlog', 'low', v_collab_id, v_admin_id, v_shift_noche, CURRENT_DATE + 7, 8.0, 3)
  RETURNING id INTO v_task3;

  INSERT INTO tasks (organization_id, title, description, status, priority, assigned_to, created_by, shift_id, due_date, estimated_hours, position)
  VALUES (v_org_id, 'Capacitación onboarding', 'Preparar material para nuevos colaboradores', 'done', 'high', v_collab_id, v_admin_id, v_shift_manana, CURRENT_DATE - 1, 6.0, 4)
  RETURNING id INTO v_task4;

  INSERT INTO tasks (organization_id, title, description, status, priority, assigned_to, created_by, shift_id, due_date, estimated_hours, position)
  VALUES (v_org_id, 'Auditoría de seguridad', 'Revisar logs y accesos del último trimestre', 'review', 'urgent', v_collab_id, v_admin_id, v_shift_manana, CURRENT_DATE + 1, 10.0, 5)
  RETURNING id INTO v_task5;

  -- Sub-tareas (ramas)
  INSERT INTO tasks (organization_id, parent_task_id, title, description, status, priority, assigned_to, created_by, due_date, estimated_hours, position)
  VALUES (v_org_id, v_task5, 'Revisar logs de acceso', 'Analizar logs de acceso del sistema', 'in_progress', 'high', v_collab_id, v_admin_id, CURRENT_DATE + 1, 4.0, 1);

  INSERT INTO tasks (organization_id, parent_task_id, title, description, status, priority, assigned_to, created_by, due_date, estimated_hours, position)
  VALUES (v_org_id, v_task5, 'Verificar permisos de usuarios', 'Confirmar que los roles y permisos sean correctos', 'todo', 'high', v_collab_id, v_admin_id, CURRENT_DATE + 2, 3.0, 2);

  INSERT INTO tasks (organization_id, parent_task_id, title, description, status, priority, assigned_to, created_by, due_date, estimated_hours, position)
  VALUES (v_org_id, v_task5, 'Generar reporte final', 'Compilar hallazgos en documento ejecutivo', 'backlog', 'medium', v_collab_id, v_admin_id, CURRENT_DATE + 3, 3.0, 3);

  -- Notas/comentarios
  INSERT INTO task_notes (task_id, author_id, content) VALUES
  (v_task1, v_admin_id, 'Recibí el reporte preliminar, empecemos la revisión.'),
  (v_task1, v_collab_id, 'Ya voy en la sección de gastos. Encontré una discrepancia.'),
  (v_task1, v_admin_id, 'Márcala para revisar mañana en la reunión.'),
  (v_task4, v_collab_id, 'Presentación lista. Adjunté los slides en Drive.'),
  (v_task5, v_admin_id, 'Esto es urgente, necesitamos resultados antes del viernes.');

  -- Registro de horas
  INSERT INTO time_entries (user_id, organization_id, date, hours, type) VALUES
  (v_collab_id, v_org_id, CURRENT_DATE - 4, 8.0, 'worked'),
  (v_collab_id, v_org_id, CURRENT_DATE - 3, 7.5, 'worked'),
  (v_collab_id, v_org_id, CURRENT_DATE - 2, 9.0, 'worked'),
  (v_collab_id, v_org_id, CURRENT_DATE - 1, 6.0, 'worked'),
  (v_collab_id, v_org_id, CURRENT_DATE - 1, 2.0, 'overtime'),
  (v_collab_id, v_org_id, CURRENT_DATE, 4.0, 'worked');

  -- Permiso
  INSERT INTO permissions (user_id, organization_id, reason, date, estimated_hours, makeup_date, status) VALUES
  (v_collab_id, v_org_id, 'Cita médica', CURRENT_DATE + 3, 3.0, CURRENT_DATE + 5, 'pending');

  -- Invitación de prueba (token almacenado como SHA-256)
  INSERT INTO invitations (organization_id, token, created_by, expires_at, status) VALUES
  (v_org_id, encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'), v_admin_id, CURRENT_TIMESTAMP + INTERVAL '24 hours', 'pending');

  -- Notificaciones
  INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id) VALUES
  (v_collab_id, 'task_assigned', 'Tarea asignada: Auditoría de seguridad', 'Se te ha asignado revisar logs y accesos', 'task', v_task5),
  (v_collab_id, 'note_added', 'Nuevo comentario en Revisar reporte mensual', 'Admin comentó en tu tarea', 'task', v_task1),
  (v_collab_id, 'permission', 'Permiso pendiente', 'Tu solicitud de permiso para cita médica está pendiente', 'permission', NULL);

  RAISE NOTICE 'Datos de prueba creados OK';
END $$;
