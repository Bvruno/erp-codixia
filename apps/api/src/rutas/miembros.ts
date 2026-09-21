import type { ContextoUsuario } from '../middleware/verificar-jwt';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAdminClient } from '../lib/supabase/admin';
import { invalidarPerfilCache, verificarJwtMiddleware } from '../middleware/verificar-jwt';
import { requerirAdmin } from '../middleware/requerir-admin';

export const rutasMiembros = new Hono<{ Variables: { usuario: ContextoUsuario } }>();

const esquemaActualizar = z.object({
  blocked: z.boolean().optional(),
  role: z.enum(['admin', 'collaborator']).optional(),
  position: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  birth_date: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  full_name: z.string().min(1).optional(),
  access_mode: z.enum(['org', 'grants_only']).optional(),
  daily_hours: z.number().min(1).max(24).optional(),
  weekly_hours: z.number().min(1).max(168).optional(),
});

rutasMiembros.use('/*', verificarJwtMiddleware, requerirAdmin);

// PATCH /miembros/:id — bloquear/desbloquear, rol, datos de contacto.
rutasMiembros.patch('/:id', async (c) => {
  const body = esquemaActualizar.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const usuario = c.get('usuario');
  const orgId = usuario.perfil?.organization_id;
  if (!orgId) return c.json({ error: 'Sin organización' }, 403);

  const admin = getAdminClient();
  const { data: objetivo } = await admin
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', c.req.param('id'))
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!objetivo) return c.json({ error: 'Miembro no encontrado' }, 404);

  const patch: Record<string, unknown> = {};

  // Solo el owner gestiona admins; el owner nunca se auto-bloquea.
  if (body.data.role !== undefined) {
    const { data: org } = await admin
      .from('organizations')
      .select('owner_id')
      .eq('id', orgId)
      .maybeSingle();
    if (!org || org.owner_id !== usuario.id) {
      return c.json({ error: 'Solo el dueño puede cambiar roles' }, 403);
    }
    if (objetivo.id === org.owner_id) {
      return c.json({ error: 'No puedes cambiar el rol del dueño' }, 400);
    }
    patch.role = body.data.role;
  }

  if (body.data.blocked !== undefined) {
    if (objetivo.id === usuario.id) {
      return c.json({ error: 'No puedes bloquearte a ti mismo' }, 400);
    }
    patch.blocked = body.data.blocked;
  }

  for (const campo of ['position', 'phone', 'birth_date', 'address', 'full_name', 'access_mode', 'daily_hours', 'weekly_hours'] as const) {
    if (body.data[campo] !== undefined) patch[campo] = body.data[campo];
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ success: true });
  }

  const { error } = await admin.from('profiles').update(patch).eq('id', objetivo.id);
  if (error) return c.json({ error: 'No se pudo actualizar el miembro' }, 500);
  // El rol/block entran en el perfil cacheado del middleware: invalidar ya.
  invalidarPerfilCache(objetivo.id);

  return c.json({ success: true });
});

// DELETE /miembros/:id — eliminar miembro de la org.
rutasMiembros.delete('/:id', async (c) => {
  const usuario = c.get('usuario');
  const orgId = usuario.perfil?.organization_id;
  if (!orgId) return c.json({ error: 'Sin organización' }, 403);

  const admin = getAdminClient();
  const { data: objetivo } = await admin
    .from('profiles')
    .select('id, role, organization_id, is_owner')
    .eq('id', c.req.param('id'))
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!objetivo) return c.json({ error: 'Miembro no encontrado' }, 404);
  if (objetivo.is_owner || objetivo.id === usuario.id) {
    return c.json({ error: 'No puedes eliminar al dueño ni a ti mismo' }, 400);
  }
  const { data: org } = await admin
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .maybeSingle();
  if (org?.owner_id !== usuario.id && objetivo.role === 'admin') {
    return c.json({ error: 'Solo el dueño elimina admins' }, 403);
  }

  const { error } = await admin.from('profiles').delete().eq('id', objetivo.id);
  if (error) return c.json({ error: 'No se pudo eliminar el miembro' }, 500);
  invalidarPerfilCache(objetivo.id);
  return c.json({ success: true });
});
