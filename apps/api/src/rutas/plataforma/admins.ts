import { Hono } from 'hono';
import { zNuevoPlatformAdmin, type PlatformAdmin } from '@erp/shared';
import { getAdminClient } from '../../lib/supabase/admin';
import type { ContextoUsuario } from '../../middleware/verificar-jwt';
import {
  buscarUsuarioPorEmail,
  registrarAuditoria,
  usuariosAuthPorId,
} from './comun';
import { invalidarPlataformaCache } from '../../middleware/requerir-plataforma';

export const rutasAdmins = new Hono<{
  Variables: { usuario: ContextoUsuario };
}>();

// GET /plataforma/admins — quiénes administran la plataforma.
rutasAdmins.get('/', async (c) => {
  const { data, error } = await getAdminClient()
    .from('platform_admins')
    .select('user_id, created_at')
    .order('created_at', { ascending: true });
  if (error) return c.json({ error: 'No se pudieron cargar los administradores' }, 500);

  const usuarios = await usuariosAuthPorId((data ?? []).map((a) => a.user_id as string));
  const yo = c.get('usuario').id;

  const admins: PlatformAdmin[] = (data ?? []).map((a) => {
    const u = usuarios.get(a.user_id as string);
    return {
      user_id: a.user_id as string,
      email: u?.email ?? null,
      nombre: u?.nombre ?? null,
      created_at: a.created_at as string,
      es_yo: a.user_id === yo,
    };
  });

  return c.json({ data: admins });
});

// POST /plataforma/admins — agrega un usuario existente como superadmin.
rutasAdmins.post('/', async (c) => {
  const body = zNuevoPlatformAdmin.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Email inválido' }, 400);

  const usuario = await buscarUsuarioPorEmail(body.data.email);
  if (!usuario) {
    return c.json(
      { error: 'Ese correo no tiene cuenta en la plataforma. Debe registrarse primero.' },
      404
    );
  }

  const admin = getAdminClient();
  const { data: existente } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', usuario.id)
    .maybeSingle();
  if (existente) return c.json({ error: 'Ese usuario ya es administrador de plataforma' }, 409);

  const { error } = await admin.from('platform_admins').insert({
    user_id: usuario.id,
    created_by: c.get('usuario').id,
  });
  if (error) return c.json({ error: 'No se pudo agregar al administrador' }, 500);

  invalidarPlataformaCache(usuario.id);
  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'admin.agregar',
    entidadTipo: 'platform_admin',
    entidadId: usuario.id,
    payload: { email: usuario.email },
  });

  return c.json({ ok: true, user_id: usuario.id }, 201);
});

// DELETE /plataforma/admins/:id — nunca deja la plataforma sin admins.
rutasAdmins.delete('/:id', async (c) => {
  const objetivo = c.req.param('id');
  const yo = c.get('usuario').id;

  if (objetivo === yo) {
    return c.json({ error: 'No puedes quitarte a ti mismo los permisos' }, 400);
  }

  const admin = getAdminClient();
  const { count } = await admin
    .from('platform_admins')
    .select('user_id', { count: 'exact', head: true });
  if ((count ?? 0) <= 1) {
    return c.json({ error: 'Debe quedar al menos un administrador de plataforma' }, 400);
  }

  const { error } = await admin.from('platform_admins').delete().eq('user_id', objetivo);
  if (error) return c.json({ error: 'No se pudo quitar al administrador' }, 500);

  invalidarPlataformaCache(objetivo);
  await registrarAuditoria({
    actorId: yo,
    accion: 'admin.quitar',
    entidadTipo: 'platform_admin',
    entidadId: objetivo,
  });

  return c.json({ ok: true });
});
