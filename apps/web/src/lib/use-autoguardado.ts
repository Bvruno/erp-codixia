import { useCallback, useEffect, useRef, useState } from 'react';

export type EstadoGuardado = 'guardado' | 'pendiente' | 'guardando' | 'error';

/**
 * Autoguardado con debounce para formularios de ajustes.
 *
 * - `marcarSucio()` marca cambios y programa el guardado (agrupa ediciones).
 * - `guardarYa()` fuerza el guardado inmediato (p. ej. al salir de un campo).
 * - Guarda pendiente al desmontar (cambio de tab o navegación).
 * - Nunca pierde ediciones hechas mientras una petición está en vuelo:
 *   al terminar, si quedó sucio, reprograma.
 */
export function useAutoguardado(
  guardar: () => Promise<void>,
  opciones?: { debounceMs?: number; onError?: (error: unknown) => void },
) {
  const debounceMs = opciones?.debounceMs ?? 700;
  const [estado, setEstado] = useState<EstadoGuardado>('guardado');

  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardarRef = useRef(guardar);
  const onErrorRef = useRef(opciones?.onError);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  // Mantiene el último closure sin recrear callbacks ni reprogramar timers.
  useEffect(() => {
    guardarRef.current = guardar;
    onErrorRef.current = opciones?.onError;
  });

  const limpiarTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const programarTimer = useCallback(() => {
    limpiarTimer();
    timerRef.current = setTimeout(() => {
      void flushRef.current();
    }, debounceMs);
  }, [debounceMs, limpiarTimer]);

  const flush = useCallback(async () => {
    limpiarTimer();
    // Si hay una petición en vuelo, reprograma: dirtyRef conserva los cambios.
    if (savingRef.current) {
      programarTimer();
      return;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    savingRef.current = true;
    setEstado('guardando');
    try {
      await guardarRef.current();
    } catch (error) {
      dirtyRef.current = true;
      setEstado('error');
      onErrorRef.current?.(error);
      savingRef.current = false;
      return;
    }
    savingRef.current = false;
    if (dirtyRef.current) {
      setEstado('pendiente');
      programarTimer();
    } else {
      setEstado('guardado');
    }
  }, [limpiarTimer, programarTimer]);

  useEffect(() => {
    flushRef.current = flush;
  });

  const marcarSucio = useCallback(() => {
    dirtyRef.current = true;
    setEstado('pendiente');
    programarTimer();
  }, [programarTimer]);

  const guardarYa = useCallback(() => {
    void flush();
  }, [flush]);

  // Guardado pendiente al desmontar (navegación SPA, cambio de tab o cierre).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current && !savingRef.current) {
        dirtyRef.current = false;
        void guardarRef.current().catch(() => undefined);
      }
    };
  }, []);

  return { estado, marcarSucio, guardarYa, reintentar: guardarYa };
}
