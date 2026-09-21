import type { ContextoUsuario } from '../middleware/verificar-jwt';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAdminClient } from '../lib/supabase/admin';
import { verificarJwtMiddleware } from '../middleware/verificar-jwt';
import { captureErrorServer } from '../lib/captura-errores';

export const rutasTelegram = new Hono<{ Variables: { usuario: ContextoUsuario } }>();

const esquemaEnviar = z.object({
  message: z.string().min(1).max(2000),
  organization_id: z.string().uuid(),
});

rutasTelegram.use('/*', verificarJwtMiddleware);

// POST /telegram/enviar — envía mensaje con el token configurado de la org.
rutasTelegram.post('/enviar', async (c) => {
  const body = esquemaEnviar.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Mensaje inválido' }, 400);

  const admin = getAdminClient();
  const { data: config } = await admin
    .from('telegram_config')
    .select('bot_token, enabled')
    .eq('organization_id', body.data.organization_id)
    .maybeSingle();

  if (!config?.bot_token || !config.enabled) {
    return c.json({ error: 'Telegram no está configurado' }, 400);
  }

  const { data: chats } = await admin
    .from('profiles')
    .select('telegram_chat_id')
    .eq('organization_id', body.data.organization_id)
    .not('telegram_chat_id', 'is', null);

  const chatIds = (chats ?? [])
    .map((p) => p.telegram_chat_id as string)
    .filter(Boolean);

  if (chatIds.length === 0) {
    return c.json({ error: 'No hay chats vinculados' }, 400);
  }

  // Envío con concurrencia acotada (3): antes era un await por chat.
  const botToken: string = config.bot_token;
  const texto: string = body.data.message;
  const fallos: string[] = [];
  const CONCURRENCIA = 3;
  let indice = 0;
  async function trabajador() {
    while (indice < chatIds.length) {
      const chatId = chatIds[indice++];
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: texto }),
      });
      if (!res.ok) fallos.push(chatId);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA, chatIds.length) }, trabajador)
  );

  if (fallos.length > 0 && fallos.length === chatIds.length) {
    return c.json({ error: 'No se pudo enviar el mensaje' }, 502);
  }

  return c.json({ success: true, entregados: chatIds.length - fallos.length });
});

// POST /telegram/probar — mensaje de prueba al owner.
rutasTelegram.post('/probar', async (c) => {
  const usuario = c.get('usuario');
  const orgId = usuario.perfil?.organization_id;
  if (!orgId) return c.json({ error: 'Sin organización' }, 403);

  const admin = getAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('owner_id, name')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return c.json({ error: 'Organización no encontrada' }, 404);

  const { data: owner } = await admin
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', org.owner_id)
    .maybeSingle();
  if (!owner?.telegram_chat_id) {
    return c.json({ error: 'El owner no tiene chat de Telegram vinculado' }, 400);
  }

  const { data: config } = await admin
    .from('telegram_config')
    .select('bot_token, enabled')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!config?.bot_token || !config.enabled) {
    return c.json({ error: 'Telegram no está configurado' }, 400);
  }

  const res = await fetch(
    `https://api.telegram.org/bot${config.bot_token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: owner.telegram_chat_id,
        text: `Prueba de Telegram — ${org.name ?? 'ERP Empresarial'}`,
      }),
    }
  );

  if (!res.ok) {
    void captureErrorServer({
      source: 'server',
      message: 'Fallo enviando prueba de Telegram',
      route: '/telegram/probar',
      method: 'POST',
      userId: usuario.id,
      organizationId: orgId,
    });
    return c.json({ error: 'No se pudo enviar la prueba' }, 502);
  }

  return c.json({ success: true });
});
