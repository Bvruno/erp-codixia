import type { MindMapEdgeKind, MindMapNodeKind, MindMapShape } from '@/types';

export const NODE_KINDS: Record<
  MindMapNodeKind,
  { label: string; description: string; width: number; height: number }
> = {
  idea: { label: 'Idea', description: 'Concepto con título y notas', width: 200, height: 90 },
  task: { label: 'Tarea', description: 'Acción con prioridad y estado', width: 200, height: 96 },
  decision: { label: 'Decisión', description: 'Punto de bifurcación', width: 150, height: 150 },
  note: { label: 'Nota', description: 'Apunte adhesivo', width: 180, height: 130 },
  image: { label: 'Imagen', description: 'Adjunto visual', width: 220, height: 180 },
  shape: { label: 'Forma', description: 'Rectángulo, elipse, rombo o triángulo', width: 160, height: 110 },
  text: { label: 'Texto', description: 'Texto libre sin caja', width: 220, height: 48 },
  draw: { label: 'Trazo', description: 'Dibujo a mano alzada', width: 240, height: 160 },
};

export const NODE_KIND_IDS = Object.keys(NODE_KINDS) as MindMapNodeKind[];

export const SHAPE_OPTIONS: { key: MindMapShape; label: string }[] = [
  { key: 'rect', label: 'Rectángulo' },
  { key: 'ellipse', label: 'Elipse' },
  { key: 'diamond', label: 'Rombo' },
  { key: 'triangle', label: 'Triángulo' },
];

export const EDGE_KINDS: { key: MindMapEdgeKind; label: string }[] = [
  { key: 'bezier', label: 'Curva' },
  { key: 'straight', label: 'Recta' },
  { key: 'step', label: 'Escalón' },
];

export const STROKE_WIDTHS = [2, 3, 5, 8] as const;

export const FONT_SIZES = [12, 14, 18, 24] as const;

export const NODE_COLORS = [
  { key: 'slate', label: 'Gris', value: '#64748b' },
  { key: 'blue', label: 'Azul', value: '#3b82f6' },
  { key: 'indigo', label: 'Índigo', value: '#6366f1' },
  { key: 'violet', label: 'Violeta', value: '#8b5cf6' },
  { key: 'fuchsia', label: 'Fucsia', value: '#d946ef' },
  { key: 'pink', label: 'Rosa', value: '#ec4899' },
  { key: 'rose', label: 'Coral', value: '#f43f5e' },
  { key: 'red', label: 'Rojo', value: '#ef4444' },
  { key: 'orange', label: 'Naranja', value: '#f97316' },
  { key: 'amber', label: 'Ámbar', value: '#f59e0b' },
  { key: 'lime', label: 'Lima', value: '#84cc16' },
  { key: 'green', label: 'Verde', value: '#10b981' },
  { key: 'teal', label: 'Turquesa', value: '#14b8a6' },
  { key: 'cyan', label: 'Cian', value: '#06b6d4' },
] as const;

export const DEFAULT_EDGE_COLOR = '#94a3b8';
export const DEFAULT_STROKE_WIDTH = 2;
export const DEFAULT_FONT_SIZE = 14;

export const DEFAULT_NODE_COLOR = '#64748b';

export const PRIORITY_OPTIONS = [
  { key: 'none', label: 'Sin prioridad' },
  { key: 'low', label: 'Baja' },
  { key: 'medium', label: 'Media' },
  { key: 'high', label: 'Alta' },
  { key: 'urgent', label: 'Urgente' },
] as const;

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280',
  medium: '#eab308',
  high: '#f97316',
  urgent: '#ef4444',
};

export const LABEL_SUGGESTIONS = [
  'estrategia',
  'productividad',
  'crítico',
  'urgente',
  'análisis',
  'acción',
  'idea',
  'proceso',
  'objetivo',
  'riesgo',
] as const;

export function etiquetaPrioridad(key: string | null): string {
  return PRIORITY_OPTIONS.find((p) => p.key === key)?.label ?? 'Sin prioridad';
}

export function priorityColor(key: string | null): string | null {
  return key ? (PRIORITY_COLORS[key] ?? null) : null;
}