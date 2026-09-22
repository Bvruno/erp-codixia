import { Hono } from 'hono';
import type { EntradaAuditoriaPlataforma } from '@erp/shared';
import { getAdminClient } from '../../lib/supabase/admin';
import type { ContextoUsuario } from '../../middleware/verificar-jwt';
import { paginacion, usuariosAuthPorId } from './comun';

export const rutasAuditoria = new Hono<{
  Variables: { usuario: ContextoUsuario };
}>();

// GET /plataforma/auditoria — historial de acciones de la plataforma.
rutasAuditoria.get('/', async (c) => {
  const { entidad_tipo, entidad_id } = c.req.query();
  const { desde, hasta, page, pageSize } = paginacion(c.req.query());

  let consulta = getAdminClient()
    .from('platform_audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(desde, hasta);
  if (entidad_tipo) consulta = consulta.eq('entidad_tipo', entidad_tipo);
  if (entidad_id) consulta = consulta.eq('entidad_id', entidad_id);

  const { data, count, error } = await consulta;
  if (error) return c.json({ error: 'No se pudo cargar la auditoría' }, 500);

  const actores = await usuariosAuthPorId(
    (data ?? [])
      .map((f) => f.actor_id as string | null)
      .filter((id): id is string => Boolean(id))
  );

  const entradas: EntradaAuditoriaPlataforma[] = (data ?? []).map((f) => ({
    id: Number(f.id),
    actor_id: (f.actor_id as string | null) ?? null,
    actor_email: f.actor_id ? actores.get(f.actor_id as string)?.email ?? null : null,
    accion: f.accion as string,
    entidad_tipo: (f.entidad_tipo as string | null) ?? null,
    entidad_id: (f.entidad_id as string | null) ?? null,
    payload: (f.payload as Record<string, unknown>) ?? {},
    created_at: f.created_at as string,
  }));

  return c.json({ data: entradas, total: count ?? 0, page, pageSize });
});
