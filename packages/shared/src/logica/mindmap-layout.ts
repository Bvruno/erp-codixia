import type { MindMapSnapshotNode } from '@/types';
import { nodeDimensions } from '@/lib/mindmap';

// Lógica pura de auto-organización, alineación y guías inteligentes del
// mapa mental. Sin dependencias de React ni de React Flow: recibe rects
// en coordenadas flow y devuelve posiciones nuevas.

export type NodoMapaLayout = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AristaMapaLayout = { source: string; target: string };

export type DireccionArbol = 'horizontal' | 'vertical' | 'radial';

export type OpcionesArbol = {
  direccion?: DireccionArbol;
  raizId?: string | null;
  gapX?: number;
  gapY?: number;
  /** Separación entre anillos en radial. */
  gapRadial?: number;
};

export type GuiaMapa = {
  eje: 'x' | 'y';
  posicion: number;
  desde: number;
  hasta: number;
};

export type ModoAlineacion =
  | 'izquierda'
  | 'derecha'
  | 'arriba'
  | 'abajo'
  | 'centro-h'
  | 'centro-v';

/** Convierte nodos del snapshot a rects de layout. */
export function rectsDesdeSnapshot(nodos: MindMapSnapshotNode[]): NodoMapaLayout[] {
  return nodos.map((n) => {
    const dims = nodeDimensions(n);
    return { id: n.id, x: n.x, y: n.y, ...dims };
  });
}

type ArbolNodo = {
  id: string;
  hijos: string[];
  padre: string | null;
  profundidad: number;
};

function construirArbol(
  nodos: NodoMapaLayout[],
  aristas: AristaMapaLayout[],
  raizId: string | null | undefined
): { arbol: Map<string, ArbolNodo>; raices: string[] } {
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const vecinos = new Map<string, string[]>();
  nodos.forEach((n) => vecinos.set(n.id, []));
  aristas.forEach((e) => {
    if (!porId.has(e.source) || !porId.has(e.target) || e.source === e.target) return;
    vecinos.get(e.source)!.push(e.target);
    vecinos.get(e.target)!.push(e.source);
  });

  const arbol = new Map<string, ArbolNodo>();
  const visitados = new Set<string>();

  const bfs = (raiz: string) => {
    const cola: string[] = [raiz];
    visitados.add(raiz);
    arbol.set(raiz, { id: raiz, hijos: [], padre: null, profundidad: 0 });
    while (cola.length > 0) {
      const actual = cola.shift()!;
      const nodo = arbol.get(actual)!;
      for (const vecino of vecinos.get(actual) ?? []) {
        if (visitados.has(vecino)) continue;
        visitados.add(vecino);
        arbol.set(vecino, {
          id: vecino,
          hijos: [],
          padre: actual,
          profundidad: nodo.profundidad + 1,
        });
        nodo.hijos.push(vecino);
        cola.push(vecino);
      }
    }
  };

  let raiz: string | null = raizId && porId.has(raizId) ? raizId : null;
  if (!raiz) {
    let mejorGrado = -1;
    for (const n of nodos) {
      const grado = (vecinos.get(n.id) ?? []).length;
      if (grado > mejorGrado) {
        mejorGrado = grado;
        raiz = n.id;
      }
    }
  }
  const raices: string[] = [];
  if (raiz) {
    raices.push(raiz);
    bfs(raiz);
  }
  // Componentes desconectados: cada uno con su propia raíz.
  for (const n of nodos) {
    if (!visitados.has(n.id)) {
      raices.push(n.id);
      bfs(n.id);
    }
  }

  return { arbol, raices };
}

type DisposicionComponente = {
  /** Posición en el eje transversal (y en horizontal, x en vertical). */
  transversal: Map<string, number>;
  /** Extensión total del componente en el eje transversal. */
  extension: number;
};

/**
 * Reparte un componente apilando subárboles en el eje transversal.
 * `crossSize` mide el nodo en el eje transversal; `mainSize` en el eje de
 * profundidad (para separar columnas/filas por nivel).
 */
function layoutComponente(
  arbol: Map<string, ArbolNodo>,
  crossSize: (id: string) => number,
  raiz: string,
  gapTransversal: number
): DisposicionComponente {
  const transversal = new Map<string, number>();
  const medida = new Map<string, number>();

  const medir = (id: string): number => {
    const nodo = arbol.get(id)!;
    const propio = crossSize(id);
    if (nodo.hijos.length === 0) {
      medida.set(id, propio);
      return propio;
    }
    let total = 0;
    nodo.hijos.forEach((hijo, i) => {
      total += medir(hijo);
      if (i > 0) total += gapTransversal;
    });
    const resultado = Math.max(propio, total);
    medida.set(id, resultado);
    return resultado;
  };

  const ubicar = (id: string, transversalInicio: number) => {
    const nodo = arbol.get(id)!;
    const propio = crossSize(id);
    const caja = medida.get(id)!;
    transversal.set(id, transversalInicio + caja / 2 - propio / 2);

    let totalHijos = 0;
    nodo.hijos.forEach((hijo, i) => {
      totalHijos += medida.get(hijo)!;
      if (i > 0) totalHijos += gapTransversal;
    });
    let cursor = transversalInicio + (caja - totalHijos) / 2;
    nodo.hijos.forEach((hijo) => {
      ubicar(hijo, cursor);
      cursor += medida.get(hijo)! + gapTransversal;
    });
  };

  medir(raiz);
  ubicar(raiz, 0);
  return { transversal, extension: medida.get(raiz) ?? 0 };
}

function layoutRadial(
  nodos: NodoMapaLayout[],
  arbol: Map<string, ArbolNodo>,
  raices: string[],
  gapRadial: number
): Map<string, { x: number; y: number }> {
  const posiciones = new Map<string, { x: number; y: number }>();
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const hojas = new Map<string, number>();

  const contarHojas = (id: string): number => {
    const nodo = arbol.get(id)!;
    if (nodo.hijos.length === 0) {
      hojas.set(id, 1);
      return 1;
    }
    const total = nodo.hijos.reduce((acc, h) => acc + contarHojas(h), 0);
    hojas.set(id, total);
    return total;
  };

  const centroOriginal = (id: string) => {
    const r = porId.get(id)!;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };

  raices.forEach((raiz, indice) => {
    contarHojas(raiz);
    const centro = centroOriginal(raiz);
    const offsetY = indice === 0 ? 0 : indice * gapRadial * 4;
    const colocar = (id: string, anguloInicio: number, anguloFin: number, profundidad: number) => {
      const nodo = arbol.get(id)!;
      const r = porId.get(id)!;
      if (profundidad === 0) {
        posiciones.set(id, { x: centro.x - r.width / 2, y: centro.y - r.height / 2 + offsetY });
      } else {
        const angulo = (anguloInicio + anguloFin) / 2;
        const radio = profundidad * (gapRadial + 40);
        const cx = centro.x + Math.cos(angulo) * radio;
        const cy = centro.y + Math.sin(angulo) * radio + offsetY;
        posiciones.set(id, { x: cx - r.width / 2, y: cy - r.height / 2 });
      }
      const totalHojas = hojas.get(id) ?? 1;
      let cursor = anguloInicio;
      nodo.hijos.forEach((hijo) => {
        const proporcion = (hojas.get(hijo) ?? 1) / totalHojas;
        const rango = (anguloFin - anguloInicio) * proporcion;
        colocar(hijo, cursor, cursor + rango, profundidad + 1);
        cursor += rango;
      });
    };
    colocar(raiz, 0, Math.PI * 2, 0);
  });

  return posiciones;
}

/**
 * Auto-organiza el mapa como árbol. Direcciones: horizontal (ramas hacia la
 * derecha), vertical (hacia abajo) o radial. Los componentes desconectados se
 * apilan al final del eje transversal.
 */
export function disposicionArbol(
  nodos: NodoMapaLayout[],
  aristas: AristaMapaLayout[],
  opciones: OpcionesArbol = {}
): Map<string, { x: number; y: number }> {
  const { direccion = 'horizontal', raizId = null, gapX = 60, gapY = 32, gapRadial = 140 } = opciones;
  const { arbol, raices } = construirArbol(nodos, aristas, raizId);
  if (nodos.length === 0) return new Map();

  if (direccion === 'radial') {
    return layoutRadial(nodos, arbol, raices, gapRadial);
  }

  const esVertical = direccion === 'vertical';
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const posiciones = new Map<string, { x: number; y: number }>();
  const crossSize = (id: string) => (esVertical ? porId.get(id)!.width : porId.get(id)!.height);
  const mainSize = (id: string) => (esVertical ? porId.get(id)!.height : porId.get(id)!.width);
  let offsetTransversal = 0;

  raices.forEach((raiz) => {
    const disp = layoutComponente(arbol, crossSize, raiz, gapY);

    // Tamaño máximo por profundidad para columnas/filas sin solapes.
    const tamanoPorProfundidad = new Map<number, number>();
    disp.transversal.forEach((_v, id) => {
      const nodo = arbol.get(id)!;
      tamanoPorProfundidad.set(
        nodo.profundidad,
        Math.max(tamanoPorProfundidad.get(nodo.profundidad) ?? 0, mainSize(id))
      );
    });
    const offsetsPrincipal: number[] = [];
    let acumulado = 0;
    const maxProfundidad = Math.max(...tamanoPorProfundidad.keys());
    for (let d = 0; d <= maxProfundidad; d++) {
      offsetsPrincipal.push(acumulado);
      acumulado += (tamanoPorProfundidad.get(d) ?? 0) + gapX;
    }

    disp.transversal.forEach((transversal, id) => {
      const nodo = arbol.get(id)!;
      const principal = offsetsPrincipal[nodo.profundidad] ?? 0;
      const t = transversal + offsetTransversal;
      posiciones.set(
        id,
        esVertical ? { x: t, y: principal } : { x: principal, y: t }
      );
    });

    offsetTransversal += disp.extension + gapY * 2;
  });

  return posiciones;
}

/** Alinea un grupo de rects contra el bounding box del grupo. */
export function alinearNodos(
  rects: NodoMapaLayout[],
  modo: ModoAlineacion
): Map<string, { x: number; y: number }> {
  const resultado = new Map<string, { x: number; y: number }>();
  if (rects.length === 0) return resultado;
  const minX = Math.min(...rects.map((r) => r.x));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const centroX = (minX + maxX) / 2;
  const centroY = (minY + maxY) / 2;
  rects.forEach((r) => {
    let x = r.x;
    let y = r.y;
    switch (modo) {
      case 'izquierda': x = minX; break;
      case 'derecha': x = maxX - r.width; break;
      case 'centro-h': x = centroX - r.width / 2; break;
      case 'arriba': y = minY; break;
      case 'abajo': y = maxY - r.height; break;
      case 'centro-v': y = centroY - r.height / 2; break;
    }
    resultado.set(r.id, { x, y });
  });
  return resultado;
}

/** Distribuye rects con separación uniforme entre centros (extremos fijos). */
export function distribuirNodos(
  rects: NodoMapaLayout[],
  eje: 'horizontal' | 'vertical'
): Map<string, { x: number; y: number }> {
  const resultado = new Map<string, { x: number; y: number }>();
  if (rects.length < 3) return resultado;
  const esH = eje === 'horizontal';
  const ordenados = [...rects].sort((a, b) =>
    esH ? a.x + a.width / 2 - (b.x + b.width / 2) : a.y + a.height / 2 - (b.y + b.height / 2)
  );
  const extremo = (r: NodoMapaLayout) => (esH ? r.x + r.width / 2 : r.y + r.height / 2);
  const primero = extremo(ordenados[0]);
  const ultimo = extremo(ordenados[ordenados.length - 1]);
  const paso = (ultimo - primero) / (ordenados.length - 1);
  ordenados.forEach((r, i) => {
    const centro = primero + paso * i;
    resultado.set(r.id, {
      x: esH ? centro - r.width / 2 : r.x,
      y: esH ? r.y : centro - r.height / 2,
    });
  });
  return resultado;
}

const ANCLAS = ['inicio', 'centro', 'fin'] as const;

function anclaEn(r: NodoMapaLayout, eje: 'x' | 'y', ancla: (typeof ANCLAS)[number]): number {
  const inicio = eje === 'x' ? r.x : r.y;
  const tamano = eje === 'x' ? r.width : r.height;
  if (ancla === 'inicio') return inicio;
  if (ancla === 'fin') return inicio + tamano;
  return inicio + tamano / 2;
}

/**
 * Calcula ajuste de alineación magnética del rect `movido` contra `otros`.
 * Devuelve el desplazamiento a aplicar y las líneas guía a dibujar.
 */
export function calcularGuiaAlineacion(
  movido: NodoMapaLayout,
  otros: NodoMapaLayout[],
  umbral = 6
): { dx: number; dy: number; guias: GuiaMapa[] } {
  let ajusteX: { diff: number; posicion: number } | null = null;
  let ajusteY: { diff: number; posicion: number } | null = null;

  for (const otro of otros) {
    for (const ancla of ANCLAS) {
      const diffX = anclaEn(otro, 'x', ancla) - anclaEn(movido, 'x', ancla);
      if (Math.abs(diffX) <= umbral && (ajusteX === null || Math.abs(diffX) < Math.abs(ajusteX.diff))) {
        ajusteX = { diff: diffX, posicion: anclaEn(otro, 'x', ancla) };
      }
      const diffY = anclaEn(otro, 'y', ancla) - anclaEn(movido, 'y', ancla);
      if (Math.abs(diffY) <= umbral && (ajusteY === null || Math.abs(diffY) < Math.abs(ajusteY.diff))) {
        ajusteY = { diff: diffY, posicion: anclaEn(otro, 'y', ancla) };
      }
    }
  }

  const dx = ajusteX ? ajusteX.diff : 0;
  const dy = ajusteY ? ajusteY.diff : 0;
  const ajustado: NodoMapaLayout = { ...movido, x: movido.x + dx, y: movido.y + dy };
  const guias: GuiaMapa[] = [];

  if (ajusteX) {
    const posicion = ajusteX.posicion;
    const tocados = otros.filter((o) =>
      ANCLAS.some((ancla) => Math.abs(anclaEn(o, 'x', ancla) - posicion) < 0.5)
    );
    if (tocados.length > 0) {
      const ys = [ajustado, ...tocados];
      guias.push({
        eje: 'x',
        posicion,
        desde: Math.min(...ys.map((r) => r.y)) - 12,
        hasta: Math.max(...ys.map((r) => r.y + r.height)) + 12,
      });
    }
  }
  if (ajusteY) {
    const posicion = ajusteY.posicion;
    const tocados = otros.filter((o) =>
      ANCLAS.some((ancla) => Math.abs(anclaEn(o, 'y', ancla) - posicion) < 0.5)
    );
    if (tocados.length > 0) {
      const xs = [ajustado, ...tocados];
      guias.push({
        eje: 'y',
        posicion,
        desde: Math.min(...xs.map((r) => r.x)) - 12,
        hasta: Math.max(...xs.map((r) => r.x + r.width)) + 12,
      });
    }
  }

  return { dx, dy, guias };
}
