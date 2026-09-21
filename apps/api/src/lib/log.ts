import { AsyncLocalStorage } from 'node:async_hooks';

// Logs de flujo API → Supabase para desarrollo.
// Cada request recibe un id corto (#1, #2, ...) que prefija todas las
// llamadas a Supabase que ese request provoca, así el orden se lee
// directamente en consola:
//
//   [api] #7 ← GET /entidades/arbol
//   [supabase:usuario] #7 GET /rest/v1/rpc/get_arbol 200 42ms
//   [api] #7 → 200 48ms
//
// Activado por defecto fuera de producción; se desactiva con
// LOG_SUPABASE=0 (o se fuerza con LOG_SUPABASE=1). Nunca se loguean
// tokens, apikeys ni valores con pinta de email (ver sanearUrl).

const almacen = new AsyncLocalStorage<{ id: number }>();
let contador = 0;

export function logsActivos(): boolean {
  const valor = (process.env.LOG_SUPABASE ?? '').toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(valor)) return false;
  if (['1', 'true', 'on', 'yes'].includes(valor)) return true;
  return process.env.NODE_ENV !== 'production';
}

export function siguienteId(): number {
  contador += 1;
  return contador;
}

export function conRequestId<T>(id: number, fn: () => T): T {
  return almacen.run({ id }, fn);
}

function idActual(): number | null {
  return almacen.getStore()?.id ?? null;
}

export function logApi(mensaje: string): void {
  if (!logsActivos()) return;
  const id = idActual();
  console.log(id === null ? `[api] ${mensaje}` : `[api] #${id} ${mensaje}`);
}

export function logSupabase(etiqueta: string, mensaje: string): void {
  if (!logsActivos()) return;
  const id = idActual();
  const prefijo = id === null ? '' : ` #${id}`;
  console.log(`[supabase:${etiqueta}]${prefijo} ${mensaje}`);
}

// Oculta credenciales y datos personales que puedan viajar en la query
// (filtros `eq` con email, tokens de auth, apikey).
export function sanearUrl(cruda: string): string {
  try {
    const url = new URL(cruda);
    for (const [clave, valor] of url.searchParams) {
      if (/token|code|key|secret|password/i.test(clave) || valor.includes('@')) {
        url.searchParams.set(clave, '[redactado]');
      }
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return cruda;
  }
}

// fetch instrumentado para los clientes de supabase-js: loguea método,
// endpoint saneado, status y duración de cada llamada REST/Auth.
export function fetchConLog(etiqueta: string): typeof fetch {
  return async (input, init) => {
    if (!logsActivos()) return fetch(input, init);

    const cruda =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const metodo = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    const inicio = Date.now();
    try {
      const res = await fetch(input, init);
      logSupabase(etiqueta, `${metodo} ${sanearUrl(cruda)} ${res.status} ${Date.now() - inicio}ms`);
      return res;
    } catch (err) {
      logSupabase(
        etiqueta,
        `${metodo} ${sanearUrl(cruda)} ERROR ${Date.now() - inicio}ms (${err instanceof Error ? err.message : String(err)})`
      );
      throw err;
    }
  };
}
