import { describe, it, expect } from 'vitest';
import {
  NODE_COLORS,
  NODE_KIND_IDS,
  NODE_KINDS,
  PRIORITY_OPTIONS,
  priorityColor,
  etiquetaPrioridad,
} from '@/lib/mindmap-config';

describe('mindmap-config', () => {
  it('define los tipos de nodo con dimensiones válidas', () => {
    expect(NODE_KIND_IDS).toEqual([
      'idea',
      'task',
      'decision',
      'note',
      'image',
      'shape',
      'text',
      'draw',
    ]);
    NODE_KIND_IDS.forEach((k) => {
      expect(NODE_KINDS[k].width).toBeGreaterThan(0);
      expect(NODE_KINDS[k].height).toBeGreaterThan(0);
    });
  });

  it('la paleta tiene colores únicos con nombre', () => {
    const values = NODE_COLORS.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
    NODE_COLORS.forEach((c) => expect(c.label.length).toBeGreaterThan(0));
  });

  it('mapea prioridades a etiqueta y color', () => {
    expect(etiquetaPrioridad('urgent')).toBe('Urgente');
    expect(etiquetaPrioridad(null)).toBe('Sin prioridad');
    expect(priorityColor('high')).toBe('#f97316');
    expect(priorityColor(null)).toBeNull();
    expect(PRIORITY_OPTIONS[0].key).toBe('none');
  });
});