import { Hono } from 'hono';
import { z } from 'zod';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { invalidarPerfilCache } from '../middleware/verificar-jwt';
import { mapearError } from './entidades';

export const rutasPerfil = new Hono<{ Variables: VariablesDatos }>();

rutasPerfil.use('/*', clienteUsuarioMiddleware);

// GET /perfil — perfil + org + settings + horarios.
rutasPerfil.get('/', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const { data: profile, error: pErr } = await supabase.from('profiles').select('*').eq('id', usuarioId).single();
  if (pErr || !profile) return c.json({ error: 'Perfil no encontrado' }, 404);

  if (!profile.organization_id) {
    return c.json({ profile });
  }
  const [orgRes, settingsRes, schedRes] = await Promise.all([
    supabase.from('organizations').select('name, owner_id').eq('id', profile.organization_id).single(),
    supabase.from('org_settings').select('daily_hours, weekly_hours').eq('organization_id', profile.organization_id).maybeSingle(),
    supabase.from('schedules').select('*, shift:shifts(*)').eq('organization_id', profile.organization_id),
  ]);

  return c.json({
    profile,
    organization: orgRes.data ?? null,
    org_settings: settingsRes.data ?? null,
    schedules: schedRes.data ?? [],
  });
});

const esquemaDatos = z.object({
  full_name: z.string().min(1),
  position: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  alternate_phones: z.array(z.string()).optional(),
  emergency_contacts: z.array(z.object({ name: z.string(), phone: z.string(), relationship: z.string() })).optional(),
});

// PATCH /perfil — datos personales.
rutasPerfil.patch('/', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const body = esquemaDatos.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: body.data.full_name.trim(),
      position: body.data.position ?? null,
      phone: body.data.phone ?? null,
      bio: body.data.bio ?? null,
      birth_date: body.data.birth_date ?? null,
      address: body.data.address ?? null,
      alternate_phones: body.data.alternate_phones ?? [],
      emergency_contacts: body.data.emergency_contacts ?? [],
    })
    .eq('id', usuarioId);
  if (error) return mapearError(c, error, 'No se pudo guardar el perfil');
  invalidarPerfilCache(usuarioId);
  return c.json({ success: true });
});

// PATCH /perfil/horas — daily/weekly.
rutasPerfil.patch('/horas', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const body = z.object({ daily_hours: z.number().min(1).max(24), weekly_hours: z.number().min(1).max(168) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('profiles').update({ daily_hours: body.data.daily_hours, weekly_hours: body.data.weekly_hours }).eq('id', usuarioId);
  if (error) return mapearError(c, error, 'No se pudieron guardar las variables');
  invalidarPerfilCache(usuarioId);
  return c.json({ success: true });
});

// PUT /perfil/preferencias
rutasPerfil.put('/preferencias', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const body = z.object({ preferences: z.record(z.unknown()) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('profiles').update({ preferences: body.data.preferences }).eq('id', usuarioId);
  if (error) return mapearError(c, error, 'No se pudieron guardar las preferencias');
  invalidarPerfilCache(usuarioId);
  return c.json({ success: true });
});

// GET /perfil/preferencias — para sync best-effort (theme).
rutasPerfil.get('/preferencias', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const { data, error } = await supabase.from('profiles').select('preferences').eq('id', usuarioId).single();
  if (error) return mapearError(c, error);
  return c.json({ preferences: data?.preferences ?? null });
});

// PATCH /organizacion — renombrar org.
rutasPerfil.patch('/organizacion', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ organization_id: z.string().uuid(), name: z.string().min(1) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('organizations').update({ name: body.data.name.trim() }).eq('id', body.data.organization_id);
  if (error) return mapearError(c, error, 'No se pudo guardar el nombre');
  return c.json({ success: true });
});

// PUT /organizacion/settings — límites org.
rutasPerfil.put('/organizacion/settings', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({
    organization_id: z.string().uuid(),
    daily_hours: z.number().min(1).max(24),
    weekly_hours: z.number().min(1).max(168),
    timezone: z.string().min(1),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('org_settings').upsert(
    {
      organization_id: body.data.organization_id,
      daily_hours: body.data.daily_hours,
      weekly_hours: body.data.weekly_hours,
      timezone: body.data.timezone,
    },
    { onConflict: 'organization_id' }
  );
  if (error) return mapearError(c, error, 'No se pudieron guardar los límites');
  return c.json({ success: true });
});

// GET /organizacion/datos — nombre + settings.
rutasPerfil.get('/organizacion/datos', async (c) => {
  const supabase = c.get('supabase');
  const orgId = c.req.query('organization_id');
  if (!orgId) return c.json({ error: 'organization_id requerido' }, 400);
  const [orgRes, settingsRes] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', orgId).single(),
    supabase.from('org_settings').select('*').eq('organization_id', orgId).maybeSingle(),
  ]);
  if (orgRes.error) return mapearError(c, orgRes.error);
  return c.json({ name: orgRes.data?.name ?? '', settings: settingsRes.data ?? null });
});

// GET /telegram-config — config + chat_id del usuario.
rutasPerfil.get('/telegram-config', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const orgId = c.req.query('organization_id');
  if (!orgId) return c.json({ error: 'organization_id requerido' }, 400);
  const [configRes, profileRes] = await Promise.all([
    supabase.from('telegram_config').select('*').eq('organization_id', orgId).maybeSingle(),
    supabase.from('profiles').select('telegram_chat_id').eq('id', usuarioId).single(),
  ]);
  if (configRes.error) return mapearError(c, configRes.error);
  return c.json({ config: configRes.data ?? null, chat_id: profileRes.data?.telegram_chat_id ?? null });
});

// PUT /telegram-config — guardar config.
rutasPerfil.put('/telegram-config', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ organization_id: z.string().uuid(), bot_token: z.string().min(1), enabled: z.boolean() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('telegram_config').upsert(
    { organization_id: body.data.organization_id, bot_token: body.data.bot_token.trim(), enabled: body.data.enabled },
    { onConflict: 'organization_id' }
  );
  if (error) return mapearError(c, error, 'No se pudo guardar la configuración');
  return c.json({ success: true });
});