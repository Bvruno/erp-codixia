import { createClient } from '../supabase/client';

// Punto único de lectura de la sesión del SPA.
// La regla de arquitectura (apps/web/src/arquitectura.test.ts) permite
// supabase-js browser solo para auth/sesión: este helper concentra ese
// acceso para el resto de la app.

export interface SesionUsuario {
  userId: string;
  email: string | undefined;
  accessToken: string;
  refreshToken: string;
}

// Lectura local de la sesión (sin llamada de red): id + tokens.
// Supabase-js mantiene la sesión persistida y refresca el token en background.
export async function sesionActual(): Promise<SesionUsuario | null> {
  const { data } = await createClient().auth.getSession();
  const sesion = data.session;
  if (!sesion) return null;
  return {
    userId: sesion.user.id,
    email: sesion.user.email,
    accessToken: sesion.access_token,
    refreshToken: sesion.refresh_token,
  };
}
