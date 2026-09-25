import { describe, expect, it } from 'vitest';
import { contarPalabras, formatearConteoPalabras, moverElemento, moverPagina } from './documento';
import type { DocumentPage } from '../tipos';

function pagina(id: string, title = id, is_main = false): DocumentPage {
  return {
    id,
    document_id: 'doc-1',
    title,
    content: '',
    is_main,
    position: 0,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };
}

describe('moverElemento', () => {
  it('mueve un elemento hacia adelante', () => {
    expect(moverElemento(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('mueve un elemento hacia atrás', () => {
    expect(moverElemento(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('no muta la lista original', () => {
    const original = ['a', 'b', 'c'];
    moverElemento(original, 0, 2);
    expect(original).toEqual(['a', 'b', 'c']);
  });

  it('devuelve copia sin cambios si el índice es igual o fuera de rango', () => {
    const original = ['a', 'b'];
    expect(moverElemento(original, 1, 1)).toEqual(original);
    expect(moverElemento(original, -1, 0)).toEqual(original);
    expect(moverElemento(original, 0, 2)).toEqual(original);
  });
});

describe('moverPagina', () => {
  it('reordena páginas manteniendo sus datos', () => {
    const paginas = [pagina('p1'), pagina('p2'), pagina('p3', 'Principal', true)];
    const resultado = moverPagina(paginas, 2, 0);
    expect(resultado.map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
    expect(resultado[0].is_main).toBe(true);
  });
});

describe('contarPalabras', () => {
  it('cuenta palabras de texto plano', () => {
    expect(contarPalabras('Hola mundo desde el ERP')).toBe(5);
  });

  it('ignora bloques y código inline', () => {
    expect(contarPalabras('Texto\n\n```js\nconst x = 1;\n```\n\n`codigo` final')).toBe(2);
  });

  it('cuenta encabezados, énfasis y listas sin marcadores', () => {
    const md = '# Título\n\n- uno **fuerte**\n- dos _suave_\n\n> cita final';
    expect(contarPalabras(md)).toBe(7);
  });

  it('conserva el texto de los enlaces y descarta la URL', () => {
    expect(contarPalabras('Ver [documentación](https://ejemplo.com) aquí')).toBe(3);
  });

  it('devuelve 0 con contenido vacío o solo marcadores', () => {
    expect(contarPalabras('')).toBe(0);
    expect(contarPalabras('   \n\n')).toBe(0);
    expect(contarPalabras('**__')).toBe(0);
  });
});

describe('formatearConteoPalabras', () => {
  it('singular y plural', () => {
    expect(formatearConteoPalabras(1)).toBe('1 palabra');
    expect(formatearConteoPalabras(0)).toBe('0 palabras');
    expect(formatearConteoPalabras(25)).toBe('25 palabras');
  });
});
