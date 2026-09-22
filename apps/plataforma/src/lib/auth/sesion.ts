import { createClient } from '../supabase/client';

export interface SesionUsuario {
  userId: string;
  email: string | undefined;
  accessToken: string;
  refreshToken: string;
}

// Punto único de lectura de la sesión (regla de arquitectura: supabase-js
// browser solo en lib/auth y lib/api/cliente.ts).
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
