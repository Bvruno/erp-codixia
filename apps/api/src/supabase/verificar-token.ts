import { createClient } from '@supabase/supabase-js';
import { fetchConLog } from '../lib/log';

// Cliente con anon key: sirve para verificar JWTs (supabase.auth.getUser)
// y para queries que dependen de RLS con la identidad del usuario.
export function crearClienteJwt() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchConLog('jwt') },
    }
  );
}

export interface UsuarioVerificado {
  id: string;
  email?: string;
}

// Cache de verificaciones por token: evita una llamada a GoTrue en cada
// request autenticado. TTL corto (60s) acota la ventana de revocación.
const JWT_CACHE_MS = 60_000;
const MAX_ENTRADAS = 1_000;
const cacheVerificaciones = new Map<string, { usuario: UsuarioVerificado | null; expira: number }>();

function purgarCache(): void {
  const ahora = Date.now();
  for (const [token, entrada] of cacheVerificaciones) {
    if (entrada.expira <= ahora) cacheVerificaciones.delete(token);
  }
}

// Verifica el JWT de acceso contra GoTrue. Devuelve null si es inválido.
export async function verificarJwt(token: string): Promise<UsuarioVerificado | null> {
  const ahora = Date.now();
  const cacheado = cacheVerificaciones.get(token);
  if (cacheado && cacheado.expira > ahora) return cacheado.usuario;

  const supabase = crearClienteJwt();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  const usuario = error || !user ? null : { id: user.id, email: user.email ?? undefined };
  if (cacheVerificaciones.size >= MAX_ENTRADAS) purgarCache();
  cacheVerificaciones.set(token, { usuario, expira: ahora + JWT_CACHE_MS });
  return usuario;
}