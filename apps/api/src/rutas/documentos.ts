import { Hono } from 'hono';
import { z } from 'zod';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { getAdminClient } from '../lib/supabase/admin';
import { captureErrorServer } from '../lib/captura-errores';
import { mapearError } from './entidades';

export const rutasDocumentos = new Hono<{ Variables: VariablesDatos }>();

rutasDocumentos.use('/*', clienteUsuarioMiddleware);

// GET /documentos/:id — documento.
rutasDocumentos.get('/:id', async (c) => {
  const supabase = c.get('supabase');
  const { data, error } = await supabase.from('documents').select('*').eq('id', c.req.param('id')).single();
  if (error) return mapearError(c, error, 'Documento no encontrado');
  return c.json({ documento: data });
});

// GET /documentos/:id/paginas — páginas ordenadas (limit default 100).
rutasDocumentos.get('/:id/paginas', async (c) => {
  const supabase = c.get('supabase');
  const { data, error } = await supabase
    .from('document_pages')
    .select('*')
    .eq('document_id', c.req.param('id'))
    .order('position', { ascending: true })
    .limit(100);
  if (error) return mapearError(c, error);
  return c.json({ paginas: data ?? [] });
});

// PUT /documentos/:id/paginas/:pageId — autosave.
rutasDocumentos.put('/:id/paginas/:pageId', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ title: z.string(), content: z.string() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase
    .from('document_pages')
    .update({ title: body.data.title, content: body.data.content })
    .eq('id', c.req.param('pageId'));
  if (error) return mapearError(c, error, 'No se pudo guardar el documento');
  return c.json({ success: true });
});

// POST /documentos/:id/paginas — nueva página.
rutasDocumentos.post('/:id/paginas', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ title: z.string().min(1), content: z.string().optional(), position: z.number().int().min(0) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { data, error } = await supabase
    .from('document_pages')
    .insert({ document_id: c.req.param('id'), title: body.data.title, content: body.data.content ?? '', position: body.data.position })
    .select('*')
    .single();
  if (error) return mapearError(c, error, 'No se pudo crear la página');
  return c.json({ pagina: data });
});

// DELETE /documentos/:id/paginas/:pageId
rutasDocumentos.delete('/:id/paginas/:pageId', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase.from('document_pages').delete().eq('id', c.req.param('pageId'));
  if (error) return mapearError(c, error, 'No se pudo eliminar la página');
  return c.json({ success: true });
});

// POST /documentos/:id/menciones — registra menciones de usuario en una
// página y notifica por Telegram solo las nuevas (dedupe por página+usuario).
// El acceso al documento se valida con el cliente RLS del usuario; la
// notificación usa service role (perfiles + configuración de Telegram).
const esquemaMenciones = z.object({
  pagina_id: z.string().uuid(),
  usuario_ids: z.array(z.string().uuid()).min(1).max(20),
});

rutasDocumentos.post('/:id/menciones', async (c) => {
  const body = esquemaMenciones.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const docId = c.req.param('id');

  const { data: pagina } = await supabase
    .from('document_pages')
    .select('id, title')
    .eq('id', body.data.pagina_id)
    .eq('document_id', docId)
    .maybeSingle();
  if (!pagina) return c.json({ error: 'Página no encontrada' }, 404);

  const { data: doc } = await supabase
    .from('documents')
    .select('name, organization_id')
    .eq('id', docId)
    .maybeSingle();
  if (!doc?.organization_id) return c.json({ error: 'Documento no encontrado' }, 404);

  // No se notifica a uno mismo.
  const ids = body.data.usuario_ids.filter((id) => id !== usuarioId);
  if (ids.length === 0) return c.json({ notificados: 0 });

  const admin = getAdminClient();
  const { data: perfiles } = await admin
    .from('profiles')
    .select('id, telegram_chat_id')
    .eq('organization_id', doc.organization_id)
    .eq('blocked', false)
    .in('id', ids);
  if (!perfiles || perfiles.length === 0) return c.json({ notificados: 0 });

  // Dedupe durable: solo las filas insertadas son menciones nuevas.
  const { data: insertadas, error: insertError } = await admin
    .from('document_mentions')
    .upsert(
      perfiles.map((p) => ({
        document_id: docId,
        page_id: pagina.id,
        profile_id: p.id,
        mentioned_by: usuarioId,
      })),
      { onConflict: 'page_id,profile_id', ignoreDuplicates: true }
    )
    .select('profile_id');
  if (insertError) {
    void captureErrorServer({
      source: 'server',
      message: `Fallo registrando menciones: ${insertError.message}`,
      route: `/documentos/${docId}/menciones`,
      method: 'POST',
      userId: usuarioId,
      organizationId: doc.organization_id,
    });
    return c.json({ error: 'No se pudieron registrar las menciones' }, 500);
  }

  const nuevos = new Set((insertadas ?? []).map((r) => r.profile_id as string));
  const chats = perfiles
    .filter((p) => nuevos.has(p.id) && p.telegram_chat_id)
    .map((p) => p.telegram_chat_id as string);
  if (chats.length === 0) return c.json({ notificados: 0 });

  const { data: config } = await admin
    .from('telegram_config')
    .select('bot_token, enabled')
    .eq('organization_id', doc.organization_id)
    .maybeSingle();
  if (!config?.bot_token || !config.enabled) return c.json({ notificados: 0 });

  const { data: autor } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', usuarioId)
    .maybeSingle();
  const texto = `${autor?.full_name ?? 'Alguien'} te mencionó en el documento «${doc.name}» › ${pagina.title}`;

  const botToken: string = config.bot_token;
  const fallos: string[] = [];
  const CONCURRENCIA = 3;
  let indice = 0;
  async function trabajador() {
    while (indice < chats.length) {
      const chatId = chats[indice++];
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: texto }),
      });
      if (!res.ok) fallos.push(chatId);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA, chats.length) }, trabajador)
  );

  return c.json({ notificados: chats.length - fallos.length });
});