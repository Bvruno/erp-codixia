import { getAdminClient } from './supabase/admin';

// Creación central de notificaciones in-app + espejo por Telegram.
// Inserta con service role (RLS solo permite leer/editar las propias) y
// respeta la preferencia `notif.*` del destinatario. Nunca lanza: cualquier
// fallo se traga para no romper la operación que la originó.

export type TipoNotificacion =
  | 'task_assigned'
  | 'task_status'
  | 'note_added'
  | 'invitation'
  | 'permission'
  | 'reminder';

export type PrefNotificacion =
  | 'task_assigned'
  | 'task_status'
  | 'note_added'
  | 'permission'
  | 'reminder';

type PreferenciasPerfil = {
  notif?: Partial<Record<PrefNotificacion, boolean>>;
} | null;

export interface PerfilNotificable {
  id: string;
  preferences: PreferenciasPerfil;
  telegram_chat_id: string | null;
  blocked: boolean;
  organization_id: string;
}

export function notificacionHabilitada(
  prefs: PreferenciasPerfil,
  pref: PrefNotificacion,
): boolean {
  return prefs?.notif?.[pref] ?? true;
}

export function filtrarDestinatarios(
  perfiles: PerfilNotificable[],
  actorId: string | null | undefined,
  pref: PrefNotificacion,
): PerfilNotificable[] {
  const vistos = new Set<string>();
  return perfiles.filter((p) => {
    if (!p.id || p.blocked || p.id === actorId) return false;
    if (vistos.has(p.id)) return false;
    vistos.add(p.id);
    return notificacionHabilitada(p.preferences, pref);
  });
}

export interface EntradaNotificacion {
  actorId?: string | null;
  destinatarioIds: string[];
  tipo: TipoNotificacion;
  pref: PrefNotificacion;
  titulo: string;
  cuerpo?: string | null;
  referenciaTipo?: string | null;
  referenciaId?: string | null;
  /** Texto para Telegram; si falta se usa título + cuerpo. */
  telegram?: string;
}

async function enviarTelegram(chatIds: string[], botToken: string, texto: string) {
  const CONCURRENCIA = 3;
  let indice = 0;
  async function trabajador() {
    while (indice < chatIds.length) {
      const chatId = chatIds[indice++];
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: texto }),
      }).catch(() => undefined);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA, chatIds.length) }, trabajador),
  );
}

export async function crearNotificaciones(
  entrada: EntradaNotificacion,
): Promise<number> {
  try {
    const ids = [...new Set(entrada.destinatarioIds.filter(Boolean))].filter(
      (id) => id !== entrada.actorId,
    );
    if (ids.length === 0) return 0;

    const admin = getAdminClient();
    const { data: perfiles } = await admin
      .from('profiles')
      .select('id, preferences, telegram_chat_id, blocked, organization_id')
      .in('id', ids)
      .returns<PerfilNotificable[]>();
    const destinatarios = filtrarDestinatarios(
      perfiles ?? [],
      entrada.actorId,
      entrada.pref,
    );
    if (destinatarios.length === 0) return 0;

    const { data: insertadas, error } = await admin
      .from('notifications')
      .insert(
        destinatarios.map((p) => ({
          user_id: p.id,
          type: entrada.tipo,
          title: entrada.titulo,
          body: entrada.cuerpo ?? null,
          reference_type: entrada.referenciaTipo ?? null,
          reference_id: entrada.referenciaId ?? null,
        })),
      )
      .select('user_id');
    if (error) return 0;

    const insertados = new Set((insertadas ?? []).map((r) => r.user_id as string));
    const chats = destinatarios
      .filter((p) => insertados.has(p.id) && p.telegram_chat_id)
      .map((p) => p.telegram_chat_id as string);

    if (chats.length > 0) {
      const organizationId = destinatarios[0].organization_id;
      const { data: config } = await admin
        .from('telegram_config')
        .select('bot_token, enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (config?.bot_token && config.enabled) {
        const texto =
          entrada.telegram ??
          [entrada.titulo, entrada.cuerpo].filter(Boolean).join('\n');
        const botToken: string = config.bot_token;
        await enviarTelegram(chats, botToken, texto);
      }
    }

    return insertados.size;
  } catch {
    return 0;
  }
}
