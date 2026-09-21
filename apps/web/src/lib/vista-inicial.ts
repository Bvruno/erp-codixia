import type { DefaultView } from '@/types';

// Resuelve la vista por defecto del perfil a una ruta de la app.
export const RUTA_POR_VISTA: Record<DefaultView, string> = {
  calendario: '/calendario',
  proyectos: '/proyectos',
  pipeline: '/pipeline',
};

export function rutaVistaPorDefecto(
  vista: DefaultView | null | undefined,
): string {
  return (vista && RUTA_POR_VISTA[vista]) || '/calendario';
}
