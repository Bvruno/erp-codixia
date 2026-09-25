import { Hono } from 'hono';
import { z } from 'zod';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { ejecutarEscritura, sinPermisoEscritura } from '../lib/escrituras';
import { mapearError } from './entidades';

export const rutasMapas = new Hono<{ Variables: VariablesDatos }>();

rutasMapas.use('/*', clienteUsuarioMiddleware);

// GET /mapas/:id/contenido — snapshot fresco.
rutasMapas.get('/:id/contenido', async (c) => {
  const supabase = c.get('supabase');
  const { data, error } = await supabase.from('mind_maps').select('content').eq('id', c.req.param('id')).single();
  if (error) return mapearError(c, error, 'Mapa no encontrado');
  return c.json({ contenido: data?.content ?? null });
});

// PUT /mapas/:id — persistir snapshot (autosave).
rutasMapas.put('/:id', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ content: z.unknown() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error, filas } = await ejecutarEscritura(
    supabase
      .from('mind_maps')
      .update({ content: body.data.content })
      .eq('id', c.req.param('id'))
      .select('id')
  );
  if (error) return mapearError(c, error, 'No se pudo guardar el mapa');
  if (filas === 0) return sinPermisoEscritura(c);
  return c.json({ success: true });
});