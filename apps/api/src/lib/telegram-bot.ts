import { getAdminClient } from './supabase/admin';
import { cargarConfig, enviarMensaje, invalidarTelegramCache } from './telegram-plataforma';

// Cliente mínimo del bot de plataforma: información, webhook, getUpdates
// (modo polling para dev/respaldo) y comandos entrantes. El único comando
// con efecto es /start|/id: vincula el destino si aún no hay uno.

export interface InfoBot {
  id: number;
  username: string | null;
  nombre: string | null;
  puede_unirse_grupos: boolean | null;
  lee_todos_los_grupos: boolean | null;
  soporta_inline: boolean | null;
}

export interface EstadoWebhook {
  activo: boolean;
  url: string | null;
  pendientes: number;
  ultimo_error: string | null;
}

/** Resultado de una consulta con la descripción exacta del error. */
export interface RespuestaBot {
  bot: InfoBot | null;
  error: string | null;
}

export interface RespuestaWebhook {
  estado: EstadoWebhook | null;
  error: string | null;
}

export interface MensajeTelegram {
  message_id: number;
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    first_name?: string;
  };
  text?: string;
}

export interface UpdateTelegram {
  update_id: number;
  message?: MensajeTelegram;
}

async function llamarBot<T>(
  token: string,
  metodo: string,
  cuerpo?: Record<string, unknown>
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };
    if (!res.ok || json.ok === false) {
      return { ok: false, data: null, error: json.description ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: (json.result ?? null) as T | null, error: null };
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : 'Error de red' };
  }
}

/** Consulta getMe y devuelve el bot o la descripción exacta del error. */
export async function consultarBot(token: string): Promise<RespuestaBot> {
  const res = await llamarBot<{
    id: number;
    username?: string;
    first_name?: string;
    can_join_groups?: boolean;
    can_read_all_group_messages?: boolean;
    supports_inline_queries?: boolean;
  }>(token, 'getMe');
  if (!res.ok || !res.data) return { bot: null, error: res.error ?? 'Respuesta vacía de Telegram' };
  return {
    bot: {
      id: res.data.id,
      username: res.data.username ?? null,
      nombre: res.data.first_name ?? null,
      puede_unirse_grupos: res.data.can_join_groups ?? null,
      lee_todos_los_grupos: res.data.can_read_all_group_messages ?? null,
      soporta_inline: res.data.supports_inline_queries ?? null,
    },
    error: null,
  };
}

export async function obtenerInfoBot(token: string): Promise<InfoBot | null> {
  return (await consultarBot(token)).bot;
}

/** Consulta getWebhookInfo con la descripción exacta del error. */
export async function consultarWebhook(token: string): Promise<RespuestaWebhook> {
  const res = await llamarBot<{
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
  }>(token, 'getWebhookInfo');
  if (!res.ok || !res.data) {
    return { estado: null, error: res.error ?? 'Respuesta vacía de Telegram' };
  }
  return {
    estado: {
      activo: Boolean(res.data.url),
      url: res.data.url || null,
      pendientes: res.data.pending_update_count ?? 0,
      ultimo_error: res.data.last_error_message ?? null,
    },
    error: null,
  };
}

export async function estadoWebhook(token: string): Promise<EstadoWebhook | null> {
  return (await consultarWebhook(token)).estado;
}

export async function activarWebhook(
  token: string,
  url: string,
  secret: string
): Promise<{ ok: boolean; error: string | null }> {
  const res = await llamarBot(token, 'setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
  });
  return { ok: res.ok, error: res.error };
}

export async function desactivarWebhook(token: string): Promise<{ ok: boolean; error: string | null }> {
  const res = await llamarBot(token, 'deleteWebhook', { drop_pending_updates: false });
  return { ok: res.ok, error: res.error };
}

export async function obtenerUpdates(token: string, offset: number): Promise<UpdateTelegram[]> {
  const res = await llamarBot<UpdateTelegram[]>(token, 'getUpdates', {
    offset,
    timeout: 0,
    allowed_updates: ['message'],
  });
  return res.data ?? [];
}

function etiquetaChat(chat: MensajeTelegram['chat']): string {
  const partes = [chat.first_name, chat.username ? `@${chat.username}` : null]
    .filter(Boolean)
    .join(' ');
  return chat.title ?? (partes || String(chat.id));
}

async function responder(token: string, chatId: number, texto: string): Promise<void> {
  await enviarMensaje(token, String(chatId), texto, false);
}

async function comandoEstado(): Promise<string> {
  const admin = getAdminClient();
  const [
    { count: pendientes },
    { count: activas },
    { count: suspendidas },
    { count: errores },
    { count: facturas },
  ] = await Promise.all([
    admin
      .from('owner_applications')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['pendiente', 'en_revision']),
    admin.from('organizations').select('id', { count: 'exact', head: true }).eq('status', 'activa'),
    admin
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'suspendida'),
    admin.from('error_logs').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    admin
      .from('billing_records')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente'),
  ]);

  return [
    '📊 Estado de la plataforma',
    `Solicitudes pendientes: ${pendientes ?? 0}`,
    `Empresas activas: ${activas ?? 0} · suspendidas: ${suspendidas ?? 0}`,
    `Facturas pendientes: ${facturas ?? 0}`,
    `Errores abiertos: ${errores ?? 0}`,
  ].join('\n');
}

export interface ResultadoProcesar {
  procesados: number;
  vinculado: boolean;
  offset: number;
}

/**
 * Procesa updates uno a uno. Comandos:
 *  /start o /id → responde el chat_id y lo vincula si no hay destino.
 *  /estado      → resumen breve de la plataforma.
 */
export async function procesarUpdates(
  token: string,
  updates: UpdateTelegram[]
): Promise<ResultadoProcesar> {
  const config = await cargarConfig();
  let vinculado = false;
  let offset = config.update_offset;
  let procesados = 0;

  for (const update of [...updates].sort((a, b) => a.update_id - b.update_id)) {
    offset = Math.max(offset, update.update_id + 1);
    const mensaje = update.message;
    const texto = mensaje?.text?.trim().toLowerCase() ?? '';
    if (!mensaje || !texto) continue;
    procesados++;

    const chatId = mensaje.chat.id;
    if (texto.startsWith('/start') || texto.startsWith('/id')) {
      let destino = config.chat_destino;
      if (!destino) {
        const { error } = await getAdminClient()
          .from('platform_telegram_config')
          .update({
            chat_destino: String(chatId),
            chat_etiqueta: etiquetaChat(mensaje.chat),
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);
        if (!error) {
          destino = String(chatId);
          vinculado = true;
          invalidarTelegramCache();
        }
      }
      await responder(
        token,
        chatId,
        destino === String(chatId)
          ? `✅ Chat vinculado como destino de la plataforma.\nchat_id: ${chatId}`
          : `Tu chat_id es ${chatId}. El destino configurado es ${destino}. ` +
              'Si quieres usar este chat, actualízalo desde el panel.'
      );
      continue;
    }

    if (texto.startsWith('/estado')) {
      await responder(token, chatId, await comandoEstado());
      continue;
    }

    await responder(
      token,
      chatId,
      `Comandos disponibles:\n/estado — resumen de la plataforma\n/id — ver y vincular este chat`
    );
  }

  if (offset !== config.update_offset) {
    await getAdminClient()
      .from('platform_telegram_config')
      .update({ update_offset: offset })
      .eq('id', 1);
    invalidarTelegramCache();
  }

  return { procesados, vinculado, offset };
}

/** Descarga y procesa updates pendientes (polling). */
export async function sincronizarUpdates(): Promise<ResultadoProcesar | null> {
  const config = await cargarConfig();
  if (!config.bot_token) return null;
  const updates = await obtenerUpdates(config.bot_token, config.update_offset);
  if (updates.length === 0) return { procesados: 0, vinculado: false, offset: config.update_offset };
  return procesarUpdates(config.bot_token, updates);
}
