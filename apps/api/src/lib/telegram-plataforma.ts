import {
  ZONA_HORARIA_DEFAULT,
  definicionEvento,
  horaEnZona,
  renderPlantilla,
  EVENTOS_TELEGRAM,
  type CategoriaTelegram,
} from '@erp/shared';
import { getAdminClient } from './supabase/admin';

// `horaEnZona` vive en shared (la comparte el panel) y se re-exporta aquí
// para no duplicar el helper.
export { horaEnZona };

// Núcleo del Telegram de la plataforma: emite eventos (campana in-app +
// mensaje al destino único), con nivel mínimo, agrupación de errores,
// horario de silencio y rate limit. Nunca lanza: la operación que emite
// jamás se rompe por un fallo de Telegram.

export interface FilaConfigTelegram {
  bot_token: string | null;
  token_origen: 'bd' | 'entorno' | 'ninguno';
  chat_destino: string | null;
  chat_etiqueta: string | null;
  enabled: boolean;
  nivel_minimo: 'warning' | 'error';
  agrupar_errores_segundos: number;
  rate_limit_hora: number;
  quiet_hours: { activo: boolean; desde: string; hasta: string };
  markdown: boolean;
  digest_activo: boolean;
  digest_hora: string;
  webhook_secret: string | null;
  update_offset: number;
  updated_at: string | null;
}

export interface FilaEventoTelegram {
  evento: string;
  categoria: string;
  habilitado: boolean;
  plantilla: string;
  orden: number;
}

const CONFIG_POR_DEFECTO: FilaConfigTelegram = {
  bot_token: null,
  token_origen: 'ninguno',
  chat_destino: null,
  chat_etiqueta: null,
  enabled: true,
  nivel_minimo: 'error',
  agrupar_errores_segundos: 300,
  rate_limit_hora: 30,
  quiet_hours: { activo: false, desde: '22:00', hasta: '08:00' },
  markdown: true,
  digest_activo: true,
  digest_hora: '09:00',
  webhook_secret: null,
  update_offset: 0,
  updated_at: null,
};

const CACHE_MS = 30_000;
let cacheConfig: { valor: FilaConfigTelegram; expira: number } | null = null;
let cacheEventos: { valor: Map<string, FilaEventoTelegram>; expira: number } | null = null;

export function invalidarTelegramCache(): void {
  cacheConfig = null;
  cacheEventos = null;
}

/** Config efectiva: fila única + fallback al entorno (bootstrap). */
export async function cargarConfig(): Promise<FilaConfigTelegram> {
  const ahora = Date.now();
  if (cacheConfig && cacheConfig.expira > ahora) return cacheConfig.valor;

  const { data } = await getAdminClient()
    .from('platform_telegram_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  const fila = (data ?? {}) as Partial<FilaConfigTelegram>;
  const tokenBd = fila.bot_token ?? null;
  const tokenEnv = process.env.TELEGRAM_BOT_TOKEN ?? null;
  const valor: FilaConfigTelegram = {
    ...CONFIG_POR_DEFECTO,
    ...fila,
    quiet_hours: {
      ...CONFIG_POR_DEFECTO.quiet_hours,
      ...(fila.quiet_hours ?? {}),
    },
    bot_token: tokenBd ?? tokenEnv,
    token_origen: tokenBd ? 'bd' : tokenEnv ? 'entorno' : 'ninguno',
    chat_destino: fila.chat_destino ?? process.env.TELEGRAM_CHAT_ID ?? null,
    update_offset: Number(fila.update_offset ?? 0) || 0,
  };
  cacheConfig = { valor, expira: ahora + CACHE_MS };
  return valor;
}

async function cargarEventos(): Promise<Map<string, FilaEventoTelegram>> {
  const ahora = Date.now();
  if (cacheEventos && cacheEventos.expira > ahora) return cacheEventos.valor;

  const { data } = await getAdminClient()
    .from('platform_telegram_eventos')
    .select('evento, categoria, habilitado, plantilla, orden');
  const mapa = new Map<string, FilaEventoTelegram>(
    ((data ?? []) as FilaEventoTelegram[]).map((f) => [f.evento, f])
  );
  cacheEventos = { valor: mapa, expira: ahora + CACHE_MS };
  return mapa;
}

/** Devuelve la fila del evento; si falta en BD usa la definición del catálogo. */
export async function cargarEvento(evento: string): Promise<FilaEventoTelegram | null> {
  const def = definicionEvento(evento);
  if (!def) return null;
  const filas = await cargarEventos();
  return (
    filas.get(evento) ?? {
      evento,
      categoria: def.categoria,
      habilitado: true,
      plantilla: def.plantilla,
      orden: EVENTOS_TELEGRAM.findIndex((e) => e.evento === evento) + 1,
    }
  );
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function enHorarioSilencio(
  quiet: FilaConfigTelegram['quiet_hours'],
  fecha = new Date()
): boolean {
  if (!quiet?.activo) return false;
  const ahora = minutos(horaEnZona(ZONA_HORARIA_DEFAULT, fecha));
  const desde = minutos(quiet.desde || '22:00');
  const hasta = minutos(quiet.hasta || '08:00');
  if (desde === hasta) return false;
  return desde < hasta ? ahora >= desde && ahora < hasta : ahora >= desde || ahora < hasta;
}

export interface ResultadoEnvio {
  ok: boolean;
  status: number;
  error: string | null;
}

/** Envía un mensaje con timeout y un reintento en 429 (espera acotada). */
export async function enviarMensaje(
  botToken: string,
  chat: string,
  texto: string,
  markdown = true,
  intento = 0
): Promise<ResultadoEnvio> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: texto,
        disable_web_page_preview: true,
        ...(markdown ? { parse_mode: 'Markdown' } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) return { ok: true, status: res.status, error: null };

    const cuerpo = (await res.json().catch(() => ({}))) as {
      description?: string;
      parameters?: { retry_after?: number };
    };
    const retryAfter = cuerpo.parameters?.retry_after ?? 0;
    if (res.status === 429 && intento === 0 && retryAfter > 0 && retryAfter <= 5) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return enviarMensaje(botToken, chat, texto, markdown, 1);
    }
    return { ok: false, status: res.status, error: cuerpo.description ?? 'Error de Telegram' };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'Error de red' };
  }
}

export interface OpcionesEvento {
  entidadTipo?: string | null;
  entidadId?: string | null;
  /** Clave de deduplicación (p. ej. `factura:<id>:<periodo>`). */
  referencia?: string | null;
  /** Ventana de dedupe en segundos; por defecto la de agrupación de errores. */
  ventanaDedupeSegundos?: number;
  /** Nivel del error para `error_nuevo` (warning|error). */
  nivel?: 'warning' | 'error';
}

/**
 * Emite un evento de plataforma: campana in-app (si el evento está
 * habilitado) + mensaje a Telegram (si la config está activa y pasa los
 * filtros). Siempre best-effort.
 */
export async function emitirEvento(
  evento: string,
  variables: Record<string, unknown>,
  opciones: OpcionesEvento = {}
): Promise<void> {
  try {
    const def = definicionEvento(evento);
    if (!def) return;

    const [config, fila] = await Promise.all([cargarConfig(), cargarEvento(evento)]);
    if (!fila) return;

    const { texto } = renderPlantilla(fila.plantilla, variables);

    if (fila.habilitado) {
      await getAdminClient().from('platform_notifications').insert({
        evento,
        titulo: def.etiqueta,
        cuerpo: texto || null,
        entidad_tipo: opciones.entidadTipo ?? null,
        entidad_id: opciones.entidadId ?? null,
      });
    }

    if (!config.enabled || !config.bot_token || !config.chat_destino) return;
    if (!texto) return;

    if (
      evento === 'error_nuevo' &&
      opciones.nivel === 'warning' &&
      config.nivel_minimo === 'error'
    ) {
      return;
    }

    const canal = getAdminClient();

    const ventana =
      opciones.ventanaDedupeSegundos ??
      (evento === 'error_nuevo' ? config.agrupar_errores_segundos : 0);
    if (ventana > 0 && opciones.referencia) {
      const desde = new Date(Date.now() - ventana * 1000).toISOString();
      const { data: repetido } = await canal
        .from('platform_telegram_envios')
        .select('id')
        .eq('referencia', opciones.referencia)
        .gte('created_at', desde)
        .limit(1)
        .maybeSingle();
      if (repetido) return;
    }

    // Errores críticos ignoran el silencio nocturno; el resto no.
    const critico = evento === 'error_nuevo' && opciones.nivel === 'error';
    if (!critico && enHorarioSilencio(config.quiet_hours)) return;

    const desdeHora = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await canal
      .from('platform_telegram_envios')
      .select('id', { count: 'exact', head: true })
      .eq('ok', true)
      .gte('created_at', desdeHora);
    if ((count ?? 0) >= config.rate_limit_hora) return;

    const envio = await enviarMensaje(
      config.bot_token,
      config.chat_destino,
      texto,
      config.markdown
    );

    await canal.from('platform_telegram_envios').insert({
      evento,
      chat: config.chat_destino,
      ok: envio.ok,
      status_code: envio.status,
      error: envio.error,
      texto,
      referencia: opciones.referencia ?? null,
    });
  } catch {
    // Best-effort: nunca rompe la operación que emite.
  }
}

export interface ResultadoBulk {
  actualizados: number;
}

/** Emite `error_nuevo` a la plataforma a partir de un error capturado. */
export async function emitirErrorPlataforma(datos: {
  id?: string | null;
  source: string;
  level?: string | null;
  message: string;
  name?: string | null;
  route?: string | null;
  organizationId?: string | null;
  veces?: number;
}): Promise<void> {
  let empresa: string | null = null;
  if (datos.organizationId) {
    const { data } = await getAdminClient()
      .from('organizations')
      .select('name')
      .eq('id', datos.organizationId)
      .maybeSingle();
    empresa = (data?.name as string | undefined) ?? null;
  }

  await emitirEvento(
    'error_nuevo',
    {
      origen: datos.name ? `${datos.source} · ${datos.name}` : datos.source,
      mensaje: datos.message.slice(0, 300),
      ruta: datos.route ?? '—',
      empresa: empresa ?? '—',
      veces: datos.veces ?? 1,
    },
    {
      entidadTipo: 'error_log',
      entidadId: datos.id ?? null,
      referencia: datos.id ?? null,
      nivel: datos.level === 'warning' ? 'warning' : 'error',
    }
  );
}

/** Activa/desactiva todos los eventos de una categoría sin tocar plantillas. */
export async function cambiarCategoria(
  categoria: CategoriaTelegram,
  habilitado: boolean
): Promise<ResultadoBulk> {
  const definiciones = EVENTOS_TELEGRAM.filter((e) => e.categoria === categoria);
  const admin = getAdminClient();
  const filas = await cargarEventos();
  let actualizados = 0;
  for (const def of definiciones) {
    const { error } = await admin.from('platform_telegram_eventos').upsert(
      {
        evento: def.evento,
        categoria: def.categoria,
        habilitado,
        plantilla: filas.get(def.evento)?.plantilla ?? def.plantilla,
        orden: EVENTOS_TELEGRAM.findIndex((e) => e.evento === def.evento) + 1,
      },
      { onConflict: 'evento' }
    );
    if (!error) actualizados++;
  }
  invalidarTelegramCache();
  return { actualizados };
}
