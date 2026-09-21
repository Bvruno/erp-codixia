// Alerta Telegram al owner cuando aparece un error nuevo.
// Modo global (por defecto): usa TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID del
// entorno — un solo bot recibe los errores de TODAS las organizaciones.
// Fallback por-organización: bot de telegram_config + chat_id del owner.
// Nunca lanza; marca telegram_sent_at con UPDATE condicional para que
// en carrera solo un proceso envíe la alerta.
import type { SupabaseClient } from '@supabase/supabase-js';

interface AlertRow {
  id: string;
  message: string;
  name: string | null;
  route: string | null;
  source: string;
  count: number;
  organization_id: string;
}

export function telegramAlertText(row: AlertRow, orgName?: string): string {
  return [
    `\u{1F6A8} Error [${row.source}]`,
    `${row.name ? `${row.name}: ` : ''}${row.message.slice(0, 200)}`,
    orgName ? `Organización: ${orgName}` : null,
    row.route ? `Ruta: ${row.route}` : null,
    `Veces: ${row.count}`,
    `ID: ${row.id}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function claimAlert(
  supabase: SupabaseClient,
  errorId: string,
): Promise<boolean> {
  const { data: claimed } = await supabase
    .from('error_logs')
    .update({ telegram_sent_at: new Date().toISOString() })
    .eq('id', errorId)
    .is('telegram_sent_at', null)
    .select('id')
    .maybeSingle();
  return Boolean(claimed);
}

export async function sendTelegramAlert(
  supabase: SupabaseClient,
  errorId: string,
): Promise<void> {
  try {
    const { data: row } = await supabase
      .from('error_logs')
      .select('id, message, name, route, source, count, organization_id')
      .eq('id', errorId)
      .maybeSingle();
    if (!row?.organization_id) return;

    const { data: org } = await supabase
      .from('organizations')
      .select('name, owner_id')
      .eq('id', row.organization_id)
      .single();
    if (!org) return;

    const globalToken = process.env.TELEGRAM_BOT_TOKEN;
    const globalChatId = process.env.TELEGRAM_CHAT_ID;

    let botToken: string;
    let chatId: string;
    if (globalToken && globalChatId) {
      botToken = globalToken;
      chatId = globalChatId;
    } else {
      const [{ data: config }, { data: owner }] = await Promise.all([
        supabase
          .from('telegram_config')
          .select('bot_token, enabled')
          .eq('organization_id', row.organization_id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('telegram_chat_id')
          .eq('id', org.owner_id)
          .maybeSingle(),
      ]);
      if (!config?.enabled || !config.bot_token || !owner?.telegram_chat_id) {
        return;
      }
      botToken = config.bot_token;
      chatId = owner.telegram_chat_id;
    }

    if (!(await claimAlert(supabase, errorId))) return;

    const text = telegramAlertText(row, org.name);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // No reenvía: la próxima ocurrencia del mismo error es un is_new=false
      // y no pasa por acá; la alerta queda para la siguiente reaparición.
      void res;
    }
  } catch {
    // La alerta nunca debe romper la captura del error.
  }
}