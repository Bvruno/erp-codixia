import { useCallback, useState } from 'react';

/**
 * Pila de tareas para el detalle en offcanvas: abrir la primera tarea o
 * apilar una sub-tarea encima. `volver()` retrocede a la tarea anterior sin
 * cerrar el panel.
 */
export function usePilaTareas() {
  const [pila, setPila] = useState<string[]>([]);
  const actual = pila.length > 0 ? pila[pila.length - 1] : null;
  const puedeVolver = pila.length > 1;

  const abrir = useCallback((id: string) => {
    setPila([id]);
  }, []);

  const abrirSub = useCallback((id: string) => {
    setPila((p) => (p[p.length - 1] === id ? p : [...p, id]));
  }, []);

  const volver = useCallback(() => {
    setPila((p) => p.slice(0, -1));
  }, []);

  const cerrar = useCallback(() => {
    setPila([]);
  }, []);

  /** Reemplaza la pila (p. ej. al sincronizar con la URL en popstate). */
  const reemplazar = useCallback((ids: string[]) => {
    setPila(ids);
  }, []);

  return { pila, actual, puedeVolver, abrir, abrirSub, volver, cerrar, reemplazar };
}
