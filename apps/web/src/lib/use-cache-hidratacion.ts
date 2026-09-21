import { useCallback, useEffect, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { cacheGet, cacheSet } from '@/lib/cache';

// Hidratación del cache de navegador puenteada a React Query:
// - al montar, si hay copia fresca en IndexedDB, la inyecta como datos de
//   la query (paint inmediato); React Query revalida en background si stale
// - cuando llegan datos nuevos del fetch, los persiste para la próxima carga
//
// `clave` null desactiva (p. ej. aún no hay usuario/org resuelto).
export function useCacheHidratacion<T>(
  queryKey: QueryKey,
  clave: string | null,
  ttlMs: number,
  datos?: T
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!clave) return;
    let activo = true;
    const marca = `cs:hidrata:${clave}`;
    if (typeof performance !== 'undefined') performance.mark(`${marca}:inicio`);
    void cacheGet<T>(clave, ttlMs).then((entrada) => {
      if (!activo || !entrada) return;
      queryClient.setQueryData(queryKey, entrada.value);
      if (typeof performance !== 'undefined') {
        performance.measure(marca, `${marca}:inicio`);
      }
    });
    return () => {
      activo = false;
    };
    // La queryKey va serializada en las deps para no re-hidratar por identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, JSON.stringify(queryKey), ttlMs, queryClient]);

  useEffect(() => {
    if (!clave || datos === undefined) return;
    void cacheSet(clave, datos);
  }, [clave, datos]);
}

// Resuelve la clave de cache antes de conocer la org/usuario (que solo
// llegan en la respuesta): persiste el último valor en un índice y lo
// restaura al montar. `fijar` se llama cuando ya se conoce el valor real.
// `fabrica` debe ser una función estable (definida a nivel de módulo).
export function useClaveConIndice(
  indice: string,
  fabrica: (valor: string) => string
): { clave: string | null; fijar: (valor: string) => void } {
  const [valorIndice, setValorIndice] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    void cacheGet<string>(indice).then((entrada) => {
      if (activo && entrada?.value) setValorIndice(entrada.value);
    });
    return () => {
      activo = false;
    };
  }, [indice]);

  // Derivada: evita un segundo render con setState dentro de un efecto.
  const clave = valorIndice ? fabrica(valorIndice) : null;

  const fijar = useCallback(
    (valor: string) => {
      setValorIndice(valor);
      void cacheSet(indice, valor);
    },
    [indice]
  );

  return { clave, fijar };
}
