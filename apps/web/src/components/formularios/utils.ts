import type {
  CondicionFormulario,
  Formulario,
  FormularioEsquema,
  OperadorCondicion,
  PreguntaFormulario,
  RamaSeccion,
  ReglaLogica,
  SeccionFormulario,
  TipoPregunta,
} from '@/types';
import { OPERADORES_POR_TIPO, OPERADORES_SIN_VALOR, findEntityByParam, isFullUuid, slugify } from '@erp/shared';

// Helpers del constructor de formularios (puros donde se puede).

export function nuevoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const TIPOS_PREGUNTA_ETIQUETA: Record<TipoPregunta, string> = {
  texto_corto: 'Texto corto',
  texto_largo: 'Texto largo',
  opcion_multiple: 'Opción múltiple',
  casillas: 'Casillas',
  desplegable: 'Desplegable',
  escala: 'Escala lineal',
  fecha: 'Fecha',
  hora: 'Hora',
  numero: 'Número',
  email: 'Correo',
};

export function crearPregunta(tipo: TipoPregunta): PreguntaFormulario {
  const base: PreguntaFormulario = {
    id: nuevoId(),
    tipo,
    titulo: '',
    requerida: false,
  };
  if (tipo === 'opcion_multiple' || tipo === 'casillas' || tipo === 'desplegable') {
    base.opciones = [
      { id: nuevoId(), etiqueta: 'Opción 1' },
      { id: nuevoId(), etiqueta: 'Opción 2' },
    ];
  }
  if (tipo === 'escala') {
    base.escala = { min: 1, max: 5 };
  }
  if (tipo === 'texto_corto') {
    base.max_caracteres = 200;
  }
  return base;
}

export function crearSeccion(n: number): SeccionFormulario {
  return {
    id: nuevoId(),
    titulo: `Sección ${n}`,
    preguntas: [],
  };
}

export function contarPreguntas(esquema: FormularioEsquema): number {
  return esquema.secciones.reduce((sum, s) => sum + s.preguntas.length, 0);
}

export function mover<T>(lista: T[], desde: number, hacia: number): T[] {
  if (hacia < 0 || hacia >= lista.length || desde === hacia) return lista;
  const copia = [...lista];
  const [item] = copia.splice(desde, 1);
  copia.splice(hacia, 0, item);
  return copia;
}

// ---- Lógica condicional (IF) ----

export function operadorDefecto(pregunta: PreguntaFormulario): OperadorCondicion {
  return OPERADORES_POR_TIPO[pregunta.tipo][0];
}

export function valorDefecto(pregunta: PreguntaFormulario): string | number | undefined {
  if (pregunta.opciones && pregunta.opciones.length > 0) return pregunta.opciones[0].id;
  if (pregunta.tipo === 'numero') return pregunta.numero?.min ?? 0;
  if (pregunta.tipo === 'escala') return pregunta.escala?.min ?? 1;
  if (pregunta.tipo === 'fecha') return new Date().toISOString().slice(0, 10);
  if (pregunta.tipo === 'hora') return '09:00';
  return 'texto';
}

export function condicionDefecto(pregunta: PreguntaFormulario): CondicionFormulario {
  const operador = operadorDefecto(pregunta);
  return OPERADORES_SIN_VALOR.has(operador)
    ? { pregunta_id: pregunta.id, operador }
    : { pregunta_id: pregunta.id, operador, valor: valorDefecto(pregunta) };
}

/**
 * Quita de condiciones y ramas toda referencia a las preguntas indicadas
 * (al eliminar preguntas o secciones). Las reglas que quedan vacías se
 * descartan: logica → null y ramas sin condiciones → fuera.
 */
export function limpiarReferenciasPreguntas(
  esquema: FormularioEsquema,
  ids: ReadonlySet<string>
): FormularioEsquema {
  const limpiarRegla = (regla: ReglaLogica): ReglaLogica | null => {
    const condiciones = regla.condiciones.filter((c) => !ids.has(c.pregunta_id));
    return condiciones.length > 0 ? { ...regla, condiciones } : null;
  };

  return {
    ...esquema,
    secciones: esquema.secciones.map((s) => {
      const preguntas = s.preguntas.map((p) => {
        if (!p.logica) return p;
        const regla = limpiarRegla(p.logica.mostrar_si);
        return regla ? { ...p, logica: { mostrar_si: regla } } : { ...p, logica: null };
      });
      const ramas = (s.ramas ?? [])
        .map((r) => {
          const regla = limpiarRegla(r.regla);
          return regla ? { ...r, regla } : null;
        })
        .filter((r): r is RamaSeccion => r !== null);
      return { ...s, preguntas, ...(s.ramas ? { ramas } : {}) };
    }),
  };
}

// ---- Resolución por URL y enlaces públicos ----

/**
 * Resuelve el formulario del parámetro de URL con respaldo por id ya
 * cargado: al renombrar, el slug viejo deja de resolver pero la vista
 * sigue viva hasta que el efecto de sanado reemplaza la URL.
 */
export function resolverFormularioActual(
  paramId: string,
  formularios: Formulario[],
  formId?: string | null
): Formulario | undefined {
  const viaSlug = findEntityByParam(paramId, formularios);
  if (viaSlug) return viaSlug;
  if (isFullUuid(paramId)) return formularios.find((f) => f.id === paramId);
  if (formId) return formularios.find((f) => f.id === formId);
  return undefined;
}

/** true si ya existe otro formulario con el mismo nombre (case-insensitive) en el contenedor. */
export function nombreDuplicado(
  formularios: Formulario[],
  workspaceId: string,
  folderId: string | null,
  nombre: string,
  exceptoId?: string | null
): boolean {
  const normal = (s: string) => s.trim().toLowerCase();
  return formularios.some(
    (f) =>
      f.id !== exceptoId &&
      f.workspace_id === workspaceId &&
      (f.folder_id ?? null) === (folderId ?? null) &&
      normal(f.name) === normal(nombre)
  );
}

/** Link público con nombre legible + código corto (el código resuelve). */
export function construirEnlacePublico(base: string, nombre: string, codigo: string): string {
  return `${base}/f/${slugify(nombre)}-${codigo}`;
}

/** Link personal dirigido con nombre + código. */
export function construirEnlaceInvitado(base: string, nombre: string, codigo: string): string {
  return `${base}/f/i/${slugify(nombre)}-${codigo}`;
}
