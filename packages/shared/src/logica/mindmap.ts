import type {
  MindMapEdgeKind,
  MindMapNodeData,
  MindMapNodeKind,
  MindMapShape,
  MindMapSnapshot,
  MindMapSnapshotEdge,
  MindMapSnapshotNode,
} from '@/types';
import { DEFAULT_NODE_COLOR, NODE_KIND_IDS, NODE_KINDS } from '@/lib/mindmap-config';

export const SNAPSHOT_VERSION = 1;

/** Límite defensivo de puntos por trazo libre (evita JSONB desmedido). */
export const MAX_DRAW_POINTS = 4000;

const EDGE_KIND_IDS: MindMapEdgeKind[] = ['bezier', 'straight', 'step'];
const SHAPE_IDS: MindMapShape[] = ['rect', 'ellipse', 'diamond', 'triangle'];

export const EMPTY_SNAPSHOT: MindMapSnapshot = {
  version: SNAPSHOT_VERSION,
  nodes: [],
  edges: [],
  viewport: null,
};

function asFiniteNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asPositiveNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

function normalizePoints(raw: unknown): number[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: number[][] = [];
  for (const p of raw) {
    if (out.length >= MAX_DRAW_POINTS) break;
    if (!Array.isArray(p) || p.length < 2) continue;
    const [x, y] = p;
    if (typeof x !== 'number' || !Number.isFinite(x)) continue;
    if (typeof y !== 'number' || !Number.isFinite(y)) continue;
    out.push([x, y]);
  }
  return out.length > 0 ? out : undefined;
}

function normalizeNode(raw: unknown): MindMapSnapshotNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (!id) return null;
  const type = NODE_KIND_IDS.includes(r.type as MindMapNodeKind)
    ? (r.type as MindMapNodeKind)
    : 'idea';
  const d = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  const labels = Array.isArray(d.labels)
    ? d.labels.filter((l): l is string => typeof l === 'string')
    : [];
  const data: MindMapNodeData = {
    label: asString(d.label),
    notes: typeof d.notes === 'string' ? d.notes : undefined,
    color: asString(d.color, DEFAULT_NODE_COLOR),
    labels,
    priority: typeof d.priority === 'string' ? d.priority : null,
    done: d.done === true,
    image:
      d.image && typeof d.image === 'object'
        ? {
            url: asString((d.image as Record<string, unknown>).url),
            alt: asString((d.image as Record<string, unknown>).alt),
          }
        : null,
  };
  if (SHAPE_IDS.includes(d.shape as MindMapShape)) data.shape = d.shape as MindMapShape;
  const points = normalizePoints(d.points);
  if (points) data.points = points;
  const strokeWidth = asPositiveNumber(d.strokeWidth);
  if (strokeWidth) data.strokeWidth = strokeWidth;
  const fontSize = asPositiveNumber(d.fontSize);
  if (fontSize) data.fontSize = fontSize;
  const node: MindMapSnapshotNode = {
    id,
    type,
    x: asFiniteNumber(r.x, 0),
    y: asFiniteNumber(r.y, 0),
    data,
  };
  const width = asPositiveNumber(r.width);
  const height = asPositiveNumber(r.height);
  if (width) node.width = width;
  if (height) node.height = height;
  return node;
}

function normalizeEdge(raw: unknown): MindMapSnapshotEdge | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const source = asString(r.source);
  const target = asString(r.target);
  if (!id || !source || !target) return null;
  const edge: MindMapSnapshotEdge = {
    id,
    source,
    target,
    sourceHandle: asString(r.sourceHandle) || null,
    targetHandle: asString(r.targetHandle) || null,
    label: asString(r.label) || null,
  };
  if (EDGE_KIND_IDS.includes(r.kind as MindMapEdgeKind)) edge.kind = r.kind as MindMapEdgeKind;
  if (r.dashed === true) edge.dashed = true;
  if (r.arrow === false) edge.arrow = false;
  return edge;
}

/** Normaliza cualquier valor del JSONB de la BD a un snapshot válido. */
export function parseSnapshot(raw: unknown): MindMapSnapshot {
  if (!raw || typeof raw !== 'object') return EMPTY_SNAPSHOT;
  const r = raw as Record<string, unknown>;
  const nodes = (Array.isArray(r.nodes) ? r.nodes : [])
    .map(normalizeNode)
    .filter((n): n is MindMapSnapshotNode => n !== null);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(r.edges) ? r.edges : [])
    .map(normalizeEdge)
    .filter((e): e is MindMapSnapshotEdge => e !== null)
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  const vp = r.viewport && typeof r.viewport === 'object'
    ? {
        x: asFiniteNumber((r.viewport as Record<string, unknown>).x, 0),
        y: asFiniteNumber((r.viewport as Record<string, unknown>).y, 0),
        zoom: asFiniteNumber((r.viewport as Record<string, unknown>).zoom, 1),
      }
    : null;
  return { version: SNAPSHOT_VERSION, nodes, edges, viewport: vp };
}

export function serializeSnapshot(snapshot: MindMapSnapshot): MindMapSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    nodes: snapshot.nodes.map((n) => {
      const node: MindMapSnapshotNode = {
        id: n.id,
        type: n.type,
        x: Math.round(n.x * 100) / 100,
        y: Math.round(n.y * 100) / 100,
        data: {
          ...n.data,
          labels: [...n.data.labels],
          points: n.data.points ? n.data.points.map(([x, y]) => [x, y]) : undefined,
        },
      };
      if (typeof n.width === 'number') node.width = Math.round(n.width * 100) / 100;
      if (typeof n.height === 'number') node.height = Math.round(n.height * 100) / 100;
      return node;
    }),
    edges: snapshot.edges.map((e) => ({
      ...e,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      label: e.label ?? null,
    })),
    viewport: snapshot.viewport,
  };
}

export function createNode(
  kind: MindMapNodeKind,
  id: string,
  x: number,
  y: number,
  overrides: Partial<MindMapNodeData> = {}
): MindMapSnapshotNode {
  const dims = NODE_KINDS[kind];
  return {
    id,
    type: kind,
    x: x - dims.width / 2,
    y: y - dims.height / 2,
    data: {
      label: kind === 'image' ? 'Imagen' : '',
      color: DEFAULT_NODE_COLOR,
      labels: [],
      priority: null,
      done: false,
      image: null,
      ...overrides,
    },
  };
}

export type MindMapHandleDirection = 't' | 'r' | 'b' | 'l';

/** Dirección opuesta de un handle (r<->l, t<->b). */
export function oppositeHandle(dir: MindMapHandleDirection): MindMapHandleDirection {
  switch (dir) {
    case 'r': return 'l';
    case 'l': return 'r';
    case 't': return 'b';
    case 'b': return 't';
  }
}

/** Dirección dominante entre dos nodos (centros). Se usa para anclar
 * edges antiguos sin handles a un lado sensato del nodo. */
export function handleDirectionBetween(
  a: { x: number; y: number },
  b: { x: number; y: number }
): MindMapHandleDirection {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'r' : 'l';
  return dy >= 0 ? 'b' : 't';
}

/** Posición (esquina superior-izquierda) de un nodo nuevo creado
 * al lado de un nodo existente (top-left en `x`,`y`), con separación. */
export function connectedNodePosition(
  kind: MindMapNodeKind,
  x: number,
  y: number,
  dir: MindMapHandleDirection,
  gap = 40
): { x: number; y: number } {
  const dims = NODE_KINDS[kind];
  const halfW = dims.width / 2;
  const halfH = dims.height / 2;
  const centerX = x + halfW;
  const centerY = y + halfH;
  const d = { x: 0, y: 0 };
  switch (dir) {
    case 'r':
      d.x = halfW + gap;
      break;
    case 'l':
      d.x = -(halfW + gap);
      break;
    case 'b':
      d.y = halfH + gap;
      break;
    case 't':
      d.y = -(halfH + gap);
      break;
  }
  return { x: centerX + d.x - halfW, y: centerY + d.y - halfH };
}

/** Dimensiones efectivas de un nodo: las redimensionadas o las del tipo. */
export function nodeDimensions(
  node: Pick<MindMapSnapshotNode, 'type' | 'width' | 'height'>
): { width: number; height: number } {
  const dims = NODE_KINDS[node.type] ?? NODE_KINDS.idea;
  return { width: node.width ?? dims.width, height: node.height ?? dims.height };
}

/** Margen interior de un trazo libre respecto a su caja. */
export const DRAW_PADDING = 12;

/** Crea un nodo de trazo libre a partir de puntos en coordenadas flow. */
export function createDrawNode(
  id: string,
  puntos: number[][],
  overrides: Partial<MindMapNodeData> = {}
): MindMapSnapshotNode | null {
  const validos = puntos.filter(
    (p) =>
      Array.isArray(p) &&
      p.length >= 2 &&
      typeof p[0] === 'number' &&
      Number.isFinite(p[0]) &&
      typeof p[1] === 'number' &&
      Number.isFinite(p[1])
  );
  if (validos.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  validos.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });
  const width = Math.max(maxX - minX, 1) + DRAW_PADDING * 2;
  const height = Math.max(maxY - minY, 1) + DRAW_PADDING * 2;
  return {
    id,
    type: 'draw',
    x: minX - DRAW_PADDING,
    y: minY - DRAW_PADDING,
    width,
    height,
    data: {
      label: '',
      color: DEFAULT_NODE_COLOR,
      labels: [],
      priority: null,
      done: false,
      image: null,
      strokeWidth: 3,
      points: validos.map(([x, y]) => [x - minX + DRAW_PADDING, y - minY + DRAW_PADDING]),
      ...overrides,
    },
  };
}

/** Valida integridad del snapshot: ids únicos y edges con extremos existentes. */
export function validateSnapshot(snapshot: MindMapSnapshot): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const seen = new Set<string>();
  snapshot.nodes.forEach((n) => {
    if (seen.has(n.id)) issues.push(`Nodo duplicado: ${n.id}`);
    seen.add(n.id);
    if (n.type === 'image' && !n.data.image?.url) issues.push(`Imagen sin url: ${n.id}`);
  });
  const edgeIds = new Set<string>();
  snapshot.edges.forEach((e) => {
    if (edgeIds.has(e.id)) issues.push(`Edge duplicado: ${e.id}`);
    edgeIds.add(e.id);
    if (!seen.has(e.source) || !seen.has(e.target)) {
      issues.push(`Edge ${e.id} referencia nodos inexistentes`);
    }
  });
  return { ok: issues.length === 0, issues };
}