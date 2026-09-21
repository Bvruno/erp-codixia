import { useCallback, useRef, useState } from 'react';
import type { MindMapSnapshot } from '@/types';
import { construirPegado, extraerSeleccion, type ContenidoPortapapeles } from './portapapeles';

// Portapapeles interno del mapa: copiar/cortar/pegar/duplicar nodos con
// sus conexiones internas. La inserción la realiza el canvas (convierte a
// flow, emite a colaboradores y marca el mapa sucio).

export function usePortapapelesMapa({
  snapshotActual,
  selectedIds,
  selectedEdgeIds,
  punteroRef,
  antesDeCambiar,
  insertarSnapshot,
  eliminarSeleccion,
}: {
  snapshotActual: () => MindMapSnapshot;
  selectedIds: string[];
  selectedEdgeIds: string[];
  punteroRef: React.RefObject<{ x: number; y: number } | null>;
  antesDeCambiar: () => void;
  insertarSnapshot: (snap: MindMapSnapshot, seleccionar: boolean) => void;
  eliminarSeleccion: () => void;
}) {
  const clipRef = useRef<ContenidoPortapapeles | null>(null);
  const [hayContenido, setHayContenido] = useState(false);

  const copiar = useCallback(() => {
    const contenido = extraerSeleccion(snapshotActual(), selectedIds, selectedEdgeIds);
    if (contenido.nodes.length === 0) return;
    clipRef.current = contenido;
    setHayContenido(true);
  }, [snapshotActual, selectedIds, selectedEdgeIds]);

  const cortar = useCallback(() => {
    if (selectedIds.length === 0) return;
    copiar();
    eliminarSeleccion();
  }, [copiar, eliminarSeleccion, selectedIds]);

  const pegar = useCallback(() => {
    const contenido = clipRef.current;
    if (!contenido || contenido.nodes.length === 0) return;
    antesDeCambiar();
    insertarSnapshot(
      construirPegado(contenido, punteroRef.current, () => crypto.randomUUID()),
      true
    );
  }, [antesDeCambiar, insertarSnapshot, punteroRef]);

  const duplicarSeleccion = useCallback(() => {
    if (selectedIds.length === 0) return;
    const contenido = extraerSeleccion(snapshotActual(), selectedIds, selectedEdgeIds);
    if (contenido.nodes.length === 0) return;
    antesDeCambiar();
    insertarSnapshot(construirPegado(contenido, null, () => crypto.randomUUID()), true);
  }, [antesDeCambiar, insertarSnapshot, snapshotActual, selectedIds, selectedEdgeIds]);

  const duplicarNodo = useCallback(
    (id: string) => {
      const contenido = extraerSeleccion(snapshotActual(), [id], []);
      if (contenido.nodes.length === 0) return;
      antesDeCambiar();
      insertarSnapshot(construirPegado(contenido, null, () => crypto.randomUUID()), true);
    },
    [antesDeCambiar, insertarSnapshot, snapshotActual]
  );

  return { copiar, cortar, pegar, duplicarSeleccion, duplicarNodo, hayContenido };
}
