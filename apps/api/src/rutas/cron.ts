import { Hono } from 'hono';
import { getAdminClient } from '../lib/supabase/admin';
import { crearNotificaciones } from '../lib/notificaciones';
import {
  cuerpoRecordatorio,
  instanteEnZona,
  recordatorioPendiente,
} from '../lib/recordatorios';
import type { ReminderBefore } from '@erp/shared';

// Rutas para jobs programados (Render Cron). Se autentican con un secreto
// compartido por header, nunca con sesión de usuario.
export const rutasCron = new Hono();

rutasCron.use('/*', async (c, next) => {
  const secreto = process.env.CRON_SECRET;
  const recibido = c.req.header('x-cron-secret');
  if (!secreto || !recibido || recibido !== secreto) {
    return c.json({ error: 'No autorizado' }, 401);
  }
  await next();
});

interface TareaVencimiento {
  id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  assigned_to: string | null;
  created_by: string | null;
  organization_id: string;
}

interface PerfilRecordatorio {
  id: string;
  preferences: { reminder_before?: ReminderBefore } | null;
}

// POST /cron/recordatorios — crea notificaciones 'reminder' para tareas que
// entran en la ventana de aviso del destinatario (recordatorio_before).
// Deduplica por tarea + vencimiento (cuerpo), así reprogramar la fecha
// vuelve a avisar y el mismo vencimiento no se repite.
rutasCron.post('/recordatorios', async (c) => {
  const admin = getAdminClient();
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
  const hasta = new Date(ahora.getTime() + 2 * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);

  const { data: tareas, error } = await admin
    .from('tasks')
    .select(
      'id, title, due_date, due_time, assigned_to, created_by, organization_id',
    )
    .not('due_date', 'is', null)
    .gte('due_date', desde)
    .lte('due_date', hasta)
    .neq('status', 'done')
    .neq('status', 'cancelled')
    .limit(500)
    .returns<TareaVencimiento[]>();
  if (error) return c.json({ error: 'No se pudieron leer las tareas' }, 500);
  if (!tareas || tareas.length === 0) {
    return c.json({ revisadas: 0, enviadas: 0 });
  }

  const destinatarioDe = (t: TareaVencimiento) => t.assigned_to ?? t.created_by;
  const idsDestino = [
    ...new Set(tareas.map(destinatarioDe).filter((v): v is string => Boolean(v))),
  ];
  const [{ data: perfiles }, { data: ajustes }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, preferences')
      .in('id', idsDestino)
      .returns<PerfilRecordatorio[]>(),
    admin
      .from('org_settings')
      .select('organization_id, timezone')
      .in('organization_id', [
        ...new Set(tareas.map((t) => t.organization_id)),
      ]),
  ]);
  const prefsPorPerfil = new Map(
    (perfiles ?? []).map((p) => [p.id, p.preferences]),
  );
  const zonaPorOrg = new Map(
    (ajustes ?? []).map((a) => [
      a.organization_id as string,
      (a.timezone as string) || 'UTC',
    ]),
  );

  let revisadas = 0;
  let enviadas = 0;

  for (const tarea of tareas) {
    const destino = destinatarioDe(tarea);
    if (!destino) continue;
    const recordatorio =
      prefsPorPerfil.get(destino)?.reminder_before ?? 'none';
    if (recordatorio === 'none') continue;
    revisadas++;

    const zona = zonaPorOrg.get(tarea.organization_id) ?? 'UTC';
    const vence = instanteEnZona(
      tarea.due_date,
      (tarea.due_time ?? '09:00').slice(0, 5),
      zona,
    );
    if (!recordatorioPendiente(ahora, vence, recordatorio)) continue;

    const cuerpo = cuerpoRecordatorio(tarea.due_date, tarea.due_time);
    const { data: existente } = await admin
      .from('notifications')
      .select('id')
      .eq('type', 'reminder')
      .eq('reference_id', tarea.id)
      .eq('body', cuerpo)
      .limit(1)
      .maybeSingle();
    if (existente) continue;

    enviadas += await crearNotificaciones({
      destinatarioIds: [destino],
      tipo: 'reminder',
      pref: 'reminder',
      titulo: `Recordatorio: «${tarea.title}»`,
      cuerpo,
      referenciaTipo: 'task',
      referenciaId: tarea.id,
      telegram: `⏰ Recordatorio: «${tarea.title}» · ${cuerpo}`,
    });
  }

  return c.json({ revisadas, enviadas });
});
