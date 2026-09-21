import { z } from 'zod';
import type {
  CondicionFormulario,
  ErrorRespuestaFormulario,
  FormularioEsquema,
  OperadorCondicion,
  PreguntaFormulario,
  RespuestasFormulario,
  TipoPregunta,
} from '@/types';
import { recorridoFormulario } from './formulario-logica';

// Contrato único del esquema de formulario: la API valida con estos
// schemas lo que guarda el editor, y valida con `validarRespuestas` lo
// que envía el cliente externo. El SPA usa los mismos tipos.

export const TIPOS_PREGUNTA = [
  'texto_corto',
  'texto_largo',
  'opcion_multiple',
  'casillas',
  'desplegable',
  'escala',
  'fecha',
  'hora',
  'numero',
  'email',
] as const;

export const zTipoPregunta = z.enum(TIPOS_PREGUNTA);

export const zOpcionPregunta = z.object({
  id: z.string().min(1).max(64),
  etiqueta: z.string().min(1).max(200),
});

// ---- Lógica condicional (IF) ----

export const OPERADORES_CONDICION = [
  'igual',
  'distinto',
  'incluye',
  'mayor',
  'menor',
  'mayor_igual',
  'menor_igual',
  'contiene_texto',
  'respondida',
  'no_respondida',
] as const;

export const zOperadorCondicion = z.enum(OPERADORES_CONDICION);

export const OPERADORES_CONDICION_ETIQUETA: Record<OperadorCondicion, string> = {
  igual: 'es igual a',
  distinto: 'es distinto de',
  incluye: 'incluye',
  mayor: 'es mayor que',
  menor: 'es menor que',
  mayor_igual: 'es mayor o igual que',
  menor_igual: 'es menor o igual que',
  contiene_texto: 'contiene el texto',
  respondida: 'fue respondida',
  no_respondida: 'no fue respondida',
};

/** Operadores disponibles según el tipo de pregunta referenciada. */
export const OPERADORES_POR_TIPO: Record<TipoPregunta, OperadorCondicion[]> = {
  texto_corto: ['igual', 'distinto', 'contiene_texto', 'respondida', 'no_respondida'],
  texto_largo: ['igual', 'distinto', 'contiene_texto', 'respondida', 'no_respondida'],
  email: ['igual', 'distinto', 'contiene_texto', 'respondida', 'no_respondida'],
  numero: ['mayor', 'menor', 'mayor_igual', 'menor_igual', 'igual', 'distinto', 'respondida', 'no_respondida'],
  escala: ['mayor', 'menor', 'mayor_igual', 'menor_igual', 'igual', 'distinto', 'respondida', 'no_respondida'],
  fecha: ['igual', 'distinto', 'respondida', 'no_respondida'],
  hora: ['igual', 'distinto', 'respondida', 'no_respondida'],
  opcion_multiple: ['igual', 'distinto', 'respondida', 'no_respondida'],
  desplegable: ['igual', 'distinto', 'respondida', 'no_respondida'],
  casillas: ['incluye', 'respondida', 'no_respondida'],
};

export const OPERADORES_SIN_VALOR: ReadonlySet<OperadorCondicion> = new Set([
  'respondida',
  'no_respondida',
]);

export const zCondicionFormulario = z.object({
  pregunta_id: z.string().min(1).max(64),
  operador: zOperadorCondicion,
  valor: z.union([z.string().max(300), z.number()]).optional(),
});

export const zReglaLogica = z.object({
  id: z.string().min(1).max(64),
  condiciones: z.array(zCondicionFormulario).min(1).max(10),
  modo: z.enum(['todas', 'alguna']),
});

export const zLogicaPregunta = z.object({
  mostrar_si: zReglaLogica,
});

export const zRamaSeccion = z.object({
  id: z.string().min(1).max(64),
  regla: zReglaLogica,
  destino: z.union([z.string().min(1).max(64), z.literal('enviar')]),
});

export const zValidacionTexto = z
  .object({
    modo: z.enum(['texto', 'numero', 'email']),
    digitos_min: z.number().int().min(0).max(100).optional(),
    digitos_max: z.number().int().min(0).max(100).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.digitos_min !== undefined &&
      v.digitos_max !== undefined &&
      v.digitos_min > v.digitos_max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los dígitos mínimos no pueden superar a los máximos',
      });
    }
  });

export const zPreguntaFormulario = z
  .object({
    id: z.string().min(1).max(64),
    tipo: zTipoPregunta,
    titulo: z.string().min(1).max(300),
    descripcion: z.string().max(1000).optional(),
    requerida: z.boolean(),
    opciones: z.array(zOpcionPregunta).max(100).optional(),
    escala: z
      .object({
        min: z.number().int().min(0).max(10),
        max: z.number().int().min(1).max(10),
        etiqueta_min: z.string().max(100).optional(),
        etiqueta_max: z.string().max(100).optional(),
      })
      .optional(),
    numero: z
      .object({ min: z.number().optional(), max: z.number().optional() })
      .optional(),
    max_caracteres: z.number().int().min(0).max(10000).optional(),
    validacion_texto: zValidacionTexto.nullable().optional(),
    logica: zLogicaPregunta.nullable().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.tipo !== 'texto_corto' && p.validacion_texto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validacion_texto'],
        message: 'La validación de texto solo aplica a preguntas de texto corto',
      });
    }
  });

export const zSeccionFormulario = z.object({
  id: z.string().min(1).max(64),
  titulo: z.string().min(1).max(300),
  descripcion: z.string().max(1000).optional(),
  preguntas: z.array(zPreguntaFormulario).max(200),
  ramas: z.array(zRamaSeccion).max(20).optional(),
});

export const zEsquemaFormulario = z.object({
  version: z.number().int().min(1),
  secciones: z.array(zSeccionFormulario).max(50),
});

export const zAjustesFormulario = z.object({
  modo_acceso: z.enum(['publico', 'lista', 'personal']),
  lista_modo: z.enum(['blanca', 'negra']),
  identificadores: z.array(z.enum(['dni', 'email'])).min(1).max(2),
  una_respuesta_por_persona: z.boolean(),
  requiere_consentimiento: z.boolean(),
  texto_privacidad: z.string().max(5000),
  mensaje_confirmacion: z.string().max(1000),
});

export const zRespuestasFormulario = z.record(z.string(), z.unknown());

export interface ErrorLogicaFormulario {
  seccion_id?: string;
  pregunta_id?: string;
  mensaje: string;
}

/**
 * Valida referencias de la lógica condicional: condiciones solo a
 * preguntas anteriores, operadores coherentes con el tipo, valor
 * requerido y ramas solo hacia secciones posteriores (sin ciclos).
 */
export function validarEsquemaLogica(esquema: FormularioEsquema): ErrorLogicaFormulario[] {
  const errores: ErrorLogicaFormulario[] = [];
  const preguntasOrden: PreguntaFormulario[] = esquema.secciones.flatMap((s) => s.preguntas);
  const indexPregunta = new Map(preguntasOrden.map((p, i) => [p.id, i]));
  const indexSeccion = new Map(esquema.secciones.map((s, i) => [s.id, i]));
  const seccionDePregunta = new Map<string, string>();
  esquema.secciones.forEach((s) =>
    s.preguntas.forEach((p) => seccionDePregunta.set(p.id, s.id))
  );

  const validarCondicion = (
    cond: CondicionFormulario,
    limite: number,
    ctx: { seccion_id?: string; pregunta_id?: string }
  ) => {
    const idx = indexPregunta.get(cond.pregunta_id);
    if (idx === undefined) {
      errores.push({ ...ctx, mensaje: 'La condición referencia una pregunta que no existe' });
      return;
    }
    const ref = preguntasOrden[idx];
    if (idx >= limite) {
      errores.push({
        ...ctx,
        mensaje: `Solo puedes usar preguntas anteriores a «${ref.titulo || ref.id}»`,
      });
      return;
    }
    if (!OPERADORES_POR_TIPO[ref.tipo].includes(cond.operador)) {
      errores.push({
        ...ctx,
        mensaje: `Operador no válido para una pregunta de tipo ${ref.tipo}`,
      });
      return;
    }
    if (OPERADORES_SIN_VALOR.has(cond.operador)) return;

    if (cond.valor === undefined || cond.valor === null || cond.valor === '') {
      errores.push({ ...ctx, mensaje: 'La condición necesita un valor' });
      return;
    }
    if (
      (cond.operador === 'mayor' ||
        cond.operador === 'menor' ||
        cond.operador === 'mayor_igual' ||
        cond.operador === 'menor_igual') &&
      typeof cond.valor !== 'number'
    ) {
      errores.push({ ...ctx, mensaje: 'El valor debe ser numérico' });
      return;
    }
    if (
      cond.operador === 'igual' ||
      cond.operador === 'distinto' ||
      cond.operador === 'incluye'
    ) {
      const opciones = ref.opciones ?? [];
      if (opciones.length > 0) {
        if (typeof cond.valor !== 'string' || !opciones.some((o) => o.id === cond.valor)) {
          errores.push({ ...ctx, mensaje: 'Elige una opción válida de la pregunta' });
        }
      } else if (typeof cond.valor !== 'string' && typeof cond.valor !== 'number') {
        errores.push({ ...ctx, mensaje: 'Valor inválido' });
      }
    }
  };

  preguntasOrden.forEach((p, i) => {
    if (!p.logica) return;
    p.logica.mostrar_si.condiciones.forEach((c) =>
      validarCondicion(c, i, { seccion_id: seccionDePregunta.get(p.id), pregunta_id: p.id })
    );
  });

  esquema.secciones.forEach((s, si) => {
    let ultimaPreguntaIdx = -1;
    s.preguntas.forEach((p) => {
      const idx = indexPregunta.get(p.id) ?? -1;
      if (idx > ultimaPreguntaIdx) ultimaPreguntaIdx = idx;
    });
    (s.ramas ?? []).forEach((r) => {
      r.regla.condiciones.forEach((c) =>
        validarCondicion(c, ultimaPreguntaIdx + 1, { seccion_id: s.id })
      );
      if (r.destino === 'enviar') return;
      const destinoIdx = indexSeccion.get(r.destino);
      if (destinoIdx === undefined) {
        errores.push({ seccion_id: s.id, mensaje: 'La rama apunta a una sección que no existe' });
      } else if (destinoIdx <= si) {
        errores.push({
          seccion_id: s.id,
          mensaje: 'La rama solo puede ir a una sección posterior o Enviar',
        });
      }
    });
  });

  return errores;
}

export function esquemaFormularioVacio(): FormularioEsquema {
  return { version: 1, secciones: [] };
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_SOLO_TEXTO = /^[\p{L}\s]+$/u;

function esVacio(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true;
  if (typeof valor === 'string') return valor.trim() === '';
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

function opcionesDe(pregunta: PreguntaFormulario): string[] {
  return (pregunta.opciones ?? []).map((o) => o.id);
}

function fechaValida(valor: string): boolean {
  if (!RE_FECHA.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return (
    fecha.getUTCFullYear() === a &&
    fecha.getUTCMonth() === m - 1 &&
    fecha.getUTCDate() === d
  );
}

/**
 * Valida una respuesta individual contra su pregunta. Devuelve el mensaje
 * de error o null si es válida (incluidas las opcionales vacías).
 */
export function validarPregunta(p: PreguntaFormulario, valor: unknown): string | null {
  if (esVacio(valor)) {
    return p.requerida ? 'Esta pregunta es obligatoria' : null;
  }

  switch (p.tipo) {
    case 'texto_corto': {
      if (typeof valor !== 'string') return 'Respuesta inválida';
      if (p.max_caracteres && valor.length > p.max_caracteres) {
        return `Máximo ${p.max_caracteres} caracteres`;
      }
      const validacion = p.validacion_texto;
      if (validacion?.modo === 'texto') {
        if (!RE_SOLO_TEXTO.test(valor.trim())) return 'Solo se permiten letras';
      } else if (validacion?.modo === 'numero') {
        const digitos = valor.trim();
        if (!/^\d+$/.test(digitos)) return 'Solo se permiten números';
        if (validacion.digitos_min !== undefined && digitos.length < validacion.digitos_min) {
          return `Mínimo ${validacion.digitos_min} dígitos`;
        }
        if (validacion.digitos_max !== undefined && digitos.length > validacion.digitos_max) {
          return `Máximo ${validacion.digitos_max} dígitos`;
        }
      } else if (validacion?.modo === 'email') {
        if (!RE_EMAIL.test(valor.trim())) return 'Correo inválido';
      }
      return null;
    }

    case 'texto_largo': {
      if (typeof valor !== 'string') return 'Respuesta inválida';
      if (p.max_caracteres && valor.length > p.max_caracteres) {
        return `Máximo ${p.max_caracteres} caracteres`;
      }
      return null;
    }

    case 'email': {
      if (typeof valor !== 'string' || !RE_EMAIL.test(valor.trim())) {
        return 'Correo inválido';
      }
      return null;
    }

    case 'numero': {
      const n = typeof valor === 'string' ? Number(valor) : valor;
      if (typeof n !== 'number' || !Number.isFinite(n)) return 'Número inválido';
      if (p.numero?.min !== undefined && n < p.numero.min) {
        return `El mínimo es ${p.numero.min}`;
      }
      if (p.numero?.max !== undefined && n > p.numero.max) {
        return `El máximo es ${p.numero.max}`;
      }
      return null;
    }

    case 'fecha': {
      if (typeof valor !== 'string' || !fechaValida(valor)) return 'Fecha inválida';
      return null;
    }

    case 'hora': {
      if (typeof valor !== 'string' || !RE_HORA.test(valor)) return 'Hora inválida';
      return null;
    }

    case 'opcion_multiple':
    case 'desplegable': {
      if (typeof valor !== 'string' || !opcionesDe(p).includes(valor)) {
        return 'Opción inválida';
      }
      return null;
    }

    case 'casillas': {
      if (!Array.isArray(valor)) return 'Respuesta inválida';
      const validas = opcionesDe(p);
      if (valor.some((v) => typeof v !== 'string' || !validas.includes(v))) {
        return 'Opción inválida';
      }
      return null;
    }

    case 'escala': {
      const n = typeof valor === 'string' ? Number(valor) : valor;
      const min = p.escala?.min ?? 1;
      const max = p.escala?.max ?? 5;
      if (
        typeof n !== 'number' ||
        !Number.isInteger(n) ||
        n < min ||
        n > max
      ) {
        return 'Valor fuera de la escala';
      }
      return null;
    }
  }
}

/**
 * Valida las respuestas contra el esquema, respetando la lógica
 * condicional: las preguntas ocultas no se exigen ni se validan. La usan
 * la API (servidor) y el SPA (UX inmediata).
 */
export function validarRespuestas(
  esquema: FormularioEsquema,
  respuestas: RespuestasFormulario
): ErrorRespuestaFormulario[] {
  const errores: ErrorRespuestaFormulario[] = [];
  const { visibles } = recorridoFormulario(esquema, respuestas);

  for (const seccion of esquema.secciones) {
    for (const p of seccion.preguntas) {
      if (!visibles.has(p.id)) continue;
      const mensaje = validarPregunta(p, respuestas[p.id]);
      if (mensaje) errores.push({ pregunta_id: p.id, mensaje });
    }
  }

  return errores;
}
