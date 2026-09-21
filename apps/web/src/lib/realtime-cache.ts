import type { QueryKey } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

// Aplica eventos `postgres_changes` directamente a la caché de React Query
// en lugar de invalidar y esperar un refetch completo. El payload del WAL
// trae la fila completa (`new`); en UPDATE se mezcla con la fila previa para
// conservar los campos embebidos de la API (p. ej. `assigned_profile`).

export type EventoPG<T> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  new: T | Record<string, never>;
  old: Partial<T> & { id?: string };
};

export function leerEvento<T>(payload: unknown): EventoPG<T> | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const eventType = p.eventType;
  if (eventType !== 'INSERT' && eventType !== 'UPDATE' && eventType !== 'DELETE') return null;
  return {
    eventType,
    table: typeof p.table === 'string' ? p.table : '',
    new: (p.new ?? {}) as T,
    old: (p.old ?? {}) as Partial<T> & { id?: string },
  };
}

export function idDeEvento(evt: EventoPG<unknown>): string | null {
  const id = evt.eventType === 'DELETE' ? evt.old?.id : (evt.new as { id?: string })?.id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Upsert/remove de una fila en una lista cacheada. Devuelve la lista nueva y
 * `false` si no se pudo aplicar (no había data/evento), para que el caller
 * pueda caer a invalidación clásica.
 */
export function aplicarEventoLista<T extends { id: string }>(
  actual: T[] | undefined,
  evt: EventoPG<Record<string, unknown>>,
  merge?: (previo: T, nuevo: T) => T
): { lista: T[] | undefined; aplicado: boolean } {
  if (!actual) return { lista: actual, aplicado: false };

  const id = idDeEvento(evt);
  if (!id) return { lista: actual, aplicado: false };

  if (evt.eventType === 'DELETE') {
    // Borrado de una fila que no está en la lista local: no-op exitoso.
    if (!actual.some((x) => x.id === id)) return { lista: actual, aplicado: true };
    return { lista: actual.filter((x) => x.id !== id), aplicado: true };
  }

  const nuevo = evt.new as unknown as T;
  const previo = actual.find((x) => x.id === id);
  const fila = previo ? (merge ? merge(previo, nuevo) : { ...previo, ...nuevo }) : nuevo;
  const lista = previo
    ? actual.map((x) => (x.id === id ? fila : x))
    : [...actual, fila];
  return { lista, aplicado: true };
}

/** `setQueryData` tipado con updater; no-ops si la query no tiene data. */
export function parchearQuery<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (data: TData) => TData
): void {
  queryClient.setQueryData<TData>(queryKey, (prev) => (prev === undefined ? prev : updater(prev)));
}
