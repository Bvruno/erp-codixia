import { Hono } from 'hono';
import { z } from 'zod';
import { rpcArgs } from '@erp/shared';
import { getAdminClient } from '../lib/supabase/admin';
import { verificarJwt } from '../supabase/verificar-token';
import { sendTelegramAlert } from '../lib/telegram-alert';
import { captureErrorServer } from '../lib/captura-errores';

export const rutasErrores = new Hono();

// El SPA no escribe error_logs directo: POST /errores persiste vía RPC
// log_error con service role (0058 revocó anon/authenticated/public) y
// dispara la alerta Telegram server-side cuando el fingerprint es nuevo.
const esquemaError = z.object({
  message: z.string().min(1).max(4000),
  level: z.enum(['error', 'warning']).optional(),
  name: z.string().max(200).optional(),
  code: z.string().max(20).optional(),
  stack: z.string().max(20000).optional(),
  route: z.string().max(500).optional(),
  method: z.string().max(10).optional(),
  userAgent: z.string().max(500).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

rutasErrores.post('/', async (c) => {
  const body = esquemaError.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  // Autenticación opcional: si el SPA tiene sesión, el error se atribuye al
  // usuario verificado contra GoTrue; nunca se confía en un userId del body.
  const auth = c.req.header('authorization');
  let userId: string | undefined;
  if (auth?.startsWith('Bearer ')) {
    const usuario = await verificarJwt(auth.slice(7));
    userId = usuario?.id;
  }

  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
  const payload = {
    ...body.data,
    source: 'client' as const,
    userId,
    userAgent: body.data.userAgent ?? c.req.header('user-agent') ?? undefined,
    clientIp: ip,
  };

  try {
    const supabase = getAdminClient();
    const { data } = await supabase.rpc('log_error', await rpcArgs(payload));
    if (data?.is_new) {
      await sendTelegramAlert(supabase, data.id).catch(() => {});
    }
    return c.json({ id: data?.id ?? null, isNew: data?.is_new ?? false });
  } catch {
    void captureErrorServer({
      source: 'server',
      message: 'Fallo persistiendo telemetría de error',
      route: '/errores',
      method: 'POST',
      context: { original: body.data.message },
    });
    return c.json({ error: 'No se pudo registrar el error' }, 500);
  }
});
