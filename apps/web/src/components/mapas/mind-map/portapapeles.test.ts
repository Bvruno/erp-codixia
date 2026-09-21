import { describe, expect, it } from 'vitest';
import { construirPegado, extraerSeleccion } from './portapapeles';
import type { MindMapSnapshot } from '@/types';

const data = { label: '', color: '#64748b', labels: [], priority: null, done: false, image: null };

function snapshot(): MindMapSnapshot {
  return {
    version: 1,
    nodes: [
      { id: 'a', type: 'idea', x: 0, y: 0, data: { ...data, labels: ['x'] } },
      { id: 'b', type: 'idea', x: 300, y: 100, width: 240, height: 80, data: { ...data } },
      {
        id: 'c',
        type: 'draw',
        x: 900,
        y: 900,
        data: { ...data, points: [[1, 2], [3, 4]] },
      },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'b', label: 'une' },
      { id: 'e2', source: 'b', target: 'c' },
    ],
    viewport: null,
  };
}

describe('extraerSeleccion', () => {
  it('copia nodos y solo las conexiones internas', () => {
    const contenido = extraerSeleccion(snapshot(), ['a', 'b'], []);
    expect(contenido.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(contenido.edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('sin nodos seleccionados no copia nada', () => {
    expect(extraerSeleccion(snapshot(), [], ['e1']).nodes).toEqual([]);
  });
});

describe('construirPegado', () => {
  it('remapea ids, conserva conexiones internas y desplaza en cascada', () => {
    const contenido = extraerSeleccion(snapshot(), ['a', 'b'], []);
    let n = 0;
    const pegado = construirPegado(contenido, null, () => `nuevo-${n++}`);
    expect(pegado.nodes).toHaveLength(2);
    expect(pegado.nodes.map((x) => x.id)).toEqual(['nuevo-0', 'nuevo-1']);
    expect(pegado.nodes[0].x).toBe(32);
    expect(pegado.nodes[1].x).toBe(332);
    expect(pegado.nodes[1].width).toBe(240);
    expect(pegado.edges).toHaveLength(1);
    expect(pegado.edges[0].source).toBe('nuevo-0');
    expect(pegado.edges[0].target).toBe('nuevo-1');
    expect(pegado.edges[0].label).toBe('une');
  });

  it('pega en la posición del cursor', () => {
    const contenido = extraerSeleccion(snapshot(), ['a', 'b'], []);
    const pegado = construirPegado(contenido, { x: 100, y: 200 }, () => crypto.randomUUID());
    const minX = Math.min(...pegado.nodes.map((x) => x.x));
    const minY = Math.min(...pegado.nodes.map((x) => x.y));
    expect(minX).toBe(116);
    expect(minY).toBe(216);
  });

  it('clona puntos del trazo', () => {
    const contenido = extraerSeleccion(snapshot(), ['c'], []);
    const pegado = construirPegado(contenido, null, () => crypto.randomUUID());
    expect(pegado.nodes[0].data.points).toEqual([[1, 2], [3, 4]]);
    expect(pegado.nodes[0].data.points).not.toBe(contenido.nodes[0].data.points);
  });

  it('con contenido vacío devuelve snapshot vacío', () => {
    const pegado = construirPegado({ nodes: [], edges: [] }, null, () => 'x');
    expect(pegado.nodes).toEqual([]);
    expect(pegado.edges).toEqual([]);
  });
});
