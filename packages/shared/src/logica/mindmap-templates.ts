import type { MindMapSnapshot, MindMapSnapshotNode } from '@/types';
import { createNode, SNAPSHOT_VERSION } from '@/lib/mindmap';

export type MindMapTemplate = {
  id: string;
  name: string;
  description: string;
  build: () => MindMapSnapshot;
};

function connect(centerId: string, ids: string[]): MindMapSnapshot['edges'] {
  return ids.map((id, i) => ({
    id: `edge-${centerId}-${id}-${i}`,
    source: centerId,
    target: id,
    label: null,
  }));
}

function snapshot(nodes: MindMapSnapshotNode[], edges: MindMapSnapshot['edges']): MindMapSnapshot {
  return { version: SNAPSHOT_VERSION, nodes, edges, viewport: null };
}

export const MIND_MAP_TEMPLATES: MindMapTemplate[] = [
  {
    id: 'blank',
    name: 'En blanco',
    description: 'Lienzo vacío para empezar desde cero',
    build: () => snapshot([], []),
  },
  {
    id: 'lluvia',
    name: 'Lluvia de ideas',
    description: 'Idea central con ramas de exploración',
    build: () => {
      const center = createNode('idea', 'n-center', 0, 0, { label: 'Ideas', color: '#6366f1' });
      const branches = ['Idea 1', 'Idea 2', 'Idea 3', 'Idea 4'].map((label, i) => {
        const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const r = 260;
        return createNode(
          'idea',
          `n-branch-${i}`,
          Math.round(Math.cos(angle) * r),
          Math.round(Math.sin(angle) * r),
          { label, color: '#3b82f6' }
        );
      });
      return snapshot([center, ...branches], connect(center.id, branches.map((b) => b.id)));
    },
  },
  {
    id: 'dafo',
    name: 'Análisis DAFO',
    description: 'Fortalezas, debilidades, oportunidades y amenazas',
    build: () => {
      const center = createNode('decision', 'n-center', 0, 0, { label: 'DAFO', color: '#8b5cf6' });
      const quads: [string, number, number, string][] = [
        ['Fortalezas', -240, -190, '#10b981'],
        ['Debilidades', 240, -190, '#ef4444'],
        ['Oportunidades', -240, 190, '#3b82f6'],
        ['Amenazas', 240, 190, '#f59e0b'],
      ];
      const nodes = quads.map(([label, x, y, color], i) =>
        createNode('idea', `n-quad-${i}`, x, y, { label, color })
      );
      return snapshot([center, ...nodes], connect(center.id, nodes.map((n) => n.id)));
    },
  },
  {
    id: 'plan-semanal',
    name: 'Plan semanal',
    description: 'Ejes de la semana con sus días',
    build: () => {
      const center = createNode('idea', 'n-center', -420, 0, { label: 'Semana', color: '#14b8a6' });
      const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const nodes = days.map((label, i) =>
        createNode('task', `n-day-${i}`, 100 + i * 130, (i % 2 === 0 ? -1 : 1) * 60, {
          label,
          color: '#3b82f6',
        })
      );
      return snapshot([center, ...nodes], connect(center.id, nodes.map((n) => n.id)));
    },
  },
  {
    id: 'eisenhower',
    name: 'Priorización Eisenhower',
    description: 'Matriz urgente/importante para ordenar tareas',
    build: () => {
      const quads: [string, string, number, number, string][] = [
        ['Hacer ya', 'Urgente e importante', -240, -190, '#ef4444'],
        ['Programar', 'Importante, no urgente', 240, -190, '#f59e0b'],
        ['Delegar', 'Urgente, no importante', -240, 190, '#3b82f6'],
        ['Descartar', 'Ni urgente ni importante', 240, 190, '#6b7280'],
      ];
      const nodes = quads.map(([label, notes, x, y, color], i) =>
        createNode('note', `n-quad-${i}`, x, y, { label, notes, color })
      );
      return snapshot(nodes, []);
    },
  },
];

export function getTemplate(id: string | null | undefined): MindMapTemplate {
  return MIND_MAP_TEMPLATES.find((t) => t.id === id) ?? MIND_MAP_TEMPLATES[0];
}