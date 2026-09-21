import { Hono } from 'hono';
import { z } from 'zod';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { mapearError } from './entidades';

export const rutasNotificaciones = new Hono<{ Variables: VariablesDatos }>();

rutasNotificaciones.use('/*', clienteUsuarioMiddleware);

// GET /notificaciones?limit=30 — propias (RLS) + contador de no leídas.
rutasNotificaciones.get('/', async (c) => {
  const supabase = c.get('supabase');
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .safeParse(c.req.query('limit') ?? '30');
  if (!limit.success) return c.json({ error: 'limit inválido' }, 400);

  const [listaRes, conteoRes] = await Promise.all([
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit.data),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('read', false),
  ]);
  if (listaRes.error) return mapearError(c, listaRes.error);
  return c.json({
    notificaciones: listaRes.data ?? [],
    noLeidas: conteoRes.count ?? 0,
  });
});

// PATCH /notificaciones/:id/leida — marcar leída/no leída.
rutasNotificaciones.patch('/:id/leida', async (c) => {
  const supabase = c.get('supabase');
  const body = z
    .object({ leida: z.boolean().default(true) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase
    .from('notifications')
    .update({ read: body.data.leida })
    .eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo actualizar la notificación');
  return c.json({ success: true });
});

// POST /notificaciones/leer-todas
rutasNotificaciones.post('/leer-todas', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false);
  if (error) return mapearError(c, error, 'No se pudieron marcar como leídas');
  return c.json({ success: true });
});
