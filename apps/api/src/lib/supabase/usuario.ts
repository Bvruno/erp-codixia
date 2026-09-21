import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createMiddleware } from 'hono/factory';
import { fetchConLog } from '../log';

interface ClienteCache {
  cliente: SupabaseClient;
  expira: number;
}

const TTL_FALLBACK_MS = 60_000;

// Cache de clientes por access_token: evita repetir el setSession
// (y su getUser interno) en cada request. El token dura ~1h; las
// entradas vencen con el propio JWT.
const clientes = new Map<string, ClienteCache>();

function expiraDeToken(accessToken: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')
    );
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch {
    // token no decodificable: TTL corto
  }
  return Date.now() + TTL_FALLBACK_MS;
}

function purgarExpirados(): void {
  const ahora = Date.now();
  for (const [clave, valor] of clientes) {
    if (valor.expira <= ahora) clientes.delete(clave);
  }
}

// Decodifica el `sub` del JWT sin verificar firma: el token ya llega del SPA
// y la autorización real es RLS (un sub falsificado solo produce queries
// vacías). Evita el roundtrip de auth.getUser() que hacían los handlers.
function userIdDeToken(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')
    );
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

// Cliente anon-key con la sesión del usuario (access+refresh que envía
// el SPA). setSession inyecta el JWT del usuario: RLS aplica con
// auth.uid() igual que con acceso directo del browser — los permisos
// (entity_permission, entity_visibility, triggers) se deciden en la BD,
// sin replicar la lógica en la API.
export async function crearClienteUsuario(
  accessToken: string,
  refreshToken: string
): Promise<SupabaseClient | null> {
  purgarExpirados();
  const cacheado = clientes.get(accessToken);
  if (cacheado && cacheado.expira > Date.now()) return cacheado.cliente;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchConLog('usuario') },
    }
  );
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) return null;

  clientes.set(accessToken, { cliente: supabase, expira: expiraDeToken(accessToken) });
  return supabase;
}

export function limpiarClientesUsuario(): void {
  clientes.clear();
}

// Variables que clienteUsuarioMiddleware deja en el contexto de las rutas
// de datos: cliente con RLS del usuario + su id (derivado del JWT).
export interface VariablesDatos {
  supabase: SupabaseClient;
  usuarioId: string;
}

// Middleware para rutas de datos: resuelve el cliente Supabase con la
// sesión del usuario (RLS) desde Authorization + X-Refresh-Token.
// Encadenar DESPUÉS de verificarJwtMiddleware: c.set('supabase', ...).
export const clienteUsuarioMiddleware = createMiddleware<{
  Variables: VariablesDatos;
}>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const accessToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  const refreshToken = c.req.header('X-Refresh-Token');
  if (!accessToken || !refreshToken) {
    return c.json({ error: 'No autenticado' }, 401);
  }
  const usuarioId = userIdDeToken(accessToken);
  if (!usuarioId) {
    return c.json({ error: 'Sesión inválida o expirada' }, 401);
  }
  const supabase = await crearClienteUsuario(accessToken, refreshToken);
  if (!supabase) {
    return c.json({ error: 'Sesión inválida o expirada' }, 401);
  }
  c.set('supabase', supabase);
  c.set('usuarioId', usuarioId);
  await next();
});