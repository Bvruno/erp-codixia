'use client';

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Columns3,
  Rows3,
  TableCellsMerge,
  TableCellsSplit,
  TableColumnsSplit,
  TableProperties,
  TableRowsSplit,
  Trash2,
} from 'lucide-react';
import { BotonHerramienta, SeparadorHerramienta } from '@/components/entidad/barra-herramientas';
import { ColorCeldaPicker } from './celda-color-picker';

/** Índices de la celda activa dentro de la tabla (o null si no hay celda). */
function indicesCelda(editor: Editor): { fila: number; columna: number } | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      return { fila: $from.index(d - 2), columna: $from.index(d - 1) };
    }
  }
  return null;
}

function esEncabezadoDeFila(editor: Editor): boolean {
  const idx = indicesCelda(editor);
  return !!idx && idx.fila === 0 && editor.isActive('tableHeader');
}

function esEncabezadoDeColumna(editor: Editor): boolean {
  const idx = indicesCelda(editor);
  return !!idx && idx.columna === 0 && editor.isActive('tableHeader');
}

const alinearActivo = (editor: Editor, align: string) =>
  editor.isActive('tableCell', { align }) || editor.isActive('tableHeader', { align });

/** CellSelection de la primera a la última celda: toda la tabla seleccionada. */
function seleccionarTabla(editor: Editor): void {
  const { state } = editor;
  const { $from } = state.selection;
  let inicioTabla = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') {
      inicioTabla = $from.before(d);
      break;
    }
  }
  if (inicioTabla < 0) return;
  const tabla = state.doc.nodeAt(inicioTabla);
  if (!tabla) return;
  const posiciones: number[] = [];
  tabla.descendants((node, pos) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      posiciones.push(inicioTabla + 1 + pos);
    }
    return true;
  });
  if (posiciones.length === 0) return;
  editor
    .chain()
    .focus()
    .setCellSelection({
      anchorCell: posiciones[0],
      headCell: posiciones[posiciones.length - 1],
    })
    .run();
}

/** Acciones de tabla compartidas por la barra de herramientas y el menú flotante. */
export function AccionesTabla({ editor }: { editor: Editor }) {
  // Suscripción al estado del editor: Tiptap v3 no re-renderiza por
  // transacción, así que sin esto los botones quedan congelados tras insertar
  // la tabla o cambiar la selección.
  useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      enTabla: ed.isActive('table'),
      puedeFusionar: ed.can().mergeCells(),
      puedeDividir: ed.can().splitCell(),
      puedeEliminarTabla: ed.can().deleteTable(),
      encabezadoFila: esEncabezadoDeFila(ed),
      encabezadoColumna: esEncabezadoDeColumna(ed),
      alineacion:
        (['left', 'center', 'right'] as const).find((a) => alinearActivo(ed, a)) ?? null,
      color:
        (ed.getAttributes('tableCell').backgroundColor ??
          ed.getAttributes('tableHeader').backgroundColor ??
          null) as string | null,
      colorBorde:
        (ed.getAttributes('tableCell').borderColor ??
          ed.getAttributes('tableHeader').borderColor ??
          null) as string | null,
    }),
  });

  const cadena = () => editor.chain().focus();
  const enTabla = editor.isActive('table');

  if (!enTabla) {
    return (
      <BotonHerramienta
        title="Insertar tabla"
        onClick={() => cadena().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableCellsMerge className="size-4" />
      </BotonHerramienta>
    );
  }

  return (
    <>
      <BotonHerramienta title="Seleccionar toda la tabla" onClick={() => seleccionarTabla(editor)}>
        <TableProperties className="size-4" />
      </BotonHerramienta>
      <SeparadorHerramienta />
      <BotonHerramienta
        title="Insertar fila arriba"
        disabled={!editor.can().addRowBefore()}
        onClick={() => cadena().addRowBefore().run()}
      >
        <ArrowUpToLine className="size-4" />
      </BotonHerramienta>
      <BotonHerramienta
        title="Insertar fila abajo"
        disabled={!editor.can().addRowAfter()}
        onClick={() => cadena().addRowAfter().run()}
      >
        <ArrowDownToLine className="size-4" />
      </BotonHerramienta>
      <BotonHerramienta
        title="Insertar columna a la izquierda"
        disabled={!editor.can().addColumnBefore()}
        onClick={() => cadena().addColumnBefore().run()}
      >
        <ArrowLeftToLine className="size-4" />
      </BotonHerramienta>
      <BotonHerramienta
        title="Insertar columna a la derecha"
        disabled={!editor.can().addColumnAfter()}
        onClick={() => cadena().addColumnAfter().run()}
      >
        <ArrowRightToLine className="size-4" />
      </BotonHerramienta>
      <SeparadorHerramienta />
      <BotonHerramienta
        title="Eliminar fila"
        disabled={!editor.can().deleteRow()}
        onClick={() => cadena().deleteRow().run()}
      >
        <TableRowsSplit className="size-4" />
      </BotonHerramienta>
      <BotonHerramienta
        title="Eliminar columna"
        disabled={!editor.can().deleteColumn()}
        onClick={() => cadena().deleteColumn().run()}
      >
        <TableColumnsSplit className="size-4" />
      </BotonHerramienta>
      <BotonHerramienta
        title="Eliminar tabla"
        disabled={!editor.can().deleteTable()}
        onClick={() => cadena().deleteTable().run()}
      >
        <Trash2 className="size-4" />
      </BotonHerramienta>
      <SeparadorHerramienta />
      <BotonHerramienta
        title="Fusionar celdas"
        disabled={!editor.can().mergeCells()}
        onClick={() => cadena().mergeCells().run()}
      >
        <TableCellsMerge className="size-4" />
      </BotonHerramienta>
      <BotonHerramienta
        title="Dividir celda"
        disabled={!editor.can().splitCell()}
        onClick={() => cadena().splitCell().run()}
      >
        <TableCellsSplit className="size-4" />
      </BotonHerramienta>
      <SeparadorHerramienta />
      <BotonHerramienta
        title="Encabezado de fila"
        active={esEncabezadoDeFila(editor)}
        onClick={() => cadena().toggleHeaderRow().run()}
      >
        <Rows3 className="size-4" />
      </BotonHerramienta>
      <BotonHerramienta
        title="Encabezado de columna"
        active={esEncabezadoDeColumna(editor)}
        onClick={() => cadena().toggleHeaderColumn().run()}
      >
        <Columns3 className="size-4" />
      </BotonHerramienta>
      <SeparadorHerramienta />
      <BotonHerramienta
        title="Alinear a la izquierda"
        active={alinearActivo(editor, 'left')}
        onClick={() => cadena().setCellAttribute('align', 'left').run()}
      >
        <AlignLeft className="size-4" />
      </BotonHerramienta>
      <BotonHerramienta
        title="Centrar"
        active={alinearActivo(editor, 'center')}
        onClick={() => cadena().setCellAttribute('align', 'center').run()}
      >
        <AlignCenter className="size-4" />
      </BotonHerramienta>
      <BotonHerramienta
        title="Alinear a la derecha"
        active={alinearActivo(editor, 'right')}
        onClick={() => cadena().setCellAttribute('align', 'right').run()}
      >
        <AlignRight className="size-4" />
      </BotonHerramienta>
      <SeparadorHerramienta />
      <ColorCeldaPicker editor={editor} tipo="fondo" />
      <ColorCeldaPicker editor={editor} tipo="borde" />
    </>
  );
}
