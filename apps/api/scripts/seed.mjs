#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const envPath = resolve(root, '.env.local');
  if (!existsSync(envPath)) return process.env;
  const env = { ...process.env };
  for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in env)) env[key] = value;
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'ERROR: faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (en .env.local o entorno).'
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!ANON_KEY) {
  console.error('ERROR: falta NEXT_PUBLIC_SUPABASE_ANON_KEY (en .env.local o entorno).');
  process.exit(1);
}

const verify = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const log = [];
const add = (msg) => log.push(msg);
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

const OWNER_EMAIL = 'owner.demo@demo.com';
const OWNER_PASSWORD = 'demo123456';
const OWNER_NAME = 'Dueño Demo';
const ORG_NAME = 'Empresa Demo';

async function findUserByEmail(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users?.find((u) => u.email === email) ?? null;
}

async function ensureOwnerAndOrg() {
  let owner = await findUserByEmail(OWNER_EMAIL);

  let ownerId = owner?.id ?? null;
  if (!ownerId) {
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: OWNER_NAME },
    });
    if (userErr) throw new Error('ERROR creando owner: ' + userErr.message);
    ownerId = userData.user?.id ?? null;
  }
  if (!ownerId) throw new Error('ERROR: no se pudo resolver el owner');

  const { data: orgData } = await admin
    .from('organizations')
    .select('id, owner_id')
    .ilike('name', ORG_NAME)
    .maybeSingle();

  let orgId = orgData?.id ?? null;
  if (!orgId) {
    const { data: newOrg, error: orgErr } = await admin
      .from('organizations')
      .insert({ name: ORG_NAME, owner_id: ownerId })
      .select('id')
      .single();
    if (orgErr) throw new Error('ERROR creando organización: ' + orgErr.message);
    orgId = newOrg.id;
  } else if (!orgData.owner_id) {
    const { error: claimErr } = await admin
      .from('organizations')
      .update({ owner_id: ownerId })
      .eq('id', orgId);
    if (claimErr) throw new Error('ERROR reclamando organización: ' + claimErr.message);
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      organization_id: orgId,
      role: 'admin',
      is_owner: true,
      onboarding_pending: false,
      full_name: OWNER_NAME,
      daily_hours: 8,
      weekly_hours: 40,
    })
    .eq('id', ownerId);
  if (profileErr) throw new Error('ERROR actualizando perfil owner: ' + profileErr.message);

  const { error: settingsErr } = await admin.from('org_settings').upsert(
    {
      organization_id: orgId,
      daily_hours: 8,
      weekly_hours: 40,
      timezone: 'America/Mexico_City',
    },
    { onConflict: 'organization_id' }
  );
  if (settingsErr) throw new Error('ERROR creando ajustes: ' + settingsErr.message);

  return { id: ownerId, organization_id: orgId };
}

async function main() {
  try {
    add('Asegurando owner y organización de prueba...');
    let adminProfile;
    try {
      adminProfile = await ensureOwnerAndOrg();
    } catch (err) {
      add(err.message);
      console.log(log.join('\n'));
      process.exitCode = 1;
      return;
    }
    add('Owner: ' + OWNER_EMAIL + ' (' + ORG_NAME + ')');

    const collaborators = ['María García', 'Carlos López', 'Ana Martínez'];
    const collabIds = [];
    const collabEmails = [];

    for (const name of collaborators) {
      const safeName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const email = safeName.toLowerCase().replace(/\s/g, '.') + '@demo.com';
      collabEmails.push(email);

      let userId = null;
      const existingCollab = await findUserByEmail(email);
      if (existingCollab) {
        userId = existingCollab.id;
        add('Colaborador existente (reusado): ' + name);
      } else {
        const { data: userData, error: userErr } = await admin.auth.admin.createUser({
          email,
          password: 'demo123456',
          email_confirm: true,
          user_metadata: { full_name: name },
        });
        if (userErr) {
          add('ERROR creando ' + name + ': ' + userErr.message);
          continue;
        }
        userId = userData.user?.id;
        add('Colaborador creado: ' + name + ' (' + email + ')');
      }
      if (!userId) continue;

      await admin
        .from('profiles')
        .update({
          organization_id: adminProfile.organization_id,
          role: 'collaborator',
          full_name: name,
        })
        .eq('id', userId);

      collabIds.push(userId);
    }

    if (collabIds.length === 0) {
      add('ERROR: No se pudo crear ningún colaborador');
      console.log(log.join('\n'));
      process.exitCode = 1;
      return;
    }

    const ownerLogin = await verify.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    });
    add(
      ownerLogin.error
        ? 'WARN: login owner falló: ' + ownerLogin.error.message
        : 'Login owner OK'
    );

    const collabLogin = await verify.auth.signInWithPassword({
      email: collabEmails[0],
      password: 'demo123456',
    });
    add(
      collabLogin.error
        ? 'WARN: login colaborador falló: ' + collabLogin.error.message
        : 'Login colaborador OK (' + collabEmails[0] + ')'
    );

    const orgId = adminProfile.organization_id;

    const defaultShifts = [
      { name: 'Mañana', start_time: '08:00', end_time: '14:00' },
      { name: 'Tarde', start_time: '14:00', end_time: '20:00' },
      { name: 'Noche', start_time: '20:00', end_time: '02:00' },
    ];
    const { data: existingShifts } = await admin
      .from('shifts')
      .select('name')
      .eq('organization_id', orgId);
    const existingNames = new Set((existingShifts ?? []).map((s) => s.name));
    const missingShifts = defaultShifts.filter((s) => !existingNames.has(s.name));
    if (missingShifts.length) {
      const { error: shiftsErr } = await admin.from('shifts').insert(
        missingShifts.map((s) => ({ organization_id: orgId, ...s }))
      );
      if (shiftsErr) add('WARN: turnos faltantes no creados: ' + shiftsErr.message);
      else add('Turnos faltantes creados: ' + missingShifts.map((s) => s.name).join(', '));
    }

    const { data: shiftData } = await admin
      .from('shifts')
      .select('*')
      .eq('organization_id', orgId);
    const shiftMap = {};
    shiftData?.forEach((s) => {
      shiftMap[s.name] = s.id;
    });

    const weekDays = [1, 2, 3, 4, 5];
    const scheduleRows = [];
    collabIds.forEach((uid, i) => {
      const shiftName = ['Mañana', 'Tarde', 'Noche'][i % 3];
      const shiftId = shiftMap[shiftName];
      if (!shiftId) return;
      weekDays.forEach((day) =>
        scheduleRows.push({
          organization_id: orgId,
          user_id: uid,
          shift_id: shiftId,
          day_of_week: day,
          created_by: adminProfile.id,
        })
      );
    });
    if (scheduleRows.length) {
      let ensured = 0;
      for (const row of scheduleRows) {
        const { error: schedErr } = await admin
          .from('schedules')
          .upsert([row], {
            onConflict: 'user_id,day_of_week',
            ignoreDuplicates: true,
          });
        if (schedErr) {
          add(
            'WARN: horario no asignado (día ' + row.day_of_week + '): ' + schedErr.message
          );
        } else {
          ensured++;
        }
      }
      add('Horarios (Lun-Vie) asegurados: ' + ensured + '/' + scheduleRows.length);
    }

    const { data: workspaces } = await admin
      .from('workspaces')
      .select('id')
      .eq('organization_id', orgId);
    let listId = null;
    if (!workspaces?.length) {
      const { data: wsRows } = await admin
        .from('workspaces')
        .insert({ organization_id: orgId, name: 'General', position: 0 })
        .select('id');
      const wsId = wsRows?.[0]?.id;
      if (wsId) {
        const { data: folderRows } = await admin
          .from('workspace_folders')
          .insert({ workspace_id: wsId, name: 'General', position: 0 })
          .select('id');
        const folderId = folderRows?.[0]?.id;
        if (folderId) {
          const { data: listRows } = await admin
            .from('task_lists')
            .insert({
              folder_id: folderId,
              workspace_id: wsId,
              organization_id: orgId,
              name: 'General',
              position: 0,
            })
            .select('id');
          listId = listRows?.[0]?.id || null;
          add('Estructura General creada');
        }
      }
    } else {
      const { data: listData } = await admin.from('task_lists').select('id');
      listId = listData?.[0]?.id || null;
    }

    const { data: tasks } = await admin
      .from('tasks')
      .select('id')
      .eq('organization_id', orgId);
    if (!tasks?.length) {
      const { data: taskRows } = await admin
        .from('tasks')
        .insert([
          {
            organization_id: orgId,
            title: 'Revisar reporte mensual',
            description: 'Revisar y validar datos del reporte de ventas',
            status: 'in_progress',
            priority: 'high',
            assigned_to: collabIds[0],
            created_by: adminProfile.id,
            shift_id: shiftMap['Mañana'],
            due_date: daysFromNow(2),
            estimated_hours: 4.0,
            position: 1,
            list_id: listId,
          },
          {
            organization_id: orgId,
            title: 'Diseñar presentación',
            description: 'Crear slides para reunión de stakeholders',
            status: 'todo',
            priority: 'medium',
            assigned_to: collabIds[1],
            created_by: adminProfile.id,
            shift_id: shiftMap['Tarde'],
            due_date: daysFromNow(4),
            estimated_hours: 3.0,
            position: 2,
            list_id: listId,
          },
          {
            organization_id: orgId,
            title: 'Actualizar base de datos',
            description: 'Migrar registros antiguos al nuevo formato',
            status: 'backlog',
            priority: 'low',
            assigned_to: collabIds[2],
            created_by: adminProfile.id,
            shift_id: shiftMap['Noche'],
            due_date: daysFromNow(7),
            estimated_hours: 8.0,
            position: 3,
            list_id: listId,
          },
          {
            organization_id: orgId,
            title: 'Capacitación onboarding',
            description: 'Preparar material para nuevos colaboradores',
            status: 'done',
            priority: 'high',
            assigned_to: collabIds[0],
            created_by: adminProfile.id,
            shift_id: shiftMap['Mañana'],
            due_date: daysFromNow(-1),
            estimated_hours: 6.0,
            position: 4,
            list_id: listId,
          },
          {
            organization_id: orgId,
            title: 'Auditoría de seguridad',
            description: 'Revisar logs y accesos del último trimestre',
            status: 'review',
            priority: 'urgent',
            assigned_to: collabIds[0],
            created_by: adminProfile.id,
            shift_id: shiftMap['Mañana'],
            due_date: daysFromNow(1),
            estimated_hours: 10.0,
            position: 5,
            list_id: listId,
          },
        ])
        .select('id');
      add('Tareas creadas: ' + (taskRows?.length || 0));

      if (taskRows?.length) {
        await admin.from('tasks').insert([
          {
            organization_id: orgId,
            parent_task_id: taskRows[4].id,
            title: 'Revisar logs de acceso',
            description: 'Analizar logs del sistema',
            status: 'in_progress',
            priority: 'high',
            assigned_to: collabIds[0],
            created_by: adminProfile.id,
            due_date: daysFromNow(1),
            estimated_hours: 4.0,
            position: 1,
            list_id: listId,
          },
          {
            organization_id: orgId,
            parent_task_id: taskRows[4].id,
            title: 'Verificar permisos de usuarios',
            description: 'Confirmar roles correctos',
            status: 'todo',
            priority: 'high',
            assigned_to: collabIds[0],
            created_by: adminProfile.id,
            due_date: daysFromNow(2),
            estimated_hours: 3.0,
            position: 2,
            list_id: listId,
          },
          {
            organization_id: orgId,
            parent_task_id: taskRows[4].id,
            title: 'Generar reporte final',
            description: 'Compilar hallazgos',
            status: 'backlog',
            priority: 'medium',
            assigned_to: collabIds[1],
            created_by: adminProfile.id,
            due_date: daysFromNow(3),
            estimated_hours: 3.0,
            position: 3,
            list_id: listId,
          },
        ]);
        add('Sub-tareas creadas');
      }

      if (taskRows?.length) {
        await admin.from('task_notes').insert([
          { task_id: taskRows[0].id, author_id: adminProfile.id, content: 'Recibí el reporte preliminar, empecemos la revisión.' },
          { task_id: taskRows[0].id, author_id: collabIds[0], content: 'Ya voy en la sección de gastos. Vi una discrepancia.' },
          { task_id: taskRows[0].id, author_id: adminProfile.id, content: 'Márcala para revisar mañana en la reunión.' },
          { task_id: taskRows[3].id, author_id: collabIds[0], content: 'Material listo. Adjunté los archivos en Drive.' },
          { task_id: taskRows[4].id, author_id: adminProfile.id, content: 'Urgente. Necesitamos resultados antes del viernes.' },
        ]);
        add('Notas creadas');
      }
    }

    const { data: timeData } = await admin
      .from('time_entries')
      .select('id')
      .eq('organization_id', orgId);
    if (!timeData?.length) {
      const { error: timeErr } = await admin.from('time_entries').insert([
        { user_id: collabIds[0], organization_id: orgId, date: daysFromNow(-4), hours: 8.0, type: 'worked' },
        { user_id: collabIds[0], organization_id: orgId, date: daysFromNow(-3), hours: 7.5, type: 'worked' },
        { user_id: collabIds[0], organization_id: orgId, date: daysFromNow(-2), hours: 9.0, type: 'worked' },
        { user_id: collabIds[0], organization_id: orgId, date: daysFromNow(-1), hours: 6.0, type: 'worked' },
        { user_id: collabIds[0], organization_id: orgId, date: daysFromNow(-1), hours: 2.0, type: 'overtime' },
        { user_id: collabIds[0], organization_id: orgId, date: daysFromNow(0), hours: 4.0, type: 'worked' },
      ]);
      if (timeErr) add('WARN: registro de horas no creado: ' + timeErr.message);
      else add('Registro de horas creado');
    }

    const { error: permErr } = await admin.from('permissions').insert({
      user_id: collabIds[0],
      organization_id: orgId,
      reason: 'Cita médica',
      date: daysFromNow(3),
      estimated_hours: 3.0,
      makeup_date: daysFromNow(5),
      status: 'pending',
    });
    if (permErr) add('WARN: permiso no creado: ' + permErr.message);
    else add('Permiso creado');

    const { error: inviteErr } = await admin.from('invitations').insert({
      organization_id: orgId,
      token: randomUUID(),
      created_by: adminProfile.id,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'pending',
      role: 'collaborator',
    });
    if (inviteErr) add('WARN: invitación no creada: ' + inviteErr.message);
    else add('Invitación creada');

    add('SEED COMPLETO. Colaboradores creados');
    add(
      'Credenciales owner: ' + OWNER_EMAIL + ' (pass: ' + OWNER_PASSWORD + ')'
    );
    const safeNames = collaborators.map((n) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    add(
      'Credenciales demo: ' +
        safeNames.map((n) => n.toLowerCase().replace(/\s/g, '.') + '@demo.com').join(' / ') +
        ' (pass: demo123456)'
    );
  } catch (err) {
    add('EXCEPTION: ' + (err instanceof Error ? err.message : String(err)));
  }

  console.log(log.join('\n'));
}

main();
