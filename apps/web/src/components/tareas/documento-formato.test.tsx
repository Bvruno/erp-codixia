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

afterEach(() => {
  editores.splice(0).forEach((editor) => editor.destroy());
});

describe('formato del documento', () => {
  it('crea listas de tareas y las serializa como markdown GFM', () => {
    const editor = crearEditor();
    editor.commands.insertContent('Comprar pan');
    editor.commands.toggleTaskList();

    expect(getMarkdown(editor)).toContain('- [ ] Comprar pan');
  });

  it('el roundtrip de listas de tareas conserva el estado marcado', () => {
    const editor = crearEditor('- [ ] pendiente\n- [x] hecho');

    const md = getMarkdown(editor);
    expect(md).toContain('- [ ] pendiente');
    expect(md).toContain('- [x] hecho');
    expect(editor.getHTML()).toContain('data-checked="true"');

    const reabierto = crearEditor(md);
    expect(reabierto.getHTML()).toContain('data-checked="true"');
  });

  it('el subrayado sobrevive al roundtrip', () => {
    const editor = crearEditor('<p><u>subrayado</u></p>');

    const md = getMarkdown(editor);
    expect(md).toContain('<u>subrayado</u>');

    const reabierto = crearEditor(md);
    expect(reabierto.getHTML()).toContain('<u>subrayado</u>');
  });

  it('limpiar formato quita las marcas del texto', () => {
    const editor = crearEditor('<p><strong><em>texto</em></strong></p>');
    editor.commands.selectAll();
    editor.commands.unsetAllMarks();

    expect(editor.getHTML()).not.toContain('<strong>');
    expect(editor.getHTML()).not.toContain('<em>');
  });
});
