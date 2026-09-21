import { EMPTY_SNAPSHOT, SNAPSHOT_VERSION } from '@/lib/mindmap';
import type { MindMapSnapshot, MindMapSnapshotEdge, MindMapSnapshotNode } from '@/types';

// Lógica pura de copiar/pegar/duplicar del mapa. Sin React para poder
// testear el remapeo de ids y offsets.

export type ContenidoPortapapeles = {
  nodes: MindMapSnapshotNode[];
  edges: MindMapSnapshotEdge[];
};

/**
 * Extrae nodos seleccionados y las conexiones internas entre ellos.
 * Conexiones con un extremo fuera de la selección no se copian: quedarían
 * huérfanas al pegar.
 */
export function extraerSeleccion(
  snapshot: MindMapSnapshot,
  idsNodos: string[],
  _idsEdges: string[]
): ContenidoPortapapeles {
  const ids = new Set(idsNodos);
  const nodes = snapshot.nodes.filter((n) => ids.has(n.id));
  const incluidos = new Set(nodes.map((n) => n.id));
  const edges = snapshot.edges.filter(
    (e) => incluidos.has(e.source) && incluidos.has(e.target)
  );
  return { nodes, edges };
}

const redondear = (v: number) => Math.round(v * 100) / 100;

/**
 * Construye un snapshot nuevo con ids remapeados. `destino` es la posición
 * flow del cursor: el bloque pegado aparece ahí; sin destino, se desplaza
 * en cascada (+32, +32).
 */
export function construirPegado(
  contenido: ContenidoPortapapeles,
  destino: { x: number; y: number } | null,
  generarId: () => string
): MindMapSnapshot {
  if (contenido.nodes.length === 0) return EMPTY_SNAPSHOT;
  const minX = Math.min(...contenido.nodes.map((n) => n.x));
  const minY = Math.min(...contenido.nodes.map((n) => n.y));
  const offset = destino
    ? { x: destino.x - minX + 16, y: destino.y - minY + 16 }
    : { x: 32, y: 32 };

  const mapaIds = new Map<string, string>();
  const nodes = contenido.nodes.map((n) => {
    const id = generarId();
    mapaIds.set(n.id, id);
    return {
      ...n,
      id,
      x: redondear(n.x + offset.x),
      y: redondear(n.y + offset.y),
      data: {
        ...n.data,
        labels: [...n.data.labels],
        ...(n.data.points
          ? { points: n.data.points.map(([x, y]) => [x, y]) }
          : {}),
      },
    };
  });
  const edges = contenido.edges
    .filter((e) => mapaIds.has(e.source) && mapaIds.has(e.target))
    .map((e) => ({
      ...e,
      id: generarId(),
      source: mapaIds.get(e.source)!,
      target: mapaIds.get(e.target)!,
    }));

  return { version: SNAPSHOT_VERSION, nodes, edges, viewport: null };
}
