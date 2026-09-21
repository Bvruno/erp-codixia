// Claves y TTLs del cache de navegador (lib/cache.ts), centralizados para
// que cada dominio use el mismo nombre y política de frescura.
// Versionar el sufijo `:vN` al cambiar el shape del payload cacheado.

export const TTL_CACHE = {
  /** Estructura de entidades (árbol): revalidate frecuente. */
  estructura: 60_000,
  /** Datos agregados de calendario. */
  calendario: 3 * 60_000,
  /** Perfil propio (cambia poco). */
  perfil: 10 * 60_000,
  /** Catálogos semi-estáticos: turnos, asignables, contexto de listas. */
  catalogo: 30 * 60_000,
} as const;

export const claveEstructura = (userId: string): string => `cs:structure:v1:${userId}`;

export const claveCalendario = (orgId: string): string => `cs:calendar:v1:${orgId}`;

export const clavePerfil = (userId: string): string => `cs:perfil:v1:${userId}`;

export type CatalogoTipo = 'shifts' | 'asignables' | 'contexto';

export const claveCatalogo = (orgId: string, tipo: CatalogoTipo): string =>
  `cs:catalogo:v1:${orgId}:${tipo}`;

export const clavePreferencias = (userId: string): string => `cs:prefs:v1:${userId}`;

// Punteros al último valor usado (org/user), para poder hidratar antes de
// que la primera respuesta de red identifique la organización del usuario.
export const INDICE_CALENDARIO = 'cs:calendar:v1:indice';
export const INDICE_PERFIL = 'cs:perfil:v1:indice';
