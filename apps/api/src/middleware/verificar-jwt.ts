import { createMiddleware } from 'hono/factory';
import { verificarJwt } from '../supabase/verificar-token';
import { getAdminClient } from '../lib/supabase/admin';

export interface ContextoUsuario {
  id: string;
  email?: string;
  perfil: {
    role: string;
    is_owner: boolean;
    blocked: boolean;
    organization_id: string | null;
    org_status?: string | null;
    onboarding_pending: boolean;
    access_mode: string;
    full_name?: string | null;
    preferences?: Record<string, unknown> | null;
  } | null;
}

// Cache del perfil por usuario: la lectura fresca es defensa en profundidad
// (blocked/rol/org cambian en runtime), pero no hace falta en cada request.
// TTL corto + invalidación explícita desde las mutaciones (miembros/perfil).
const PERFIL_CACHE_MS = 15_000;
const cachePerfiles = new Map<string, { perfil: ContextoUsuario['perfil']; expira: number }>();

export function invalidarPerfilCache(userId: string): void {
  cachePerfiles.delete(userId);
}

async function leerPerfil(userId: string): Promise<ContextoUsuario['perfil']> {
  const { data } = await getAdminClient()
    .from('profiles')
    .select(
      'role, is_owner, blocked, organization_id, onboarding_pending, access_mode, full_name, preferences, organizations(status)'
    )
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;
  const organizacion = data.organizations as { status?: string } | null;
  return {
    role: data.role,
    is_owner: data.is_owner,
    blocked: data.blocked,
    organization_id: data.organization_id,
    org_status: organizacion?.status ?? null,
    onboarding_pending: data.onboarding_pending,
    access_mode: data.access_mode,
    full_name: data.full_name,
    preferences: data.preferences,
  };
}

// last_active_at para estadísticas de uso: escritura throttleada (5 min)
// y en segundo plano; nunca bloquea ni rompe el request.
const ACTIVIDAD_MS = 5 * 60_000;
const ultimaActividad = new Map<string, number>();

function tocarActividad(userId: string): void {
  const ahora = Date.now();
  if (ahora - (ultimaActividad.get(userId) ?? 0) < ACTIVIDAD_MS) return;
  ultimaActividad.set(userId, ahora);
  void getAdminClient()
    .from('profiles')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', userId);
}

// Middleware de autenticación: exige Authorization: Bearer <jwt>.
// Adjunta el usuario verificado + su perfil (lectura fresca de BD,
// no del JWT: blocked/role/org cambian en runtime).
export const verificarJwtMiddleware = createMiddleware<{
  Variables: { usuario: ContextoUsuario };
}>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return c.json({ error: 'No autenticado' }, 401);
  }

  const usuario = await verificarJwt(token);
  if (!usuario) {
    return c.json({ error: 'Sesión inválida o expirada' }, 401);
  }

  const ahora = Date.now();
  const cacheado = cachePerfiles.get(usuario.id);
  const perfil =
    cacheado && cacheado.expira > ahora
      ? cacheado.perfil
      : await leerPerfil(usuario.id);
  if (!cacheado || cacheado.expira <= ahora) {
    cachePerfiles.set(usuario.id, { perfil, expira: ahora + PERFIL_CACHE_MS });
  }

  if (perfil?.blocked) {
    return c.json({ error: 'Tu cuenta está bloqueada' }, 403);
  }

  if (perfil?.org_status === 'suspendida') {
    return c.json(
      {
        error: 'La empresa está suspendida. Contacta al soporte de la plataforma.',
        code: 'empresa_suspendida',
      },
      403
    );
  }

  if (perfil) tocarActividad(usuario.id);

  c.set('usuario', { ...usuario, perfil });
  await next();
});