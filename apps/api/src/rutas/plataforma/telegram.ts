import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import {
  CATEGORIAS_TELEGRAM,
  EVENTOS_TELEGRAM,
  zConfigTelegram,
  zEditarCategoriaTelegram,
  zEditarEventoTelegram,
  type ConfigTelegramPlataforma,
  type EnvioTelegram,
  type EventoTelegram,
  type NotificacionPlataforma,
} from '@erp/shared';
import { getAdminClient } from '../../lib/supabase/admin';
import type { ContextoUsuario } from '../../middleware/verificar-jwt';
import { paginacion, registrarAuditoria } from './comun';
import {
  cargarConfig,
  cambiarCategoria,
  enviarMensaje,
  invalidarTelegramCache,
} from '../../lib/telegram-plataforma';
import {
  activarWebhook,
  consultarBot,
  consultarWebhook,
  desactivarWebhook,
  sincronizarUpdates,
} from '../../lib/telegram-bot';

export const rutasTelegram = new Hono<{
  Variables: { usuario: ContextoUsuario };
}>();

function mascaraToken(token: string | null): string | null {
  if (!token) return null;
  return `••••••••${token.slice(-4)}`;
}

async function cargaConfigCompleta() {
  const config = await cargarConfig();
  const token = config.bot_token;

  const [botRes, webhookRes, { count: envios24 }, { count: fallos24 }, { data: ultimo }] =
    await Promise.all([
      token ? consultarBot(token) : Promise.resolve({ bot: null, error: null }),
      token ? consultarWebhook(token) : Promise.resolve({ estado: null, error: null }),
      getAdminClient()
        .from('platform_telegram_envios')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 86_400_000).toISOString()),
      getAdminClient()
        .from('platform_telegram_envios')
        .select('id', { count: 'exact', head: true })
        .eq('ok', false)
        .gte('created_at', new Date(Date.now() - 86_400_000).toISOString()),
      getAdminClient()
        .from('platform_telegram_envios')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const bot = botRes.bot;
  const webhook = webhookRes.estado;

  const data: ConfigTelegramPlataforma = {
    bot_token_mascara: mascaraToken(token),
    token_origen: config.token_origen,
    chat_destino: config.chat_destino,
    chat_etiqueta: config.chat_etiqueta,
    enabled: config.enabled,
    nivel_minimo: config.nivel_minimo,
    agrupar_errores_segundos: config.agrupar_errores_segundos,
    rate_limit_hora: config.rate_limit_hora,
    quiet_hours: config.quiet_hours,
    markdown: config.markdown,
    digest_activo: config.digest_activo,
    digest_hora: String(config.digest_hora).slice(0, 5),
    webhook_secret_configurado: Boolean(config.webhook_secret),
    updated_at: config.updated_at,
  };

  return {
    data,
    bot: {
      configurado: Boolean(bot),
      consulta_ok: Boolean(bot) && !botRes.error,
      id: bot?.id ?? null,
      username: bot?.username ?? null,
      nombre: bot?.nombre ?? null,
      puede_unirse_grupos: bot?.puede_unirse_grupos ?? null,
      lee_todos_los_grupos: bot?.lee_todos_los_grupos ?? null,
      soporta_inline: bot?.soporta_inline ?? null,
      error:
        botRes.error ??
        (!token ? 'Sin token configurado: pega uno o define TELEGRAM_BOT_TOKEN.' : null),
    },
    webhook: {
      activo: webhook?.activo ?? false,
      url: webhook?.url ?? null,
      pendientes: webhook?.pendientes ?? 0,
      ultimo_error: webhook?.ultimo_error ?? null,
      consulta_error: webhookRes.error,
    },
    salud: {
      envios_24h: envios24 ?? 0,
      fallos_24h: fallos24 ?? 0,
      ultimo_envio: (ultimo?.created_at as string | undefined) ?? null,
    },
  };
}

// GET /plataforma/telegram/config — config + estado del bot/webhook/salud.
rutasTelegram.get('/config', async (c) => {
  return c.json(await cargaConfigCompleta());
});

// PUT /plataforma/telegram/config — guarda la config (token opcional).
rutasTelegram.put('/config', async (c) => {
  const body = zConfigTelegram.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Configuración inválida' }, 400);

  const cambios: Record<string, unknown> = {
    ...body.data,
    updated_at: new Date().toISOString(),
    updated_by: c.get('usuario').id,
  };
  for (const clave of Object.keys(cambios)) {
    if (cambios[clave] === undefined) delete cambios[clave];
  }

  const { error } = await getAdminClient()
    .from('platform_telegram_config')
    .update(cambios)
    .eq('id', 1);
  if (error) return c.json({ error: 'No se pudo guardar la configuración' }, 500);

  invalidarTelegramCache();
  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'telegram.config',
    entidadTipo: 'platform_telegram_config',
    entidadId: '1',
    payload: { enabled: body.data.enabled, chat_destino: body.data.chat_destino },
  });

  return c.json(await cargaConfigCompleta());
});

// POST /plataforma/telegram/config/probar — valida el token con getMe.
// Prueba el token enviado; si no viene, el efectivo (BD → entorno).
// Siempre responde 200 con el detalle exacto para diagnóstico.
rutasTelegram.post('/config/probar', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { bot_token?: string };
  const config = await cargarConfig();
  const enviado = body.bot_token?.trim() || null;
  const token = enviado ?? config.bot_token;
  if (!token) {
    return c.json(
      {
        ok: false,
        bot: null,
        error: 'Sin token configurado: pega uno o define TELEGRAM_BOT_TOKEN.',
        token_origen: config.token_origen,
        es_token_guardado: false,
      },
      200
    );
  }

  const resultado = await consultarBot(token);
  return c.json({
    ok: Boolean(resultado.bot),
    bot: resultado.bot,
    error: resultado.error,
    token_origen: config.token_origen,
    es_token_guardado: token === config.bot_token,
  });
});

// POST /plataforma/telegram/webhook — activa el webhook con secret.
rutasTelegram.post('/webhook', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { base_url?: string };
  const base = (body.base_url ?? process.env.API_PUBLIC_URL ?? '').replace(/\/+$/, '');
  if (!base.startsWith('https://')) {
    return c.json({ error: 'La URL debe ser HTTPS pública' }, 400);
  }

  const config = await cargarConfig();
  if (!config.bot_token) return c.json({ error: 'No hay token configurado' }, 400);

  const secret = config.webhook_secret ?? randomBytes(24).toString('hex');
  const url = `${base}/plataforma/telegram/webhook/${secret}`;
  const res = await activarWebhook(config.bot_token, url, secret);
  if (!res.ok) return c.json({ error: res.error ?? 'No se pudo activar el webhook' }, 502);

  if (!config.webhook_secret) {
    await getAdminClient()
      .from('platform_telegram_config')
      .update({ webhook_secret: secret, updated_at: new Date().toISOString() })
      .eq('id', 1);
    invalidarTelegramCache();
  }

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'telegram.webhook_activar',
    entidadTipo: 'platform_telegram_config',
    entidadId: '1',
    payload: { url },
  });

  const consulta = await consultarWebhook(config.bot_token);
  return c.json({ ok: true, webhook: consulta.estado, webhook_error: consulta.error });
});

// DELETE /plataforma/telegram/webhook
rutasTelegram.delete('/webhook', async (c) => {
  const config = await cargarConfig();
  if (!config.bot_token) return c.json({ error: 'No hay token configurado' }, 400);
  const res = await desactivarWebhook(config.bot_token);
  if (!res.ok) return c.json({ error: res.error ?? 'No se pudo desactivar' }, 502);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'telegram.webhook_desactivar',
    entidadTipo: 'platform_telegram_config',
    entidadId: '1',
  });
  return c.json({ ok: true });
});

// POST /plataforma/telegram/sincronizar — polling manual (dev/respaldo).
rutasTelegram.post('/sincronizar', async (c) => {
  const resultado = await sincronizarUpdates();
  if (!resultado) return c.json({ error: 'No hay token configurado' }, 400);
  return c.json({ ok: true, ...resultado });
});

// GET /plataforma/telegram/eventos — catálogo + estado por evento.
rutasTelegram.get('/eventos', async (c) => {
  const admin = getAdminClient();
  const { data } = await admin.from('platform_telegram_eventos').select('*');
  const filas = new Map(
    ((data ?? []) as { evento: string; habilitado: boolean; plantilla: string; orden: number }[]).map(
      (f) => [f.evento, f]
    )
  );

  const faltantes = EVENTOS_TELEGRAM.filter((def) => !filas.has(def.evento));
  if (faltantes.length > 0) {
    await admin.from('platform_telegram_eventos').upsert(
      faltantes.map((def) => ({
        evento: def.evento,
        categoria: def.categoria,
        habilitado: true,
        plantilla: def.plantilla,
        orden: EVENTOS_TELEGRAM.findIndex((e) => e.evento === def.evento) + 1,
      })),
      { onConflict: 'evento' }
    );
    invalidarTelegramCache();
  }

  const eventos: EventoTelegram[] = EVENTOS_TELEGRAM.map((def, indice) => {
    const fila = filas.get(def.evento);
    return {
      ...def,
      habilitado: fila?.habilitado ?? true,
      plantilla: fila?.plantilla ?? def.plantilla,
      orden: fila?.orden ?? indice + 1,
    };
  });

  return c.json({ data: eventos, categorias: CATEGORIAS_TELEGRAM });
});

// PUT /plataforma/telegram/eventos/:evento — toggle y/o plantilla.
rutasTelegram.put('/eventos/:evento', async (c) => {
  const evento = c.req.param('evento');
  const def = EVENTOS_TELEGRAM.find((e) => e.evento === evento);
  if (!def) return c.json({ error: 'Evento desconocido' }, 404);

  const body = zEditarEventoTelegram.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const existente = await getAdminClient()
    .from('platform_telegram_eventos')
    .select('habilitado, plantilla')
    .eq('evento', evento)
    .maybeSingle();

  const { data, error } = await getAdminClient()
    .from('platform_telegram_eventos')
    .upsert(
      {
        evento,
        categoria: def.categoria,
        habilitado: body.data.habilitado ?? existente.data?.habilitado ?? true,
        plantilla: body.data.plantilla ?? existente.data?.plantilla ?? def.plantilla,
        orden: EVENTOS_TELEGRAM.findIndex((e) => e.evento === evento) + 1,
      },
      { onConflict: 'evento' }
    )
    .select('*')
    .single();
  if (error || !data) return c.json({ error: 'No se pudo guardar el evento' }, 500);

  invalidarTelegramCache();
  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'telegram.evento',
    entidadTipo: 'platform_telegram_evento',
    entidadId: evento,
    payload: { habilitado: data.habilitado },
  });

  return c.json({ data });
});

// POST /plataforma/telegram/eventos/:evento/restaurar — plantilla original.
rutasTelegram.post('/eventos/:evento/restaurar', async (c) => {
  const evento = c.req.param('evento');
  const def = EVENTOS_TELEGRAM.find((e) => e.evento === evento);
  if (!def) return c.json({ error: 'Evento desconocido' }, 404);

  const { data, error } = await getAdminClient()
    .from('platform_telegram_eventos')
    .upsert(
      {
        evento,
        categoria: def.categoria,
        habilitado: true,
        plantilla: def.plantilla,
        orden: EVENTOS_TELEGRAM.findIndex((e) => e.evento === evento) + 1,
      },
      { onConflict: 'evento' }
    )
    .select('*')
    .single();
  if (error || !data) return c.json({ error: 'No se pudo restaurar' }, 500);

  invalidarTelegramCache();
  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'telegram.evento_restaurar',
    entidadTipo: 'platform_telegram_evento',
    entidadId: evento,
  });
  return c.json({ data });
});

// PUT /plataforma/telegram/eventos — toggle por categoría completa.
rutasTelegram.put('/eventos', async (c) => {
  const body = zEditarCategoriaTelegram.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const categoria = CATEGORIAS_TELEGRAM.find((cat) => cat.id === body.data.categoria);
  if (!categoria) return c.json({ error: 'Categoría desconocida' }, 404);

  const resultado = await cambiarCategoria(categoria.id, body.data.habilitado);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'telegram.categoria',
    entidadTipo: 'platform_telegram_categoria',
    entidadId: categoria.id,
    payload: { habilitado: body.data.habilitado },
  });
  return c.json({ ok: true, ...resultado });
});

// GET /plataforma/telegram/envios — historial de entregas.
rutasTelegram.get('/envios', async (c) => {
  const { evento, estado } = c.req.query();
  const { desde, hasta, page, pageSize } = paginacion(c.req.query());

  let consulta = getAdminClient()
    .from('platform_telegram_envios')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(desde, hasta);
  if (evento) consulta = consulta.eq('evento', evento);
  if (estado === 'ok') consulta = consulta.eq('ok', true);
  if (estado === 'fallo') consulta = consulta.eq('ok', false);

  const { data, count, error } = await consulta;
  if (error) return c.json({ error: 'No se pudo cargar el historial' }, 500);
  return c.json({ data: (data ?? []) as EnvioTelegram[], total: count ?? 0, page, pageSize });
});

// POST /plataforma/telegram/envios/probar — mensaje de prueba al destino.
rutasTelegram.post('/envios/probar', async (c) => {
  const config = await cargarConfig();
  const body = (await c.req.json().catch(() => ({}))) as { chat_destino?: string };
  const destino = body.chat_destino?.trim() || config.chat_destino;
  if (!config.bot_token) return c.json({ error: 'No hay token configurado' }, 400);
  if (!destino) return c.json({ error: 'No hay destino configurado' }, 400);

  const texto = '🔔 Prueba de Telegram — panel de plataforma';
  const envio = await enviarMensaje(config.bot_token, destino, texto, config.markdown);
  await getAdminClient().from('platform_telegram_envios').insert({
    evento: 'prueba',
    chat: destino,
    ok: envio.ok,
    status_code: envio.status,
    error: envio.error,
    texto,
  });
  if (!envio.ok) return c.json({ error: envio.error ?? 'No se pudo enviar la prueba' }, 502);
  return c.json({ ok: true });
});

// ---- Campana in-app ----

// GET /plataforma/telegram/notificaciones — últimas + no leídas.
rutasTelegram.get('/notificaciones', async (c) => {
  const admin = getAdminClient();
  const adminId = c.get('usuario').id;
  const limite = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 30) || 30));

  const { data, error } = await admin
    .from('platform_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) return c.json({ error: 'No se pudieron cargar las notificaciones' }, 500);

  const ids = (data ?? []).map((n) => n.id as number);
  const { data: leidas } = ids.length
    ? await admin
        .from('platform_notification_reads')
        .select('notification_id')
        .eq('admin_id', adminId)
        .in('notification_id', ids)
    : { data: [] };
  const leidasSet = new Set((leidas ?? []).map((r) => r.notification_id as number));

  const noLeidas = (data ?? []).filter((n) => !leidasSet.has(n.id as number)).length;

  const notificaciones: NotificacionPlataforma[] = (data ?? []).map((n) => ({
    id: n.id as number,
    evento: n.evento as string,
    titulo: n.titulo as string,
    cuerpo: (n.cuerpo as string | null) ?? null,
    entidad_tipo: (n.entidad_tipo as string | null) ?? null,
    entidad_id: (n.entidad_id as string | null) ?? null,
    leida: leidasSet.has(n.id as number),
    created_at: n.created_at as string,
  }));

  return c.json({ data: notificaciones, no_leidas: noLeidas });
});

// POST /plataforma/telegram/notificaciones/leer — marca leídas (todas o ids).
rutasTelegram.post('/notificaciones/leer', async (c) => {
  const admin = getAdminClient();
  const adminId = c.get('usuario').id;
  const body = (await c.req.json().catch(() => ({}))) as { ids?: number[] };

  let ids = body.ids?.filter((id) => Number.isInteger(id)) ?? [];
  if (ids.length === 0) {
    const { data } = await admin
      .from('platform_notifications')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(200);
    ids = (data ?? []).map((n) => n.id as number);
  }
  if (ids.length === 0) return c.json({ ok: true, marcadas: 0 });

  await admin
    .from('platform_notification_reads')
    .upsert(
      ids.map((id) => ({ admin_id: adminId, notification_id: id })),
      { onConflict: 'admin_id,notification_id' }
    );
  return c.json({ ok: true, marcadas: ids.length });
});

// POST /plataforma/telegram/notificaciones/:id/leer
rutasTelegram.post('/notificaciones/:id/leer', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id)) return c.json({ error: 'ID inválido' }, 400);

  await getAdminClient()
    .from('platform_notification_reads')
    .upsert(
      { admin_id: c.get('usuario').id, notification_id: id },
      { onConflict: 'admin_id,notification_id' }
    );
  return c.json({ ok: true });
});
