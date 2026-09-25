import type { DocumentPage } from '../tipos';

// Lógica pura del visor de documentos: reordenamiento de páginas y conteo de
// palabras sobre el markdown que persiste el editor.

/** Devuelve una copia con el elemento movido de `desde` a `hasta`. */
export function moverElemento<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  if (
    desde === hasta ||
    desde < 0 ||
    hasta < 0 ||
    desde >= lista.length ||
    hasta >= lista.length
  ) {
    return [...lista];
  }
  const copia = [...lista];
  const [elemento] = copia.splice(desde, 1);
  copia.splice(hasta, 0, elemento);
  return copia;
}

/** Reordena la lista de páginas de un documento. */
export function moverPagina(
  paginas: readonly DocumentPage[],
  desde: number,
  hasta: number
): DocumentPage[] {
  return moverElemento(paginas, desde, hasta);
}

/**
 * Cuenta palabras del markdown del editor: descarta bloques/código inline,
 * conserva el texto de los enlaces y quita los marcadores estructurales.
 */
export function contarPalabras(markdown: string): number {
  const texto = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, ' ')
    .replace(/[*_~]{1,3}/g, '')
    .trim();
  if (!texto) return 0;
  return texto.split(/\s+/).length;
}

export function formatearConteoPalabras(total: number): string {
  return total === 1 ? '1 palabra' : `${total} palabras`;
}
