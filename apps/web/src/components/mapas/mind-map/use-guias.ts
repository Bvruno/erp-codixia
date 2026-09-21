import { useEffect, useRef } from 'react';
import { calcularGuiaAlineacion, type GuiaMapa, type NodoMapaLayout } from '@/lib/mindmap-layout';
import { NODE_KINDS } from '@/lib/mindmap-config';
import type { FlowNode } from './flow';

// Guías inteligentes de alineación durante el arrastre de UN nodo.
// Devuelve la posición ajustada (snap) y las líneas a dibujar.

function dimsNodo(n: FlowNode): { width: number; height: number } {
  const def = NODE_KINDS[n.type] ?? NODE_KINDS.idea;
  return {
    width: typeof n.width === 'number' ? n.width : def.width,
    height: typeof n.height === 'number' ? n.height : def.height,
  };
}

export function useGuiasAlineacion({
  nodesRef,
  umbral = 6,
  setGuias,
}: {
  nodesRef: React.RefObject<FlowNode[]>;
  umbral?: number;
  setGuias: (guias: GuiaMapa[]) => void;
}) {
  const activoRef = useRef(true);

  useEffect(() => {
    return () => {
      activoRef.current = false;
    };
  }, []);

  const calcularSnap = (
    movidoId: string,
    posicion: { x: number; y: number }
  ): { x: number; y: number } => {
    if (!activoRef.current) return posicion;
    const nodos = nodesRef.current;
    const movido = nodos.find((n) => n.id === movidoId);
    if (!movido) return posicion;
    const rectMovido: NodoMapaLayout = {
      id: movidoId,
      x: posicion.x,
      y: posicion.y,
      ...dimsNodo(movido),
    };
    const otros: NodoMapaLayout[] = nodos
      .filter((n) => n.id !== movidoId && !n.selected)
      .map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        ...dimsNodo(n),
      }));
    if (otros.length === 0) {
      setGuias([]);
      return posicion;
    }
    const res = calcularGuiaAlineacion(rectMovido, otros, umbral);
    setGuias(res.guias);
    return { x: posicion.x + res.dx, y: posicion.y + res.dy };
  };

  return { calcularSnap };
}
