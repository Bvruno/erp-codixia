import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api/cliente';
import { serializeSnapshot } from '@/lib/mindmap';
import type { MindMapSnapshot } from '@/types';

// Persistencia del mapa: autosave con debounce, estado de guardado y
// guardado pendiente al desmontar.

export function usePersistenciaMapa({
  mapId,
  currentSnapshot,
}: {
  mapId: string | null;
  currentSnapshot: () => MindMapSnapshot;
}) {
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const lastSavedAtRef = useRef<number>(0);

  const persist = useCallback(async () => {
    const snap = currentSnapshot();
    try {
      await api.put(`/mapas/${mapId}`, { content: serializeSnapshot({ ...snap, viewport: viewportRef.current }) });
      lastSavedAtRef.current = Date.now();
      return null;
    } catch (e) {
      return e instanceof Error ? e : new Error('No se pudo guardar');
    }
  }, [mapId, currentSnapshot]);

  const flushSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    const error = await persist();
    if (error) {
      toast.error('No se pudo guardar el mapa');
      dirtyRef.current = true;
      setSaveState('unsaved');
      return;
    }
    setSaveState('saved');
  }, [persist]);

  /** Solo reprograma el guardado (sin marcar el estado visual). */
  const programarGuardado = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushSave(); }, 700);
  }, [flushSave]);

  /** Marca cambios pendientes y programa el autosave. */
  const marcarSucio = useCallback(() => {
    dirtyRef.current = true;
    setSaveState('unsaved');
    programarGuardado();
  }, [programarGuardado]);

  // Guardado pendiente al salir del mapa (navegación SPA o cierre de pestaña)
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        void persist();
      }
    };
  }, [persist]);

  const resetGuardado = useCallback(() => {
    dirtyRef.current = false;
    lastSavedAtRef.current = 0;
    setSaveState('saved');
  }, []);

  return {
    saveState,
    dirtyRef,
    viewportRef,
    persist,
    flushSave,
    marcarSucio,
    programarGuardado,
    resetGuardado,
  };
}
