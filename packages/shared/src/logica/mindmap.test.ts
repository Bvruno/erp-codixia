import { describe, it, expect } from 'vitest';
import {
  connectedNodePosition,
  createNode,
  EMPTY_SNAPSHOT,
  parseSnapshot,
  serializeSnapshot,
  SNAPSHOT_VERSION,
  validateSnapshot,
  handleDirectionBetween,
  oppositeHandle,
} from '@/lib/mindmap';
import type { MindMapSnapshot } from '@/types';

describe('handleDirectionBetween', () => {
  it('detecta la dirección dominante entre dos nodos', () => {
    expect(handleDirectionBetween({ x: 0, y: 0 }, { x: 100, y: 10 })).toBe('r');
    expect(handleDirectionBetween({ x: 0, y: 0 }, { x: -100, y: 10 })).toBe('l');
    expect(handleDirectionBetween({ x: 0, y: 0 }, { x: 10, y: 100 })).toBe('b');
    expect(handleDirectionBetween({ x: 0, y: 0 }, { x: -10, y: -100 })).toBe('t');
  });

  it('empata a favor del eje dominante', () => {
    expect(handleDirectionBetween({ x: 0, y: 0 }, { x: 100, y: 100 })).toBe('r');
    expect(handleDirectionBetween({ x: 0, y: 0 }, { x: -100, y: 100 })).toBe('l');
  });
});

describe('oppositeHandle', () => {
  it('devuelve la dirección opuesta', () => {
    expect(oppositeHandle('r')).toBe('l');
    expect(oppositeHandle('l')).toBe('r');
    expect(oppositeHandle('t')).toBe('b');
    expect(oppositeHandle('b')).toBe('t');
  });
});

describe('parseSnapshot', () => {
  it('devuelve snapshot vacío para null/undefined/garbage', () => {
    expect(parseSnapshot(null)).toEqual(EMPTY_SNAPSHOT);
    expect(parseSnapshot(undefined)).toEqual(EMPTY_SNAPSHOT);
    expect(parseSnapshot('x')).toEqual(EMPTY_SNAPSHOT);
  });

  it('normaliza nodos y descarta edges con extremos inexistentes', () => {
    const raw = {
      version: 99,
      nodes: [
        { id: 'a', type: 'idea', x: 10.5, y: -3, data: { label: 'A', color: '#000', labels: ['x', 1], priority: 'high' } },
        { id: 'b', type: 'unknown-type', x: 0, y: 0, data: { label: 'B' } },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'missing' },
      ],
    };
    const snap = parseSnapshot(raw);
    expect(snap.version).toBe(SNAPSHOT_VERSION);
    expect(snap.nodes).toHaveLength(2);
    expect(snap.nodes[1].type).toBe('idea');
    expect(snap.nodes[0].data.labels).toEqual(['x']);
    expect(snap.edges).toHaveLength(1);
    expect(snap.edges[0].id).toBe('e1');
  });

  it('respeta viewport válido', () => {
    const snap = parseSnapshot({ nodes: [], edges: [], viewport: { x: 1, y: 2, zoom: 0.5 } });
    expect(snap.viewport).toEqual({ x: 1, y: 2, zoom: 0.5 });
  });

  it('normaliza campos nuevos (tamaño, forma, trazo, estilo de edge)', () => {
    const snap = parseSnapshot({
      nodes: [
        {
          id: 'a',
          type: 'shape',
          x: 0,
          y: 0,
          width: 300,
          height: -5,
          data: { label: 'A', shape: 'ellipse', strokeWidth: 4 },
        },
        {
          id: 'b',
          type: 'draw',
          x: 0,
          y: 0,
          data: { label: '', points: [[1, 2], [3, 4], ['x', 1], [5]], strokeWidth: 0, fontSize: 18 },
        },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', kind: 'step', dashed: true, arrow: false },
        { id: 'e2', source: 'a', target: 'b', kind: 'raro' },
      ],
    });
    expect(snap.nodes[0].width).toBe(300);
    expect(snap.nodes[0].height).toBeUndefined();
    expect(snap.nodes[0].data.shape).toBe('ellipse');
    expect(snap.nodes[0].data.strokeWidth).toBe(4);
    expect(snap.nodes[0].data.fontSize).toBeUndefined();
    expect(snap.nodes[1].data.points).toEqual([[1, 2], [3, 4]]);
    expect(snap.nodes[1].data.strokeWidth).toBeUndefined();
    expect(snap.nodes[1].data.fontSize).toBe(18);
    expect(snap.edges[0].kind).toBe('step');
    expect(snap.edges[0].dashed).toBe(true);
    expect(snap.edges[0].arrow).toBe(false);
    expect(snap.edges[1].kind).toBeUndefined();
  });
});

describe('serializeSnapshot', () => {
  it('redondea posiciones y copia arrays', () => {
    const snap: MindMapSnapshot = {
      version: 1,
      nodes: [{ id: 'a', type: 'idea', x: 10.555, y: 0.004, data: { label: 'A', color: '#000', labels: ['x'], priority: null, done: false, image: null } }],
      edges: [{ id: 'e', source: 'a', target: 'a', label: 'l' }],
      viewport: null,
    };
    const out = serializeSnapshot(snap);
    expect(out.nodes[0].x).toBe(10.56);
    expect(out.nodes[0].data.labels).not.toBe(snap.nodes[0].data.labels);
    expect(out.edges[0].label).toBe('l');
  });

  it('conserva tamaño redondeado y clona puntos de trazo', () => {
    const snap: MindMapSnapshot = {
      version: 1,
      nodes: [
        {
          id: 'd',
          type: 'draw',
          x: 1.234,
          y: 2,
          width: 100.456,
          height: 50,
          data: { label: '', color: '#000', labels: [], priority: null, points: [[1, 2]] },
        },
      ],
      edges: [],
      viewport: null,
    };
    const out = serializeSnapshot(snap);
    expect(out.nodes[0].width).toBe(100.46);
    expect(out.nodes[0].height).toBe(50);
    expect(out.nodes[0].data.points).not.toBe(snap.nodes[0].data.points);
  });
});

describe('createNode', () => {
  it('centra el nodo respecto al punto dado', () => {
    const n = createNode('idea', 'n1', 0, 0);
    expect(n.x).toBe(-100);
    expect(n.y).toBe(-45);
    expect(n.data.priority).toBeNull();
    expect(n.data.done).toBe(false);
  });

  it('aplica overrides', () => {
    const n = createNode('task', 'n2', 0, 0, { label: 'Comprar', priority: 'urgent', color: '#ef4444' });
    expect(n.data.label).toBe('Comprar');
    expect(n.data.priority).toBe('urgent');
  });
});

describe('connectedNodePosition', () => {
  it('coloca a la derecha sin solaparse (gap 40)', () => {
    // idea: 200x90. Desde (0,0): centro (100,45) -> nuevo top-left x = 100+100+40-100 = 140, y = 45-45 = 0
    expect(connectedNodePosition('idea', 0, 0, 'r')).toEqual({ x: 140, y: 0 });
  });

  it('coloca debajo', () => {
    expect(connectedNodePosition('idea', 0, 0, 'b')).toEqual({ x: 0, y: 85 });
  });

  it('coloca arriba', () => {
    expect(connectedNodePosition('idea', 0, 0, 't')).toEqual({ x: 0, y: -85 });
  });

  it('coloca a la izquierda', () => {
    expect(connectedNodePosition('idea', 0, 0, 'l')).toEqual({ x: -140, y: 0 });
  });

  it('respeta gap custom', () => {
    // note: 180x130. Centro (90,65). r con gap 80 -> x = 90+80 = 170, y = 65-65 = 0
    expect(connectedNodePosition('note', 0, 0, 'r', 80)).toEqual({ x: 170, y: 0 });
  });
});

describe('validateSnapshot', () => {
  it('detecta ids duplicados y edges huérfanos', () => {
    const snap: MindMapSnapshot = {
      version: 1,
      nodes: [
        { id: 'a', type: 'idea', x: 0, y: 0, data: { label: 'A', color: '#000', labels: [], priority: null, done: false, image: null } },
        { id: 'a', type: 'idea', x: 1, y: 1, data: { label: 'B', color: '#000', labels: [], priority: null, done: false, image: null } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'nope', label: null }],
      viewport: null,
    };
    const res = validateSnapshot(snap);
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toContain('Nodo duplicado');
    expect(res.issues.join(' ')).toContain('Edge e');
  });

  it('aprueba snapshot limpio', () => {
    const snap = parseSnapshot({
      nodes: [{ id: 'a', type: 'note', x: 0, y: 0, data: { label: 'A' } }],
      edges: [],
    });
    expect(validateSnapshot(snap).ok).toBe(true);
  });
});