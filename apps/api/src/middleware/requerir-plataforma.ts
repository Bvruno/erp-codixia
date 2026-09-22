import { createMiddleware } from 'hono/factory';
import { getAdminClient } from '../lib/supabase/admin';
import type { ContextoUsuario } from './verificar-jwt';

// Guard de superadmin de plataforma: exige fila en platform_admins.
// Cache corta en memoria; las mutaciones de admins invalidan explícito.

const CACHE_MS = 30_000;
const cache = new Map<string, { es: boolean; expira: number }>();

export function invalidarPlataformaCache(userId: string): void {
  cache.delete(userId);
}

export async function esPlatformAdmin(userId: string): Promise<boolean> {
  const ahora = Date.now();
  const cacheado = cache.get(userId);
  if (cacheado && cacheado.expira > ahora) return cacheado.es;

  const { data } = await getAdminClient()
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  const es = Boolean(data);
  cache.set(userId, { es, expira: ahora + CACHE_MS });
  return es;
}

export const requerirPlataforma = createMiddleware<{
  Variables: { usuario: ContextoUsuario };
}>(async (c, next) => {
  const usuario = c.get('usuario');
  if (!usuario || !(await esPlatformAdmin(usuario.id))) {
    return c.json({ error: 'Se requieren permisos de plataforma' }, 403);
  }
  await next();
});
