'use client';

import { useQuery } from '@tanstack/react-query';
import { sesionActual } from './auth/sesion';
import { apiFetch } from './api/cliente';
import { TTL_CACHE } from './cache-claves';
import type { OrgSettings, Profile, Schedule } from '@/types';

export type PerfilPayload = {
  profile: Profile | null;
  organization: { name: string; owner_id: string } | null;
  org_settings: OrgSettings | null;
  schedules: Schedule[];
  email: string;
};

// Consulta compartida de /perfil: una única entrada de caché para todas las
// vistas (antes cada página pedía el mismo endpoint con su propia queryKey).
// La hidratación desde IndexedDB ocurre en el loader de `_aplicacion`.
// `enabled: false` permite observar la caché sin disparar el GET (layout).
export function usePerfil(opciones?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['perfil', 'datos'],
    queryFn: async (): Promise<PerfilPayload> => {
      const sesion = await sesionActual();
      const res = await apiFetch<Omit<PerfilPayload, 'email'>>('/perfil').catch(() => null);
      return {
        profile: res?.profile ?? null,
        organization: res?.organization ?? null,
        org_settings: res?.org_settings ?? null,
        schedules: res?.schedules ?? [],
        email: sesion?.email || '',
      };
    },
    staleTime: TTL_CACHE.perfil,
    refetchOnWindowFocus: false,
    enabled: opciones?.enabled ?? true,
  });
}
