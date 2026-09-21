import { MarkerType, type Edge, type Node } from '@xyflow/react';
import {
  handleDirectionBetween,
  oppositeHandle,
  SNAPSHOT_VERSION,
} from '@/lib/mindmap';
import type {
  MindMapEdgeKind,
  MindMapNodeData,
  MindMapSnapshot,
} from '@/types';
import { MIND_MAP_NODE_TYPES } from '@/components/mapas/mind-map-nodes';
import { MIND_MAP_EDGE_TYPES } from '@/components/mapas/mind-map/edge';

// Helpers puros de conversión snapshot ⇄ flow.

/** Datos de una conexión del mapa. */
export type MapEdgeData = {
  kind: MindMapEdgeKind;
  dashed: boolean;
  arrow: boolean;
};

/** Mensaje del canal broadcast del mapa (colaboración en vivo). */
export type RemoteMsg = {
  t:
    | 'move'
    | 'data'
    | 'node-add'
    | 'node-del'
    | 'node-size'
    | 'nodes-pos'
    | 'edge-add'
    | 'edge-del'
    | 'edge-update'
    | 'cursor';
  u?: string | null;
  n?: string;
  id?: string;
  ids?: string[];
  position?: { x: number; y: number };
  positions?: Record<string, { x: number; y: number }>;
  width?: number;
  height?: number;
  patch?: Partial<MindMapNodeData>;
  node?: FlowNode;
  edge?: FlowEdge;
  edgePatch?: Partial<MapEdgeData> & { label?: string | null };
  x?: number;
  y?: number;
};

export type FlowNode = Node<MindMapNodeData, keyof typeof MIND_MAP_NODE_TYPES>;
export type FlowEdge = Edge<MapEdgeData, keyof typeof MIND_MAP_EDGE_TYPES>;

export const DEFAULT_EDGE_DATA: MapEdgeData = {
  kind: 'bezier',
  dashed: false,
  arrow: true,
};

export function toFlowNodes(snap: MindMapSnapshot): FlowNode[] {
  return snap.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    data: n.data,
    ...(typeof n.width === 'number' ? { width: n.width } : {}),
    ...(typeof n.height === 'number' ? { height: n.height } : {}),
  }));
}

export function edgeDataFrom(e: MindMapSnapshot['edges'][number]): MapEdgeData {
  return {
    kind: e.kind ?? 'bezier',
    dashed: e.dashed === true,
    arrow: e.arrow !== false,
  };
}

export function toFlowEdges(snap: MindMapSnapshot): FlowEdge[] {
  const nodeById = new Map(snap.nodes.map((n) => [n.id, n]));
  const cleanHandle = (h: string | null | undefined, fallback?: string) => {
    if (h) return h.startsWith('+') ? h.slice(1) : h;
    return fallback;
  };
  return snap.edges.map((e) => {
    const src = nodeById.get(e.source);
    const tgt = nodeById.get(e.target);
    const dir = src && tgt ? handleDirectionBetween(src, tgt) : undefined;
    const sourceHandle = cleanHandle(e.sourceHandle, dir);
    const targetHandle = cleanHandle(e.targetHandle, dir ? oppositeHandle(dir) : undefined);
    const data = edgeDataFrom(e);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle,
      targetHandle,
      type: 'mapa',
      data,
      label: e.label ?? undefined,
      markerEnd: data.arrow
        ? { type: MarkerType.ArrowClosed, width: 18, height: 18 }
        : undefined,
      style: data.dashed ? { strokeDasharray: '7 5' } : undefined,
    };
  });
}

export function snapshotFrom(nodes: FlowNode[], edges: FlowEdge[]): MindMapSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    nodes: nodes.map((n) => {
      const node: MindMapSnapshot['nodes'][number] = {
        id: n.id,
        type: n.type,
        x: n.position.x,
        y: n.position.y,
        data: { ...n.data, labels: [...n.data.labels] },
      };
      // `width/height` solo existen si el usuario redimensionó el nodo.
      if (typeof n.width === 'number') node.width = n.width;
      if (typeof n.height === 'number') node.height = n.height;
      return node;
    }),
    edges: edges.map((e) => {
      const clean = (h: string | null | undefined) =>
        h?.startsWith('+') ? h.slice(1) : (h ?? null);
      const data = e.data ?? DEFAULT_EDGE_DATA;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: clean(e.sourceHandle),
        targetHandle: clean(e.targetHandle),
        label: typeof e.label === 'string' ? e.label : null,
        ...(data.kind !== 'bezier' ? { kind: data.kind } : {}),
        ...(data.dashed ? { dashed: true } : {}),
        ...(data.arrow === false ? { arrow: false } : {}),
      };
    }),
    viewport: null,
  };
}
