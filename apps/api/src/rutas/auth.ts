import { Hono } from 'hono';
import { z } from 'zod';
import { crearClienteJwt } from '../supabase/verificar-token';
import { getAdminClient } from '../lib/supabase/admin';
import { hashInviteToken } from '@erp/shared';
import { verificarJwtMiddleware } from '../middleware/verificar-jwt';
import { esPlatformAdmin } from '../middleware/requerir-plataforma';
import { emitirEvento } from '../lib/telegram-plataforma';
import { resolveOAuthNewUser, updateOAuthProfile } from '../lib/auth/oauth';

export const rutasAuth = new Hono();

const esquemaLogin = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  invite: z.string().optional(),
});

const esquemaSignup = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  consent: z.literal('on'),
  invite: z.string().min(1),
});

const esquemaReset = z.object({ email: z.string().email() });
const esquemaNuevaPassword = z.object({ password: z.string().min(6) });
const esquemaOnboarding = z.object({
  org_name: z.string().min(1),
  timezone: z.string().default('America/Mexico_City'),
  daily_hours: z.coerce.number().min(1).max(24).default(8),
  weekly_hours: z.coerce.number().min(1).max(168).default(40),
});

// POST /auth/login — inicia sesión con email/password.
// Devuelve la sesión (el SPA la usa para el JWT); valida bloqueo/org.
rutasAuth.post('/login', async (c) => {
  const body = esquemaLogin.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: 'Email y contraseña requeridos' }, 400);
  }
  const { email, password, invite } = body.data;

  const supabase = crearClienteJwt();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return c.json({ error: error.message }, 401);
  if (!data.session || !data.user) {
    return c.json({ error: 'No se pudo iniciar sesión' }, 401);
  }

  const { data: perfil } = await getAdminClient()
    .from('profiles')
    .select('blocked, organization_id')
    .eq('id', data.user.id)
    .maybeSingle();

  if (perfil?.blocked) {
    await supabase.auth.signOut();
    return c.json(
      { error: 'Tu cuenta está bloqueada. Contacta al administrador.' },
      403
    );
  }

  if (perfil?.organization_id) {
    const { data: org } = await getAdminClient()
      .from('organizations')
      .select('status')
      .eq('id', perfil.organization_id)
      .maybeSingle();
    if (org?.status === 'suspendida') {
      await supabase.auth.signOut();
      return c.json(
        {
          error: 'La empresa está suspendida. Contacta al soporte de la plataforma.',
          code: 'empresa_suspendida',
        },
        403
      );
    }
    return c.json({ session: data.session, redirect: '/' });
  }

  const { data: esPlataforma } = await getAdminClient()
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (esPlataforma) {
    return c.json({ session: data.session, redirect: '/', plataforma: true });
  }

  if (invite) {
    const { data: invitacion } = await supabase.rpc('get_invitation', {
      p_token: await hashInviteToken(invite),
    });
    if (invitacion && invitacion.length > 0) {
      return c.json({
        session: data.session,
        redirect: `/invitacion/${invite}`,
      });
    }
  }
  await supabase.auth.signOut();
  return c.json({ error: 'no-access' }, 403);
});

// POST /auth/signup — registro solo por invitación (sin registro público).
rutasAuth.post('/signup', async (c) => {
  const body = esquemaSignup.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: 'Datos de registro inválidos' }, 400);
  }
  const { email, password, full_name, invite } = body.data;

  const supabase = crearClienteJwt();
  const { data: invitacion } = await supabase.rpc('get_invitation', {
    p_token: await hashInviteToken(invite),
  });
  if (!invitacion || invitacion.length === 0) {
    return c.json({ error: 'Link de invitación inválido o expirado' }, 400);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  });
  if (error) return c.json({ error: error.message }, 400);
  if (!data.user) return c.json({ error: 'No se pudo crear el usuario' }, 400);

  if (!data.session) {
    return c.json({
      info: 'Revisa tu email para confirmar la cuenta antes de continuar.',
    });
  }

  return c.json({ session: data.session, redirect: `/invitacion/${invite}` });
});

// POST /auth/reset-password — envía el correo de restablecimiento.
rutasAuth.post('/reset-password', async (c) => {
  const body = esquemaReset.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Email requerido' }, 400);

  const supabase = crearClienteJwt();
  const { error } = await supabase.auth.resetPasswordForEmail(body.data.email, {
    redirectTo: `${process.env.WEB_ORIGIN}/restablecer-password`,
  });
  if (error) return c.json({ error: error.message }, 400);

  return c.json({
    info: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.',
  });
});

// POST /auth/nueva-password — actualiza la contraseña con sesión vigente.
rutasAuth.post('/nueva-password', verificarJwtMiddleware, async (c) => {
  const body = esquemaNuevaPassword.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
  }
  const supabase = crearClienteJwt();
  const { error } = await supabase.auth.updateUser({ password: body.data.password });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ success: true });
});

// POST /auth/oauth/decide — decide si un usuario de Google sin org puede
// continuar (solo con invitación válida) y enriquece su perfil.
rutasAuth.post('/oauth/decide', verificarJwtMiddleware, async (c) => {
  const { next } = await c.req.json<{ next?: string }>();
  const usuario = c.get('usuario');
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/';

  const { data: perfil } = await getAdminClient()
    .from('profiles')
    .select('organization_id')
    .eq('id', usuario.id)
    .maybeSingle();

  const { data: authUser } = await getAdminClient().auth.admin.getUserById(usuario.id);
  const meta = authUser.user?.user_metadata ?? {};

  if (perfil?.organization_id) {
    await updateOAuthProfile(
      usuario.id,
      meta.full_name || meta.name || authUser.user?.email?.split('@')[0],
      meta.avatar_url || meta.picture || null
    );
    return c.json({ redirect: safeNext });
  }

  const decision = await resolveOAuthNewUser(safeNext);
  if (!decision.allow) {
    return c.json(
      {
        error:
          decision.reason === 'invite-invalid'
            ? 'invite-invalid'
            : 'google-no-account',
      },
      403
    );
  }

  await updateOAuthProfile(
    usuario.id,
    meta.full_name || meta.name || authUser.user?.email?.split('@')[0],
    meta.avatar_url || meta.picture || null
  );

  return c.json({ redirect: safeNext });
});

// POST /auth/onboarding — completa el onboarding del dueño
// (reclama la org + define nombre y ajustes globales).
rutasAuth.post('/onboarding', verificarJwtMiddleware, async (c) => {
  const body = esquemaOnboarding.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: 'El nombre de la empresa es obligatorio' }, 400);
  }
  const usuario = c.get('usuario');
  if (!usuario.perfil?.organization_id) {
    return c.json({ error: 'no-access' }, 403);
  }
  if (!usuario.perfil.onboarding_pending) {
    return c.json({ error: 'El onboarding ya fue completado' }, 400);
  }

  const admin = getAdminClient();
  const { data: perfil } = await admin
    .from('profiles')
    .select('organization_id, onboarding_pending')
    .eq('id', usuario.id)
    .maybeSingle();
  if (!perfil?.organization_id) return c.json({ error: 'no-access' }, 403);
  if (!perfil.onboarding_pending) {
    return c.json({ error: 'El onboarding ya fue completado' }, 400);
  }

  const { data: claimed, error: claimErr } = await admin.rpc('claim_organization', {
    p_org_id: perfil.organization_id,
    p_user_id: usuario.id,
  });
  if (claimErr || claimed === false) {
    await admin.from('profiles').update({ onboarding_pending: false }).eq('id', usuario.id);
    return c.json({ error: 'La empresa ya fue reclamada por otro usuario' }, 409);
  }

  const { error: orgErr } = await admin
    .from('organizations')
    .update({ name: body.data.org_name })
    .eq('id', perfil.organization_id);
  if (orgErr) return c.json({ error: 'Error guardando la empresa' }, 500);

  const { error: settingsErr } = await admin.from('org_settings').upsert(
    {
      organization_id: perfil.organization_id,
      daily_hours: body.data.daily_hours,
      weekly_hours: body.data.weekly_hours,
      timezone: body.data.timezone,
    },
    { onConflict: 'organization_id' }
  );
  if (settingsErr) return c.json({ error: 'Error guardando la configuración' }, 500);

  const { error: flagErr } = await admin
    .from('profiles')
    .update({ onboarding_pending: false })
    .eq('id', usuario.id);
  if (flagErr) return c.json({ error: 'Error finalizando la configuración' }, 500);

  // La solicitud de owner queda activada cuando la empresa ya tiene dueño.
  await admin
    .from('owner_applications')
    .update({ estado: 'activada', updated_at: new Date().toISOString() })
    .eq('organization_id', perfil.organization_id)
    .in('estado', ['pendiente', 'en_revision', 'aprobada', 'invitada']);

  void emitirEvento(
    'empresa_activada',
    {
      empresa: body.data.org_name,
      owner: usuario.email ?? usuario.perfil?.full_name ?? 'owner',
    },
    { entidadTipo: 'organization', entidadId: perfil.organization_id }
  );

  return c.json({ success: true, redirect: '/' });
});

// GET /auth/estado — usuario actual + perfil (para guards del SPA).
rutasAuth.get('/estado', verificarJwtMiddleware, async (c) => {
  const usuario = c.get('usuario');
  const esPlataforma = await esPlatformAdmin(usuario.id);
  return c.json({ ...usuario, es_plataforma: esPlataforma });
});

