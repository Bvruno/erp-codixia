import { Hono } from 'hono';
import { getAdminClient } from '../lib/supabase/admin';
import { crearNotificaciones } from '../lib/notificaciones';
import {
  cuerpoRecordatorio,
  instanteEnZona,
  recordatorioPendiente,
} from '../lib/recordatorios';
import { cargarConfig, emitirEvento, horaEnZona } from '../lib/telegram-plataforma';
import { sincronizarUpdates } from '../lib/telegram-bot';
import { calcularEstadisticas } from './plataforma/estadisticas';
import { ZONA_HORARIA_DEFAULT, type ReminderBefore } from '@erp/shared';

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

// POST /cron/plataforma — polling del bot + avisos programados.
// Pensado para un Render Cron cada 15 min (mismo CRON_SECRET).
rutasCron.post('/plataforma', async (c) => {
  const admin = getAdminClient();
  const resultados: Record<string, unknown> = {};
  const config = await cargarConfig();

  // 1) Polling de Telegram (solo si no hay webhook configurado).
  if (config.bot_token && !config.webhook_secret) {
    resultados.polling = await sincronizarUpdates();
  }

  const DIAS_7 = 7 * 86_400_000;
  const VENTANA_CRON = Math.floor(DIAS_7 / 1000);
  const mesActual = new Date().toISOString().slice(0, 8) + '01';

  // 2) Facturas pendientes de periodos anteriores.
  const { data: facturas } = await admin
    .from('billing_records')
    .select('id, periodo, monto, moneda, organization_id, organizations(name)')
    .eq('estado', 'pendiente')
    .lt('periodo', mesActual)
    .limit(50);
  let facturasVencidas = 0;
  for (const f of facturas ?? []) {
    const org = f.organizations as { name?: string } | null;
    void emitirEvento(
      'factura_vencida',
      {
        empresa: org?.name ?? f.organization_id,
        periodo: String(f.periodo),
        monto: Number(f.monto),
        moneda: f.moneda,
      },
      {
        entidadTipo: 'billing_record',
        entidadId: String(f.id),
        referencia: `factura_vencida:${f.id}:${String(f.periodo).slice(0, 7)}`,
        ventanaDedupeSegundos: VENTANA_CRON,
      }
    );
    facturasVencidas++;
  }
  resultados.facturas_vencidas = facturasVencidas;

  // 3) Empresas sin owner tras 7 días.
  const hace7 = new Date(Date.now() - DIAS_7).toISOString();
  const { data: sinOwner } = await admin
    .from('organizations')
    .select('id, name, created_at')
    .is('owner_id', null)
    .lt('created_at', hace7)
    .limit(50);
  for (const org of sinOwner ?? []) {
    void emitirEvento(
      'empresa_sin_owner',
      { empresa: org.name, creada: String(org.created_at).slice(0, 10) },
      {
        entidadTipo: 'organization',
        entidadId: org.id,
        referencia: `sin_owner:${org.id}`,
        ventanaDedupeSegundos: VENTANA_CRON,
      }
    );
  }
  resultados.sin_owner = (sinOwner ?? []).length;

  // 4) Owners inactivos 30 días (empresas activas con dueño).
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: activas } = await admin
    .from('organizations')
    .select('id, name, owner_id')
    .eq('status', 'activa')
    .not('owner_id', 'is', null)
    .limit(500);
  const ownerIds = [...new Set((activas ?? []).map((o) => o.owner_id as string))];
  const { data: owners } = ownerIds.length
    ? await admin.from('profiles').select('id, full_name, last_active_at').in('id', ownerIds)
    : { data: [] };
  const porOwner = new Map(
    (owners ?? []).map((p) => [p.id as string, p as { full_name: string; last_active_at: string | null }])
  );
  let inactivos = 0;
  for (const org of activas ?? []) {
    const owner = porOwner.get(org.owner_id as string);
    if (!owner) continue;
    if (owner.last_active_at && owner.last_active_at >= hace30) continue;
    inactivos++;
    void emitirEvento(
      'owner_inactivo',
      {
        empresa: org.name,
        owner: owner.full_name,
        ultima_actividad: owner.last_active_at?.slice(0, 10) ?? 'nunca',
      },
      {
        entidadTipo: 'organization',
        entidadId: org.id,
        referencia: `owner_inactivo:${org.id}:${mesActual.slice(0, 7)}`,
        ventanaDedupeSegundos: VENTANA_CRON,
      }
    );
  }
  resultados.owners_inactivos = inactivos;

  // 5) Límite de miembros del plan alcanzado.
  const { data: planes } = await admin.from('plans').select('id, nombre, limites');
  const planesPorId = new Map(
    (planes ?? []).map((p) => [
      p.id as string,
      { nombre: p.nombre as string, limite: Number((p.limites as { miembros?: number } | null)?.miembros ?? 0) },
    ])
  );
  const { data: orgsPlan } = await admin
    .from('organizations')
    .select('id, name, plan_id')
    .not('plan_id', 'is', null)
    .limit(500);
  const idsPlan = (orgsPlan ?? []).map((o) => o.id as string);
  const { data: miembrosOrg } = idsPlan.length
    ? await admin.from('profiles').select('organization_id').in('organization_id', idsPlan).limit(20_000)
    : { data: [] };
  const conteo = new Map<string, number>();
  for (const p of miembrosOrg ?? []) {
    const orgId = p.organization_id as string;
    conteo.set(orgId, (conteo.get(orgId) ?? 0) + 1);
  }
  let limites = 0;
  for (const org of orgsPlan ?? []) {
    const plan = planesPorId.get(org.plan_id as string);
    if (!plan || plan.limite <= 0) continue;
    const total = conteo.get(org.id as string) ?? 0;
    if (total < plan.limite) continue;
    limites++;
    void emitirEvento(
      'uso_limite_plan',
      { empresa: org.name, miembros: total, limite: plan.limite, plan: plan.nombre },
      {
        entidadTipo: 'organization',
        entidadId: org.id,
        referencia: `limite:${org.id}:${mesActual.slice(0, 7)}`,
        ventanaDedupeSegundos: VENTANA_CRON,
      }
    );
  }
  resultados.limites_alcanzados = limites;

  // 6) Resumen diario (hora configurada, una vez al día).
  if (config.digest_activo && config.bot_token && config.chat_destino) {
    const [horaActual, minutoActual] = horaEnZona(ZONA_HORARIA_DEFAULT)
      .split(':')
      .map(Number);
    const horaObjetivo = Number(String(config.digest_hora).slice(0, 2));
    if (horaActual === horaObjetivo && minutoActual < 15) {
      const { data: yaEnviado } = await admin
        .from('platform_telegram_envios')
        .select('id')
        .eq('evento', 'resumen_diario')
        .gte('created_at', new Date(Date.now() - 20 * 3_600_000).toISOString())
        .limit(1)
        .maybeSingle();
      if (!yaEnviado) {
        const [stats, { count: erroresAbiertos }, { count: facturasPendientes }] =
          await Promise.all([
            calcularEstadisticas(),
            admin
              .from('error_logs')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'open'),
            admin
              .from('billing_records')
              .select('id', { count: 'exact', head: true })
              .eq('estado', 'pendiente'),
          ]);
        void emitirEvento('resumen_diario', {
          solicitudes_pendientes: stats.solicitudes.pendiente + stats.solicitudes.en_revision,
          empresas_activas: stats.empresas.activas,
          empresas_suspendidas: stats.empresas.suspendidas,
          empresas_nuevas_30d: stats.empresas.nuevas_30d,
          errores_abiertos: erroresAbiertos ?? 0,
          facturas_pendientes: facturasPendientes ?? 0,
          mrr: stats.mrr_estimado,
        });
        resultados.resumen_diario = 'enviado';
      } else {
        resultados.resumen_diario = 'ya enviado';
      }
    }
  }

  return c.json(resultados);
});
