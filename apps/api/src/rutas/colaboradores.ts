import { Hono } from 'hono';
import { z } from 'zod';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { crearNotificaciones } from '../lib/notificaciones';
import { mapearError } from './entidades';

export const rutasColaboradores = new Hono<{ Variables: VariablesDatos }>();

rutasColaboradores.use('/*', clienteUsuarioMiddleware);

// GET /colaboradores/datos — conjunto admin: miembros, owner, invitaciones,
// conteos de grants, horarios, turnos, límites.
rutasColaboradores.get('/datos', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('organization_id, role, id, blocked')
    .eq('id', usuarioId)
    .single();
  if (pErr || !profile?.organization_id) return c.json({ error: 'Perfil no encontrado' }, 404);
  const orgId = profile.organization_id;

  const [collabRes, orgRes, inviteRes, evRes, schedRes, shiftRes, orgSettingsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', orgId)
      .neq('is_owner', true)
      .order('created_at', { ascending: false }),
    supabase.from('organizations').select('owner_id').eq('id', orgId).single(),
    supabase
      .from('invitations')
      .select('*, creator:profiles!invitations_created_by_fkey(full_name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    supabase.from('entity_visibility').select('profile_id'),
    supabase.from('schedules').select('*, shift:shifts(*)').eq('organization_id', orgId),
    supabase.from('shifts').select('*').eq('organization_id', orgId).order('start_time', { ascending: true }),
    supabase.from('org_settings').select('daily_hours, weekly_hours').eq('organization_id', orgId).maybeSingle(),
  ]);

  const grantCounts: Record<string, number> = {};
  for (const row of evRes.data ?? []) {
    grantCounts[row.profile_id] = (grantCounts[row.profile_id] ?? 0) + 1;
  }

  return c.json({
    profile,
    collaborators: collabRes.data ?? [],
    owner_id: orgRes.data?.owner_id ?? null,
    invitations: inviteRes.data ?? [],
    grant_counts: grantCounts,
    schedules: schedRes.data ?? [],
    shifts: shiftRes.data ?? [],
    org_settings: orgSettingsRes.data ?? null,
  });
});

// POST /colaboradores/invitaciones/:id/estado — expirar/cancelar.
rutasColaboradores.post('/invitaciones/:id/estado', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ status: z.enum(['expired', 'cancelled']) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('invitations').update({ status: body.data.status }).eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo actualizar la invitación');
  return c.json({ success: true });
});

// POST /colaboradores/grants — upsert un grant.
rutasColaboradores.post('/grants', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({
    entity_type: z.enum(['workspace', 'folder', 'list', 'document', 'mindmap', 'todo']),
    entity_id: z.string().uuid(),
    profile_id: z.string().uuid(),
    permission: z.enum(['read', 'write', 'manage']),
    inherit: z.boolean(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('entity_visibility').upsert(body.data, { onConflict: 'entity_type,entity_id,profile_id' });
  if (error) return mapearError(c, error, 'No se pudo actualizar el acceso');
  await crearNotificaciones({
    actorId: c.get('usuarioId'),
    destinatarioIds: [body.data.profile_id],
    tipo: 'permission',
    pref: 'permission',
    titulo: `Te dieron acceso (${body.data.permission}) a un ${body.data.entity_type}`,
    referenciaTipo: body.data.entity_type,
    referenciaId: body.data.entity_id,
  });
  return c.json({ success: true });
});

// DELETE /colaboradores/grants — quitar un grant.
rutasColaboradores.delete('/grants', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({
    entity_type: z.enum(['workspace', 'folder', 'list', 'document', 'mindmap', 'todo']),
    entity_id: z.string().uuid(),
    profile_id: z.string().uuid(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase
    .from('entity_visibility')
    .delete()
    .eq('entity_type', body.data.entity_type)
    .eq('entity_id', body.data.entity_id)
    .eq('profile_id', body.data.profile_id);
  if (error) return mapearError(c, error, 'No se pudo eliminar el acceso');
  await crearNotificaciones({
    actorId: c.get('usuarioId'),
    destinatarioIds: [body.data.profile_id],
    tipo: 'permission',
    pref: 'permission',
    titulo: `Te quitaron el acceso a un ${body.data.entity_type}`,
    referenciaTipo: body.data.entity_type,
    referenciaId: body.data.entity_id,
  });
  return c.json({ success: true });
});