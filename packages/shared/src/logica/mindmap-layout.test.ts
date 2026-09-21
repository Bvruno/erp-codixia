import { describe, expect, it } from 'vitest';
import {
  alinearNodos,
  calcularGuiaAlineacion,
  disposicionArbol,
  distribuirNodos,
  rectsDesdeSnapshot,
  type NodoMapaLayout,
} from '@/lib/mindmap-layout';
import { createNode, createDrawNode } from '@/lib/mindmap';

function rect(id: string, x: number, y: number, width = 100, height = 50): NodoMapaLayout {
  return { id, x, y, width, height };
}

describe('rectsDesdeSnapshot', () => {
  it('usa dimensiones redimensionadas cuando existen', () => {
    const base = createNode('idea', 'a', 0, 0);
    const resized = { ...base, width: 320, height: 140 };
    const [r] = rectsDesdeSnapshot([resized]);
    expect(r.width).toBe(320);
    expect(r.height).toBe(140);
  });
});

describe('disposicionArbol', () => {
  const nodos = [rect('raiz', 0, 0, 200, 90), rect('a', 500, 0), rect('b', 500, 300), rect('c', 900, 0)];
  const aristas = [
    { source: 'raiz', target: 'a' },
    { source: 'raiz', target: 'b' },
    { source: 'a', target: 'c' },
  ];

  it('coloca ramas a la derecha en horizontal sin solapar niveles', () => {
    const pos = disposicionArbol(nodos, aristas, { direccion: 'horizontal', raizId: 'raiz' });
    const raiz = pos.get('raiz')!;
    const a = pos.get('a')!;
    const c = pos.get('c')!;
    expect(raiz.x).toBe(0);
    expect(a.x).toBeGreaterThanOrEqual(200);
    expect(c.x).toBeGreaterThan(a.x);
  });

  it('centra al padre respecto a sus hijos', () => {
    const pos = disposicionArbol(nodos, aristas, { direccion: 'horizontal', raizId: 'raiz' });
    const raiz = pos.get('raiz')!;
    const a = pos.get('a')!;
    const b = pos.get('b')!;
    const centroRaiz = raiz.y + 45;
    const centroHijos = (a.y + 25 + (b.y + 25)) / 2;
    expect(Math.abs(centroRaiz - centroHijos)).toBeLessThan(1);
  });

  it('vertical intercambia ejes', () => {
    const pos = disposicionArbol(nodos, aristas, { direccion: 'vertical', raizId: 'raiz' });
    expect(pos.get('a')!.y).toBeGreaterThanOrEqual(90);
    expect(pos.get('c')!.y).toBeGreaterThan(pos.get('a')!.y);
  });

  it('radial distribuye por anillos', () => {
    const pos = disposicionArbol(nodos, aristas, { direccion: 'radial', raizId: 'raiz' });
    const distancia = (id: string) => {
      const p = pos.get(id)!;
      return Math.hypot(p.x - (pos.get('raiz')!.x), p.y - pos.get('raiz')!.y);
    };
    expect(distancia('c')).toBeGreaterThan(distancia('a'));
  });

  it('ignora aristas hacia ids inexistentes', () => {
    const pos = disposicionArbol(nodos, [...aristas, { source: 'raiz', target: 'fantasma' }], {
      raizId: 'raiz',
    });
    expect(pos.size).toBe(nodos.length);
  });
});

describe('alinearNodos', () => {
  const grupo = [rect('a', 0, 0), rect('b', 50, 100), rect('c', 200, 40)];

  it('alinea a la izquierda', () => {
    const pos = alinearNodos(grupo, 'izquierda');
    expect(pos.get('a')!.x).toBe(0);
    expect(pos.get('b')!.x).toBe(0);
    expect(pos.get('c')!.x).toBe(0);
  });

  it('alinea al centro horizontal', () => {
    const pos = alinearNodos(grupo, 'centro-h');
    const centros = grupo.map((r) => pos.get(r.id)!.x + r.width / 2);
    expect(new Set(centros).size).toBe(1);
  });

  it('alinea abajo', () => {
    const pos = alinearNodos(grupo, 'abajo');
    const bases = grupo.map((r) => pos.get(r.id)!.y + r.height);
    expect(new Set(bases).size).toBe(1);
  });
});

describe('distribuirNodos', () => {
  it('deja extremos fijos y centra los intermedios', () => {
    const grupo = [rect('a', 0, 0), rect('b', 10, 0), rect('c', 500, 0)];
    const pos = distribuirNodos(grupo, 'horizontal');
    expect(pos.get('a')!.x).toBe(0);
    expect(pos.get('c')!.x).toBe(500);
    expect(pos.get('b')!.x).toBeCloseTo(250);
  });

  it('no hace nada con menos de 3', () => {
    expect(distribuirNodos([rect('a', 0, 0), rect('b', 1, 0)], 'horizontal').size).toBe(0);
  });
});

describe('calcularGuiaAlineacion', () => {
  it('ajusta el borde izquierdo y devuelve guía vertical', () => {
    const movido = rect('m', 103, 300);
    const otros = [rect('o', 100, 0)];
    const res = calcularGuiaAlineacion(movido, otros, 6);
    expect(res.dx).toBe(-3);
    expect(res.guias.some((g) => g.eje === 'x' && g.posicion === 100)).toBe(true);
  });

  it('centra en el eje y', () => {
    const movido = rect('m', 400, 97);
    const otros = [rect('o', 0, 100)];
    const res = calcularGuiaAlineacion(movido, otros, 6);
    expect(res.dy).toBe(3);
    expect(res.guias.some((g) => g.eje === 'y')).toBe(true);
  });

  it('no ajusta fuera del umbral', () => {
    const res = calcularGuiaAlineacion(rect('m', 200, 200), [rect('o', 0, 0)], 6);
    expect(res.dx).toBe(0);
    expect(res.dy).toBe(0);
    expect(res.guias).toEqual([]);
  });
});

describe('createDrawNode', () => {
  it('calcula bbox y normaliza puntos', () => {
    const n = createDrawNode('d1', [
      [100, 100],
      [160, 130],
    ]);
    expect(n).not.toBeNull();
    expect(n!.type).toBe('draw');
    expect(n!.x).toBe(100 - 12);
    expect(n!.width).toBe(60 + 24);
    expect(n!.data.points![0]).toEqual([12, 12]);
  });

  it('devuelve null sin puntos válidos', () => {
    expect(createDrawNode('d1', [])).toBeNull();
    expect(createDrawNode('d1', [['x' as unknown as number, 1]])).toBeNull();
  });
});
