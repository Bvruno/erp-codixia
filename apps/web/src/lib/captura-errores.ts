import type { ErrorPayload } from '@erp/shared';
import { api } from '@/lib/api/cliente';

// Captura client de errores → POST /errores (la API persiste vía RPC
// log_error con service role y dispara la alerta Telegram server-side;
// 0058 revocó la ejecución de la RPC a anon/authenticated).
// Nunca lanza: un fallo de captura no puede romper la operación original.
export async function captureErrorClient(payload: ErrorPayload): Promise<void> {
  if (typeof window === 'undefined') return;
  const payloadConMeta: ErrorPayload = {
    ...payload,
    userAgent: payload.userAgent ?? navigator.userAgent,
  };
  try {
    await api.post('/errores', payloadConMeta);
  } catch {
    // Silencioso: la telemetría jamás interrumpe el flujo del usuario.
  }
}
