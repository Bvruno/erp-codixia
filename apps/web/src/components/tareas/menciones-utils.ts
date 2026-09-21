'use client';

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ItemMencion } from './documento-editor';

export const MAX_SUGERENCIAS = 8;

/** Normaliza para búsquedas sin acentos y sin distinguir mayúsculas. */
export function normalizarMencion(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function filtrarMenciones(items: ItemMencion[], query: string): ItemMencion[] {
  const q = normalizarMencion(query.trim());
  if (!q) return items.slice(0, MAX_SUGERENCIAS);
  return items.filter((item) => normalizarMencion(item.label).includes(q)).slice(0, MAX_SUGERENCIAS);
}

/**
 * Última mención de lista anterior al cursor dentro del mismo bloque: activa
 * el modo "tareas de esa lista" al volver a escribir `#`.
 */
export function listaVigente(editor: Editor): { id: string; label: string } | null {
  const { state } = editor;
  const { $from } = state.selection;
  const desde = $from.depth > 0 ? $from.start() : 0;
  let encontrada: { id: string; label: string } | null = null;
  state.doc.nodesBetween(desde, $from.pos, (node) => {
    if (node.type.name === 'mencion' && node.attrs.tipo === 'lista' && node.attrs.id) {
      encontrada = { id: String(node.attrs.id), label: String(node.attrs.label ?? '') };
    }
    return true;
  });
  return encontrada;
}

/** Ids únicos de usuarios mencionados en el documento (para notificar). */
export function extraerMencionesUsuario(doc: PMNode): string[] {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === 'mencion' && node.attrs.tipo === 'usuario' && node.attrs.id) {
      ids.add(String(node.attrs.id));
    }
    return true;
  });
  return [...ids];
}
