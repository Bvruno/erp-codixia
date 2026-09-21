import { createClient } from '../supabase/client';
import { API_URL } from './base';

export class ErrorApi extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(mensaje: string, status: number, code: string | null = null) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.code = code;
  }
}

async function sesionHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  const sesion = data.session;
  if (!sesion) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sesion.access_token}`,
    // La API re-crea la sesión del usuario con setSession (mismo patrón
    // que la pasarela /cws) para que RLS aplique con auth.uid().
    'X-Refresh-Token': sesion.refresh_token,
  };
}

// Dedup de GETs concurrentes: StrictMode dobla los efectos en dev y el
// remount de rutas re-lanza la misma lectura; aquí las peticiones en
// vuelo con la misma clave comparten una sola promise → 1 request real.
// Solo GETs idempotentes y sin signal propia (con signal el caller
// gestiona su cancelación y no puede compartirse la petición).
const enVuelo = new Map<string, Promise<unknown>>();

function claveDedupe(ruta: string, init: RequestInit): string | null {
  if ((init.method ?? 'GET').toUpperCase() !== 'GET') return null;
  if (init.signal) return null;
  return `GET ${ruta}`;
}

export async function apiFetch<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const clave = claveDedupe(ruta, init);
  if (clave) {
    const existente = enVuelo.get(clave);
    if (existente) return existente as Promise<T>;
  }

  const multipart = init.body instanceof FormData;
  const cabeceras = new Headers(init.headers);
  if (!multipart) {
    const sesion = await sesionHeaders();
    for (const [claveHeader, valor] of Object.entries(sesion)) {
      if (!cabeceras.has(claveHeader)) cabeceras.set(claveHeader, valor);
    }
  }

  // Re-chequeo tras resolver headers: dos callers concurrentes pudieron
  // entrar mientras se resolvía la sesión.
  if (clave) {
    const existente = enVuelo.get(clave);
    if (existente) return existente as Promise<T>;
  }

  const ejecutar = async (): Promise<T> => {
    const res = await fetch(`${API_URL}${ruta}`, { ...init, headers: cabeceras });

    if (!res.ok) {
      let mensaje = 'Error del servidor';
      let code: string | null = null;
      try {
        const cuerpo = (await res.json()) as { error?: unknown; code?: unknown };
        if (typeof cuerpo.error === 'string' && cuerpo.error) mensaje = cuerpo.error;
        if (typeof cuerpo.code === 'string') code = cuerpo.code;
      } catch {
        // respuesta sin cuerpo JSON
      }
      throw new ErrorApi(mensaje, res.status, code);
    }

    return (await res.json()) as T;
  };

  if (!clave) return ejecutar();

  const promesa = ejecutar().finally(() => {
    if (enVuelo.get(clave) === promesa) enVuelo.delete(clave);
  });
  enVuelo.set(clave, promesa);
  return promesa;
}

// Descarga binaria autenticada (export JSON/xlsx): el parseo JSON de
// apiFetch no sirve cuando la respuesta es un archivo.
export async function descargarApi(ruta: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${ruta}`, { headers: await sesionHeaders() });
  if (!res.ok) throw new ErrorApi('No se pudo descargar el archivo', res.status);
  return res.blob();
}

export const api = {
  get: <T>(ruta: string) => apiFetch<T>(ruta),
  post: <T>(ruta: string, cuerpo?: unknown) =>
    apiFetch<T>(ruta, {
      method: 'POST',
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    }),
  patch: <T>(ruta: string, cuerpo: unknown) =>
    apiFetch<T>(ruta, { method: 'PATCH', body: JSON.stringify(cuerpo) }),
  put: <T>(ruta: string, cuerpo: unknown) =>
    apiFetch<T>(ruta, { method: 'PUT', body: JSON.stringify(cuerpo) }),
  delete: <T>(ruta: string, init?: RequestInit) =>
    apiFetch<T>(ruta, { ...init, method: 'DELETE' }),
};