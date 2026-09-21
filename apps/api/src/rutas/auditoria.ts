import { Hono } from 'hono';
import { z } from 'zod';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { mapearError } from './entidades';

export const rutasAuditoria = new Hono<{ Variables: VariablesDatos }>();

rutasAuditoria.use('/*', clienteUsuarioMiddleware);

// POST /auditoria — registrar acción (best-effort server-side).
rutasAuditoria.post('/', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const body = z.object({
    organization_id: z.string().uuid(),
    action: z.string().min(1),
    entity: z.string().min(1),
    before: z.unknown().nullable().optional(),
    after: z.unknown().nullable().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('audit_logs').insert({
    organization_id: body.data.organization_id,
    user_id: usuarioId,
    action: body.data.action,
    entity: body.data.entity,
    before: body.data.before ?? null,
    after: body.data.after ?? null,
  });
  // Fallo de auditoría nunca rompe la operación.
  if (error) return c.json({ success: true, audit_error: error.message });
  return c.json({ success: true });
});

// GET /auditoria?organization_id=&limit=20 — últimos logs con usuario.
rutasAuditoria.get('/', async (c) => {
  const supabase = c.get('supabase');
  const orgId = c.req.query('organization_id');
  if (!orgId) return c.json({ error: 'organization_id requerido' }, 400);
  const limit = z.coerce.number().int().min(1).max(200).safeParse(c.req.query('limit') ?? '20');
  if (!limit.success) return c.json({ error: 'limit inválido' }, 400);
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, user:profiles(full_name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit.data);
  if (error) return mapearError(c, error);
  return c.json({ logs: data ?? [] });
});