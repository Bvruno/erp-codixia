// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { extensionesDocumento, getMarkdown } from './documento-editor';
import {
  extraerMencionesUsuario,
  filtrarMenciones,
  listaVigente,
  normalizarMencion,
} from './menciones-utils';

const editores: Editor[] = [];

function crearEditor(content = ''): Editor {
  const editor = new Editor({ extensions: extensionesDocumento(), content });
  editores.push(editor);
  return editor;
}

const mencion = (attrs: string, texto: string) =>
  `<span data-type="mencion" ${attrs}>${texto}</span>`;

afterEach(() => {
  editores.splice(0).forEach((editor) => editor.destroy());
});

describe('menciones del documento', () => {
  it('la mención de usuario sobrevive al roundtrip markdown', () => {
    const editor = crearEditor(
      `<p>Hola ${mencion('data-id="u1" data-label="Ana" data-tipo="usuario"', '@Ana')} mundo</p>`
    );
    expect(editor.getHTML()).toContain('data-tipo="usuario"');

    const md = getMarkdown(editor);
    expect(md).toContain('data-type="mencion"');

    const reabierto = crearEditor(md);
    const html = reabierto.getHTML();
    expect(html).toContain('data-id="u1"');
    expect(html).toContain('data-tipo="usuario"');
    expect(html).toContain('@Ana');
  });

  it('la mención de tarea conserva la lista', () => {
    const editor = crearEditor(
      `<p>${mencion('data-id="t1" data-label="Cerrar caja" data-tipo="tarea" data-lista="l1"', '#Cerrar caja')}</p>`
    );

    const reabierto = crearEditor(getMarkdown(editor));
    const html = reabierto.getHTML();
    expect(html).toContain('data-tipo="tarea"');
    expect(html).toContain('data-lista="l1"');
  });

  it('extraerMencionesUsuario devuelve ids únicos de usuarios', () => {
    const editor = crearEditor(
      `<p>${mencion('data-id="u1" data-label="Ana" data-tipo="usuario"', '@Ana')} y ${mencion('data-id="u1" data-label="Ana" data-tipo="usuario"', '@Ana')} con ${mencion('data-id="l1" data-label="Lista" data-tipo="lista"', '#Lista')}</p>`
    );
    expect(extraerMencionesUsuario(editor.state.doc)).toEqual(['u1']);
  });

  it('listaVigente encuentra la última lista antes del cursor en el bloque', () => {
    const editor = crearEditor(
      `<p>${mencion('data-id="l1" data-label="Lista Demo" data-tipo="lista"', '#Lista Demo')} avance</p>`
    );
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(listaVigente(editor)).toEqual({ id: 'l1', label: 'Lista Demo' });
  });

  it('listaVigente es null sin mención de lista previa', () => {
    const editor = crearEditor('<p>texto suelto</p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(listaVigente(editor)).toBeNull();
  });

  it('filtrarMenciones ignora acentos y mayúsculas', () => {
    const items = [
      { id: '1', label: 'Operaciones', tipo: 'lista' as const },
      { id: '2', label: 'Cierre de caja', tipo: 'lista' as const },
    ];
    expect(filtrarMenciones(items, 'opera')).toHaveLength(1);
    expect(filtrarMenciones(items, 'CIERRE')).toHaveLength(1);
    expect(normalizarMencion('Operación Ñandú')).toBe('operacion nandu');
  });
});
