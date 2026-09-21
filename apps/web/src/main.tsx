import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from './rutas/route-tree.gen';
import { alCambiarCache, cacheDel, cacheSet } from './lib/cache';
import { claveCalendario, clavePerfil } from './lib/cache-claves';
import { queryClient } from './lib/query-client';
import { invalidarPorClavesCache } from './lib/cache-invalidacion';
import './estilos/globals.css';

const router = createRouter({ routeTree });

// Otra pestaña mutó datos: descarta la copia local e invalida SOLO las
// queries afectadas (invalidar todo provocaba refetch masivo con varias
// pestañas abiertas).
alCambiarCache((claves) => {
  for (const clave of claves) void cacheDel(clave);
  invalidarPorClavesCache(queryClient, claves);
});

// Persistencia central en IndexedDB de las consultas transversales
// (perfil y calendario se piden desde varias vistas con la misma clave).
queryClient.getQueryCache().subscribe((evento) => {
  if (evento.type !== 'updated') return;
  const query = evento.query;
  const datos = query.state.data as
    | { profile?: { id?: string; organization_id?: string | null } }
    | undefined;
  if (!datos?.profile) return;
  if (query.queryKey[0] === 'perfil' && datos.profile.id) {
    void cacheSet(clavePerfil(datos.profile.id), datos);
  }
  if (query.queryKey[0] === 'calendario' && datos.profile.organization_id) {
    void cacheSet(claveCalendario(datos.profile.organization_id), datos);
  }
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Nodo raíz no encontrado');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);