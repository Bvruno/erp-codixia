import type {
  FormularioEsquema,
  FormularioRespuesta,
  PreguntaFormulario,
} from '@/types';

// Construcción pura de la tabla de respuestas para migrarla a un documento.
// Sin acceso a red: recibe esquema + filas y devuelve filas tipadas y el
// markdown GFM (el editor de documentos lo re-parsea como tabla real).

export type ColumnaRespuestas = { id: string; titulo: string };

export const COLUMNAS_FIJAS: readonly ColumnaRespuestas[] = [
  { id: 'fecha', titulo: 'Fecha' },
  { id: 'persona', titulo: 'Persona' },
  { id: 'consentimiento', titulo: 'Consentimiento' },
];

export type FilaTablaRespuestas = {
  id: string;
  fecha: string;
  persona: string;
  consentimiento: string;
  /** Valores legibles indexados por id de pregunta. */
  valores: Record<string, string>;
};

/** Valor mostrable de una respuesta para una pregunta. */
export function valorLegible(pregunta: PreguntaFormulario, valor: unknown): string {
  if (valor === undefined || valor === null || valor === '') return '—';
  if (pregunta.tipo === 'casillas') {
    if (!Array.isArray(valor)) return '—';
    return valor
      .map((v) => pregunta.opciones?.find((o) => o.id === v)?.etiqueta ?? String(v))
      .join(', ');
  }
  if (pregunta.tipo === 'opcion_multiple' || pregunta.tipo === 'desplegable') {
    return pregunta.opciones?.find((o) => o.id === valor)?.etiqueta ?? String(valor);
  }
  return String(valor);
}

/** Identificación de quien respondió (misma regla que la vista y el CSV). */
export function personaRespuesta(respuesta: FormularioRespuesta): string {
  return (
    respuesta.invitado_nombre ??
    (respuesta.profile_id
      ? 'Miembro'
      : respuesta.identificador_hash
        ? 'Identificado'
        : 'Anónimo')
  );
}

/** Columnas disponibles: fijas + preguntas en el orden del esquema. */
export function columnasDeFormulario(esquema: FormularioEsquema): ColumnaRespuestas[] {
  const preguntas = esquema.secciones.flatMap((s) => s.preguntas);
  return [
    ...COLUMNAS_FIJAS.map((c) => ({ ...c })),
    ...preguntas.map((p) => ({ id: p.id, titulo: p.titulo })),
  ];
}

/** Filas legibles en el orden recibido. La fecha se formatea si se provee. */
export function construirFilasTabla(
  esquema: FormularioEsquema,
  respuestas: FormularioRespuesta[],
  opciones?: { formatearFecha?: (iso: string) => string }
): FilaTablaRespuestas[] {
  const formatearFecha = opciones?.formatearFecha ?? ((iso: string) => iso);
  const preguntas = esquema.secciones.flatMap((s) => s.preguntas);
  return respuestas.map((r) => ({
    id: r.id,
    fecha: formatearFecha(r.created_at),
    persona: personaRespuesta(r),
    consentimiento: r.consentimiento ? 'Sí' : 'No',
    valores: Object.fromEntries(
      preguntas.map((p) => [p.id, valorLegible(p, r.respuestas[p.id])])
    ),
  }));
}

/** Valor de una fila para una columna (fija o pregunta). */
export function valorColumna(fila: FilaTablaRespuestas, columnaId: string): string {
  if (columnaId === 'fecha') return fila.fecha;
  if (columnaId === 'persona') return fila.persona;
  if (columnaId === 'consentimiento') return fila.consentimiento;
  return fila.valores[columnaId] ?? '—';
}

function escaparCelda(valor: string): string {
  return valor
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
    .trim();
}

/** Tabla GFM lista para `tiptap-markdown`. Vacía sin columnas ni filas. */
export function tablaRespuestasMarkdown(
  columnas: ColumnaRespuestas[],
  filas: FilaTablaRespuestas[]
): string {
  if (columnas.length === 0 || filas.length === 0) return '';
  const cabecera = `| ${columnas.map((c) => escaparCelda(c.titulo)).join(' | ')} |`;
  const delimitador = `| ${columnas.map(() => '---').join(' | ')} |`;
  const cuerpo = filas.map(
    (f) => `| ${columnas.map((c) => escaparCelda(valorColumna(f, c.id))).join(' | ')} |`
  );
  return [cabecera, delimitador, ...cuerpo].join('\n');
}
