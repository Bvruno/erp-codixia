import { createClient } from '../supabase/client';
import { API_URL } from '../api/base';
import { rutaVistaPorDefecto } from '../vista-inicial';
import { sesionActual, type SesionUsuario } from './sesion';
import { decidirOAuth } from './actions';

const ESPERA_SESION_MS = 8000;

function desdeSesion(sesion: {
  user: { id: string; email?: string };
  access_token: string;
  refresh_token: string;
}): SesionUsuario {
  return {
    userId: sesion.user.id,
    email: sesion.user.email,
    accessToken: sesion.access_token,
    refreshToken: sesion.refresh_token,
  };
}

// supabase-js procesa el ?code= del callback en background; esperamos a que la
// sesión quede persistida (con tope de tiempo) antes de decidir el redirect.
async function esperarSesion(esperaMs: number): Promise<SesionUsuario | null> {
  const inicial = await sesionActual();
  if (inicial) return inicial;

  const cliente = createClient();
  return new Promise((resolve) => {
    let resuelto = false;
    const pendientes: {
      temporizador?: ReturnType<typeof setTimeout>;
      desuscribir?: () => void;
    } = {};

    const terminar = (sesion: SesionUsuario | null) => {
      if (resuelto) return;
      resuelto = true;
      if (pendientes.temporizador) clearTimeout(pendientes.temporizador);
      pendientes.desuscribir?.();
      resolve(sesion);
    };

    const { data } = cliente.auth.onAuthStateChange((_evento, sesion) => {
      if (sesion) terminar(desdeSesion(sesion));
    });
    pendientes.desuscribir = () => data.subscription.unsubscribe();

    pendientes.temporizador = setTimeout(() => {
      void sesionActual().then((sesion) => terminar(sesion));
    }, esperaMs);

    void sesionActual().then((sesion) => {
      if (sesion) terminar(sesion);
    });
  });
}

function sanitizarNext(next: string | null | undefined): string | null {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return null;
}

export interface OpcionesCallback {
  next?: string | null;
  error?: string | null;
  esperaMs?: number;
}

export async function resolverCallbackOAuth({
  next,
  error,
  esperaMs = ESPERA_SESION_MS,
}: OpcionesCallback): Promise<{ redirect: string }> {
  if (error) return { redirect: '/login?error=auth' };

  const sesion = await esperarSesion(esperaMs);
  if (!sesion) return { redirect: '/login?error=auth' };

  const res = await fetch(`${API_URL}/auth/estado`, {
    headers: { Authorization: `Bearer ${sesion.accessToken}` },
  });
  if (res.status === 403) {
    await createClient().auth.signOut();
    return { redirect: '/login?error=blocked' };
  }
  if (!res.ok) {
    await createClient().auth.signOut();
    return { redirect: '/login?error=auth' };
  }

  const estado = await res.json().catch(() => null);
  if (estado?.perfil?.onboarding_pending) {
    return { redirect: '/onboarding' };
  }

  const destino =
    sanitizarNext(next) ??
    rutaVistaPorDefecto(estado?.perfil?.preferences?.default_view);

  const decision = await decidirOAuth(destino);
  if (decision.error) {
    await createClient().auth.signOut();
    return { redirect: `/login?error=${decision.error}` };
  }

  return { redirect: decision.redirect ?? destino };
}
