import type { ThemePreference } from '@/types';

// Fuente única del tema: la preferencia guardada en el perfil. `system` se
// resuelve con matchMedia y se mantiene suscrito a cambios del SO.

export type TemaResuelto = 'dark' | 'light';

export function resolverTema(theme: ThemePreference): TemaResuelto {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function aplicarTema(theme: ThemePreference): TemaResuelto {
  const resuelto = resolverTema(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-mode', resuelto);
  }
  return resuelto;
}

// Notifica cuando el SO cambia de tema mientras la preferencia es `system`.
export function suscribirTemaSistema(
  theme: ThemePreference,
  onCambio: (resuelto: TemaResuelto) => void,
): () => void {
  if (theme !== 'system' || typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => onCambio(mq.matches ? 'dark' : 'light');
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
