import { Hono } from 'hono';
import { z } from 'zod';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { mapearError } from './entidades';

export const rutasHorarios = new Hono<{ Variables: VariablesDatos }>();

rutasHorarios.use('/*', clienteUsuarioMiddleware);

// GET /horarios/datos?inicio=&fin=&tendencia_desde= — conjunto completo.
rutasHorarios.get('/datos', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const inicio = c.req.query('inicio');
  const fin = c.req.query('fin');
  const tendenciaDesde = c.req.query('tendencia_desde');
  if (!inicio || !fin || !tendenciaDesde) {
    return c.json({ error: 'inicio, fin y tendencia_desde requeridos' }, 400);
  }
  const { data: p, error: pErr } = await supabase.from('profiles').select('*').eq('id', usuarioId).single();
  if (pErr || !p) return c.json({ error: 'Perfil no encontrado' }, 404);
  const orgId = p.organization_id;

  const [collabRes, entriesRes, permRes, settingsRes, schedRes, trendRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role, daily_hours, weekly_hours, preferences')
      .eq('organization_id', orgId)
      .eq('blocked', false)
      .neq('is_owner', true),
    supabase
      .from('time_entries')
      .select('*, user:profiles!time_entries_user_id_fkey(full_name)')
      .eq('organization_id', orgId)
      .gte('date', inicio)
      .lte('date', fin)
      .order('date', { ascending: false }),
    supabase
      .from('permissions')
      .select('*, user:profiles!permissions_user_id_fkey(full_name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('org_settings')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle(),
    supabase
      .from('schedules')
      .select('*, shift:shifts(*)')
      .eq('organization_id', orgId),
    supabase
      .from('time_entries')
      .select('user_id, date, hours, type')
      .eq('organization_id', orgId)
      .gte('date', tendenciaDesde),
  ]);

  return c.json({
    profile: p,
    collaborators: collabRes.data ?? [],
    time_entries: entriesRes.data ?? [],
    permissions: permRes.data ?? [],
    org_settings: settingsRes.data ?? null,
    schedules: schedRes.data ?? [],
    trend_entries: trendRes.data ?? [],
  });
});

// GET /horarios/asignables — schedules user_id + owner (assignee-select).
rutasHorarios.get('/asignables', async (c) => {
  const supabase = c.get('supabase');
  const orgId = c.req.query('organization_id');
  if (!orgId) return c.json({ error: 'organization_id requerido' }, 400);
  const [schedRes, orgRes] = await Promise.all([
    supabase.from('schedules').select('user_id').eq('organization_id', orgId),
    supabase.from('organizations').select('owner_id').eq('id', orgId).single(),
  ]);
  if (schedRes.error) return mapearError(c, schedRes.error);
  return c.json({ schedules: schedRes.data ?? [], owner_id: orgRes.data?.owner_id ?? null });
});

// GET /horarios/shifts
rutasHorarios.get('/shifts', async (c) => {
  const supabase = c.get('supabase');
  const orgId = c.req.query('organization_id');
  if (!orgId) return c.json({ error: 'organization_id requerido' }, 400);
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('organization_id', orgId)
    .order('start_time');
  if (error) return mapearError(c, error);
  return c.json({ shifts: data ?? [] });
});

const esquemaShift = z.object({
  name: z.string().min(1),
  start_time: z.string(),
  end_time: z.string(),
  color: z.string(),
  crosses_midnight: z.boolean(),
  break_start_time: z.string().nullable().optional(),
  break_end_time: z.string().nullable().optional(),
});

// POST /horarios/shifts
rutasHorarios.post('/shifts', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ organization_id: z.string().uuid(), ...esquemaShift.shape }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('shifts').insert({
    organization_id: body.data.organization_id,
    name: body.data.name.trim(),
    start_time: body.data.start_time,
    end_time: body.data.end_time,
    color: body.data.color,
    crosses_midnight: body.data.crosses_midnight,
    break_start_time: body.data.break_start_time ?? null,
    break_end_time: body.data.break_end_time ?? null,
  });
  if (error) return mapearError(c, error, 'No se pudo crear el turno');
  return c.json({ success: true });
});

// PATCH /horarios/shifts/:id
rutasHorarios.patch('/shifts/:id', async (c) => {
  const supabase = c.get('supabase');
  const body = esquemaShift.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('shifts').update({
    name: body.data.name.trim(),
    start_time: body.data.start_time,
    end_time: body.data.end_time,
    color: body.data.color,
    crosses_midnight: body.data.crosses_midnight,
    break_start_time: body.data.break_start_time ?? null,
    break_end_time: body.data.break_end_time ?? null,
  }).eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo actualizar el turno');
  return c.json({ success: true });
});

// GET /horarios/shifts/:id/uso — conteos tasks/schedules del turno.
rutasHorarios.get('/shifts/:id/uso', async (c) => {
  const supabase = c.get('supabase');
  const id = c.req.param('id');
  const [taskCount, schedCount] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('shift_id', id),
    supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('shift_id', id),
  ]);
  return c.json({ tasks: taskCount.count ?? 0, schedules: schedCount.count ?? 0 });
});

// DELETE /horarios/shifts/:id
rutasHorarios.delete('/shifts/:id', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase.from('shifts').delete().eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo eliminar el turno');
  return c.json({ success: true });
});

// POST /horarios/schedules — asignar turno.
rutasHorarios.post('/schedules', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({
    organization_id: z.string().uuid(),
    user_id: z.string().uuid(),
    shift_id: z.string().uuid(),
    day_of_week: z.number().int().min(0).max(6),
    created_by: z.string().uuid().nullable(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('schedules').insert(body.data);
  if (error) return mapearError(c, error, 'No se pudo asignar el turno');
  return c.json({ success: true });
});

// PATCH /horarios/schedules/:id — cambiar turno del día.
rutasHorarios.patch('/schedules/:id', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ shift_id: z.string().uuid() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('schedules').update({ shift_id: body.data.shift_id }).eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo actualizar el turno');
  return c.json({ success: true });
});

// DELETE /horarios/schedules/:id
rutasHorarios.delete('/schedules/:id', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase.from('schedules').delete().eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo eliminar el turno');
  return c.json({ success: true });
});

const esquemaEntrada = z.object({
  date: z.string(),
  hours: z.number().positive(),
  type: z.enum(['worked', 'permission', 'overtime', 'makeup']),
});

// POST /horarios/entradas
rutasHorarios.post('/entradas', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ organization_id: z.string().uuid(), user_id: z.string().uuid(), ...esquemaEntrada.shape }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('time_entries').insert({
    organization_id: body.data.organization_id,
    user_id: body.data.user_id,
    date: body.data.date,
    hours: body.data.hours,
    type: body.data.type,
  });
  if (error) return mapearError(c, error, 'No se pudieron registrar las horas');
  return c.json({ success: true });
});

// PATCH /horarios/entradas/:id
rutasHorarios.patch('/entradas/:id', async (c) => {
  const supabase = c.get('supabase');
  const body = esquemaEntrada.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('time_entries').update(body.data).eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo actualizar la entrada');
  return c.json({ success: true });
});

// DELETE /horarios/entradas/:id
rutasHorarios.delete('/entradas/:id', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase.from('time_entries').delete().eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo eliminar la entrada');
  return c.json({ success: true });
});

// POST /horarios/permisos — solicitar permiso.
rutasHorarios.post('/permisos', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({
    organization_id: z.string().uuid(),
    user_id: z.string().uuid(),
    reason: z.string().min(1),
    date: z.string(),
    estimated_hours: z.number().positive(),
    makeup_date: z.string().nullable().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('permissions').insert({
    organization_id: body.data.organization_id,
    user_id: body.data.user_id,
    reason: body.data.reason.trim(),
    date: body.data.date,
    estimated_hours: body.data.estimated_hours,
    makeup_date: body.data.makeup_date ?? null,
  });
  if (error) return mapearError(c, error, 'No se pudo enviar la solicitud');
  return c.json({ success: true });
});

// PATCH /horarios/permisos/:id — aprobar/rechazar.
rutasHorarios.patch('/permisos/:id', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ status: z.enum(['approved', 'rejected']) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('permissions').update({ status: body.data.status }).eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo actualizar el estado');
  return c.json({ success: true });
});