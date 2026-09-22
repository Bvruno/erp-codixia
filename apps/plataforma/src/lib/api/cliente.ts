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
    'X-Refresh-Token': sesion.refresh_token,
  };
}

export async function apiFetch<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const multipart = init.body instanceof FormData;
  const cabeceras = new Headers(init.headers);
  if (!multipart) {
    const sesion = await sesionHeaders();
    for (const [clave, valor] of Object.entries(sesion)) {
      if (!cabeceras.has(clave)) cabeceras.set(clave, valor);
    }
  }

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
  delete: <T>(ruta: string, cuerpo?: unknown) =>
    apiFetch<T>(ruta, {
      method: 'DELETE',
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    }),
};
