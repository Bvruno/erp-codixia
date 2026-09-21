// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { extensionesDocumento, getMarkdown } from './documento-editor';

const editores: Editor[] = [];

function crearEditor(content = ''): Editor {
  const editor = new Editor({ extensions: extensionesDocumento(), content });
  editores.push(editor);
  return editor;
}

/** Posiciones de documento de cada celda (para `setCellSelection`). */
function posicionesCeldas(editor: Editor): number[] {
  const posiciones: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      posiciones.push(pos);
    }
    return true;
  });
  return posiciones;
}

function contarFilas(editor: Editor): number {
  let total = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'tableRow') total += 1;
    return true;
  });
  return total;
}

afterEach(() => {
  editores.splice(0).forEach((editor) => editor.destroy());
});

describe('tablas del documento', () => {
  it('tabla simple se serializa como markdown GFM', () => {
    const editor = crearEditor();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const md = getMarkdown(editor);
    expect(md).toContain('| --- |');
    expect(md).not.toContain('<table');
  });

  it('anchos de columna fuerzan HTML y sobreviven al roundtrip', () => {
    const editor = crearEditor();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    editor.commands.setCellAttribute('colwidth', [120]);

    const md = getMarkdown(editor);
    expect(md).toContain('<table');

    const reabierto = crearEditor(md);
    expect(reabierto.getHTML()).toContain('colwidth="120"');
  });

  it('color de celda fuerza HTML y sobrevive al roundtrip', () => {
    const editor = crearEditor();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    editor.commands.setCellAttribute('backgroundColor', 'rgba(245, 158, 11, 0.28)');

    const md = getMarkdown(editor);
    expect(md).toContain('background-color');

    const reabierto = crearEditor(md);
    expect(reabierto.getHTML()).toContain('background-color: rgba(245, 158, 11, 0.28)');
  });

  it('color de borde fuerza HTML y sobrevive al roundtrip', () => {
    const editor = crearEditor();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    editor.commands.setCellAttribute('borderColor', 'rgba(239, 68, 68, 0.26)');

    const md = getMarkdown(editor);
    expect(md).toContain('border-color');

    const reabierto = crearEditor(md);
    expect(reabierto.getHTML()).toContain('border-color: rgba(239, 68, 68, 0.26)');
  });

  it('la selección de toda la tabla aplica el color a todas las celdas', () => {
    const editor = crearEditor();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    const celdas = posicionesCeldas(editor);
    editor.commands.setCellSelection({
      anchorCell: celdas[0],
      headCell: celdas[celdas.length - 1],
    });
    editor.commands.setCellAttribute('backgroundColor', 'rgba(16, 185, 129, 0.28)');

    const coincidencias =
      editor.getHTML().match(/background-color: rgba\(16, 185, 129, 0\.28\)/g) ?? [];
    expect(coincidencias).toHaveLength(4);
  });

  it('alineación de celda sobrevive al roundtrip', () => {
    const editor = crearEditor();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    editor.commands.setCellAttribute('align', 'center');

    const md = getMarkdown(editor);
    expect(md).toContain('text-align: center');

    const reabierto = crearEditor(md);
    expect(reabierto.getHTML()).toContain('text-align: center');
  });

  it('celdas fusionadas sobreviven al roundtrip', () => {
    const editor = crearEditor();
    editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    const celdas = posicionesCeldas(editor);
    editor.commands.setCellSelection({ anchorCell: celdas[0], headCell: celdas[1] });
    editor.commands.mergeCells();

    const md = getMarkdown(editor);
    expect(md).toContain('<table');

    const reabierto = crearEditor(md);
    expect(reabierto.getHTML()).toContain('colspan="2"');
  });

  it('eliminar fila quita una fila de la tabla', () => {
    const editor = crearEditor();
    editor.commands.insertTable({ rows: 3, cols: 2, withHeaderRow: true });
    expect(contarFilas(editor)).toBe(3);

    const celdas = posicionesCeldas(editor);
    editor.commands.setCellSelection({ anchorCell: celdas[2], headCell: celdas[2] });
    editor.commands.deleteRow();

    expect(contarFilas(editor)).toBe(2);
  });
});
