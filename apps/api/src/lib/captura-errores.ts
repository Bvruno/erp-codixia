import type { ErrorPayload } from '@erp/shared';
import { rpcArgs } from '@erp/shared';

// Captura server de errores → error_logs (RPC log_error con service role).
// Nunca lanza: un fallo de captura no puede romper la operación original.
// Los errores nuevos se notifican a la PLATAFORMA (no al owner).
export async function captureErrorServer(payload: ErrorPayload): Promise<void> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }
  try {
    const { getAdminClient } = await import('@/lib/supabase/admin');
    const supabase = getAdminClient();
    const { data } = await supabase.rpc('log_error', await rpcArgs(payload));
    if (data?.is_new) {
      const { emitirErrorPlataforma } = await import('@/lib/telegram-plataforma');
      await emitirErrorPlataforma({
        id: data.id,
        source: payload.source,
        level: payload.level,
        message: payload.message,
        name: payload.name,
        route: payload.route,
        organizationId: payload.organizationId,
      }).catch(() => {});
    }
  } catch {
    // La captura nunca debe propagar fallos al llamador.
  }
}
