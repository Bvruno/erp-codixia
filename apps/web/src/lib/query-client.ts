import { QueryClient } from '@tanstack/react-query';
import { cacheGet } from './cache';
import { claveCalendario, clavePerfil, TTL_CACHE } from './cache-claves';

// QueryClient único de la aplicación. Vive en un módulo (en vez de main.tsx)
// para que el loader de `_aplicacion` pueda hidratar la caché antes de que
// las páginas monten sus queries.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Hidrata desde IndexedDB las consultas transversales (perfil y calendario)
// ANTES de renderizar las páginas. Si la copia está fresca, React Query la
// considera vigente y se evita el GET de montaje; los eventos realtime y las
// mutaciones siguen invalidando.
export async function hidratarCacheNavegador(datos: {
  userId?: string | null;
  orgId?: string | null;
}): Promise<void> {
  const tareas: Promise<void>[] = [];

  if (datos.userId && !queryClient.getQueryData(['perfil', 'datos'])) {
    tareas.push(
      cacheGet(clavePerfil(datos.userId), TTL_CACHE.perfil).then((entrada) => {
        if (entrada) queryClient.setQueryData(['perfil', 'datos'], entrada.value);
      })
    );
  }

  if (datos.orgId && !queryClient.getQueryData(['calendario', 'datos'])) {
    tareas.push(
      cacheGet(claveCalendario(datos.orgId), TTL_CACHE.calendario).then((entrada) => {
        if (entrada) queryClient.setQueryData(['calendario', 'datos'], entrada.value);
      })
    );
  }

  await Promise.all(tareas);
}
