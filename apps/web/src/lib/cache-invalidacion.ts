import type { QueryClient } from '@tanstack/react-query';

// Traduce claves de la caché del navegador (BroadcastChannel `cs-cache`) a
// las queryKeys de React Query que deben invalidarse. Invalidar TODO ante
// cualquier cambio provocaba refetches masivos con varias pestañas abiertas.
//
// Preferencias y estructura viven fuera de React Query (su realtime propio
// las refresca), así que no generan invalidaciones.
export function invalidarPorClavesCache(queryClient: QueryClient, claves: string[]): void {
  const raices = new Set<string>();
  let global = false;
  for (const clave of claves) {
    if (clave.startsWith('cs:calendar:v1:')) raices.add('calendario');
    else if (clave.startsWith('cs:perfil:v1:')) raices.add('perfil');
    else if (clave.startsWith('cs:prefs:v1:') || clave.startsWith('cs:structure:v1:')) continue;
    else global = true;
  }
  for (const raiz of raices) void queryClient.invalidateQueries({ queryKey: [raiz] });
  if (global) void queryClient.invalidateQueries();
}
