'use client';

import { getHTMLFromFragment, type AnyExtension, type Editor } from '@tiptap/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { Markdown, type MarkdownNodeSpec } from 'tiptap-markdown';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import LinkExtension from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention';
import type { SuggestionOptions } from '@tiptap/suggestion';

export type TipoMencion = 'usuario' | 'lista' | 'tarea' | 'documento' | 'mapa' | 'todo';

export type ItemMencion = {
  id: string;
  label: string;
  tipo: TipoMencion;
  /** Lista de la tarea (solo para mención de tarea). */
  lista?: string | null;
};

export type SugerenciaMencion = Omit<
  SuggestionOptions<ItemMencion, MentionNodeAttrs & { tipo?: TipoMencion; lista?: string | null }>,
  'editor'
>;

/** Serializa el documento del editor a markdown (tiptap-markdown). */
export function getMarkdown(ed: unknown): string {
  const storage = (ed as { storage?: unknown } | null)?.storage;
  const md = (storage as { markdown?: { getMarkdown?: () => string } } | undefined)?.markdown;
  return md?.getMarkdown ? md.getMarkdown() : '';
}

// Colores de celda: conviven con el `style` del atributo `align` porque
// `mergeAttributes` de Tiptap fusiona las propiedades de estilo.
const atributoDeColor = (
  nombre: string,
  accesoJs: string,
  propiedadCss: string,
  dataset: string
) => ({
  [nombre]: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      (element.style as unknown as Record<string, string>)[accesoJs] ||
      element.getAttribute(dataset) ||
      null,
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[nombre] ? { style: `${propiedadCss}: ${String(attributes[nombre])}` } : {},
  },
});

const atributosDeCelda = {
  ...atributoDeColor('backgroundColor', 'backgroundColor', 'background-color', 'data-background-color'),
  ...atributoDeColor('borderColor', 'borderColor', 'border-color', 'data-border-color'),
};

export const CeldaDocumento = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...atributosDeCelda };
  },
});

export const EncabezadoDocumento = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...atributosDeCelda };
  },
});

type AtributosCelda = {
  colspan?: number;
  rowspan?: number;
  colwidth?: number[] | null;
  align?: string | null;
  backgroundColor?: string | null;
  borderColor?: string | null;
};

// GFM no puede representar spans, multi-párrafo, anchos, alineación ni
// colores: en esos casos la tabla se guarda como HTML embebido para no
// perder nada.
function esCeldaGFM(celda: PMNode): boolean {
  const { colspan, rowspan, colwidth, align, backgroundColor, borderColor } =
    celda.attrs as AtributosCelda;
  if ((colspan ?? 1) > 1 || (rowspan ?? 1) > 1) return false;
  if (Array.isArray(colwidth) && colwidth.length > 0) return false;
  if (align || backgroundColor || borderColor) return false;
  return celda.childCount === 1;
}

function esTablaGFM(node: PMNode): boolean {
  const filas = node.content.content;
  if (filas.length === 0) return false;
  return filas.every((fila, i) =>
    fila.content.content.every((celda) =>
      i === 0
        ? celda.type.name === 'tableHeader' && esCeldaGFM(celda)
        : celda.type.name !== 'tableHeader' && esCeldaGFM(celda)
    )
  );
}

function escribirTablaGFM(state: Parameters<MarkdownNodeSpec['serialize']>[0], node: PMNode) {
  node.forEach((fila, _pos, i) => {
    state.write('| ');
    fila.forEach((celda, _posCelda, j) => {
      if (j) state.write(' | ');
      const contenido = celda.firstChild;
      if (contenido && contenido.textContent.trim()) state.renderInline(contenido);
    });
    state.write(' |');
    state.ensureNewLine();
    if (i === 0) {
      const delimitador = Array.from({ length: fila.childCount }).map(() => '---').join(' | ');
      state.write(`| ${delimitador} |`);
      state.ensureNewLine();
    }
  });
  state.closeBlock(node);
}

// Mención inline (@usuario, #lista/tarea, &documento, ^mapa, %TO-DO). Hereda
// id/label/char del Mention oficial; suma tipo y lista. Sin spec markdown
// propia: `tiptap-markdown` la serializa como HTML inline con los data-* y la
// re-parsea por `span[data-type="mencion"]`.
export const Mencion = Mention.extend({
  name: 'mencion',
  addAttributes() {
    return {
      ...this.parent?.(),
      tipo: {
        default: 'usuario',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-tipo'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.tipo ? { 'data-tipo': String(attributes.tipo) } : {},
      },
      lista: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-lista'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.lista ? { 'data-lista': String(attributes.lista) } : {},
      },
    };
  },
});

export const TablaDocumento = Table.extend({
  addStorage() {
    const markdown: MarkdownNodeSpec = {
      serialize(state, node) {
        if (esTablaGFM(node)) {
          escribirTablaGFM(state, node);
          return;
        }
        state.write(getHTMLFromFragment(Fragment.from(node), node.type.schema));
        state.closeBlock(node);
      },
    };
    return { markdown };
  },
});

/** Extensiones del editor de documentos (compartidas con los tests). */
export function extensionesDocumento(opciones?: {
  sugerencias?: SugerenciaMencion[];
}): AnyExtension[] {
  const mencion = opciones?.sugerencias?.length
    ? Mencion.configure({ suggestions: opciones.sugerencias })
    : Mencion;
  return [
    StarterKit.configure({ link: false }),
    LinkExtension.configure({ openOnClick: false }),
    TablaDocumento.configure({ resizable: true }),
    TableRow,
    EncabezadoDocumento,
    CeldaDocumento,
    TaskList,
    TaskItem.configure({ nested: true }),
    mencion,
    Markdown,
  ];
}

export type EditorDocumento = Editor;

