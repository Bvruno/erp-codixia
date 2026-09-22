import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './rutas/route-tree.gen';
import { iniciarTema } from './lib/tema';
import './estilos/globals.css';

iniciarTema();

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Nodo raíz no encontrado');

createRoot(raiz).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
