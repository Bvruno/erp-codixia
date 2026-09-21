import type {
  ConteoOpcion,
  FormularioEsquema,
  PreguntaFormulario,
  ResumenPregunta,
  RespuestasFormulario,
} from '@/types';

// Agregación pura de respuestas para el dashboard (capa 3). Sin acceso a
// red: recibe esquema + filas y devuelve el resumen por pregunta.

const MAX_TEXTO = 2000;

function esVacio(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true;
  if (typeof valor === 'string') return valor.trim() === '';
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

function opcionesDe(pregunta: PreguntaFormulario): string[] {
  return (pregunta.opciones ?? []).map((o) => o.id);
}

function etiquetaDe(pregunta: PreguntaFormulario, valor: string): string {
  return pregunta.opciones?.find((o) => o.id === valor)?.etiqueta ?? valor;
}

function contar(valores: string[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const v of valores) mapa.set(v, (mapa.get(v) ?? 0) + 1);
  return mapa;
}

function aConteos(
  mapa: Map<string, number>,
  total: number,
  etiqueta?: (valor: string) => string
): ConteoOpcion[] {
  return [...mapa.entries()]
    .map(([valor, conteo]) => ({
      valor,
      etiqueta: etiqueta ? etiqueta(valor) : valor,
      conteo,
      porcentaje: total > 0 ? Math.round((conteo / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.conteo - a.conteo || a.valor.localeCompare(b.valor));
}

function resumenPregunta(
  pregunta: PreguntaFormulario,
  valores: unknown[]
): ResumenPregunta {
  const noVacios = valores.filter((v) => !esVacio(v));
  const base: ResumenPregunta = {
    pregunta_id: pregunta.id,
    tipo: pregunta.tipo,
    titulo: pregunta.titulo,
    total: noVacios.length,
  };

  switch (pregunta.tipo) {
    case 'texto_corto':
    case 'texto_largo':
    case 'email': {
      base.textos = noVacios
        .filter((v): v is string => typeof v === 'string')
        .map((v) => (v.length > MAX_TEXTO ? `${v.slice(0, MAX_TEXTO)}…` : v));
      return base;
    }

    case 'numero': {
      const nums = noVacios
        .map((v) => (typeof v === 'string' ? Number(v) : v))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      base.promedio =
        nums.length > 0
          ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
          : null;
      base.minimo = nums.length > 0 ? Math.min(...nums) : null;
      base.maximo = nums.length > 0 ? Math.max(...nums) : null;
      return base;
    }

    case 'escala': {
      const nums = noVacios
        .map((v) => (typeof v === 'string' ? Number(v) : v))
        .filter((v): v is number => typeof v === 'number' && Number.isInteger(v));
      const min = pregunta.escala?.min ?? 1;
      const max = pregunta.escala?.max ?? 5;
      const mapa = new Map<string, number>();
      for (let i = min; i <= max; i += 1) mapa.set(String(i), 0);
      nums.forEach((n) => mapa.set(String(n), (mapa.get(String(n)) ?? 0) + 1));
      base.conteos = [...mapa.entries()].map(([valor, conteo]) => ({
        valor,
        etiqueta: valor,
        conteo,
        porcentaje:
          nums.length > 0 ? Math.round((conteo / nums.length) * 1000) / 10 : 0,
      }));
      base.promedio =
        nums.length > 0
          ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
          : null;
      base.minimo = nums.length > 0 ? Math.min(...nums) : null;
      base.maximo = nums.length > 0 ? Math.max(...nums) : null;
      return base;
    }

    case 'opcion_multiple':
    case 'desplegable': {
      const validas = new Set(opcionesDe(pregunta));
      const valoresValidos = noVacios.filter(
        (v): v is string => typeof v === 'string' && (validas.size === 0 || validas.has(v))
      );
      base.conteos = aConteos(
        contar(valoresValidos),
        valoresValidos.length,
        (v) => etiquetaDe(pregunta, v)
      );
      return base;
    }

    case 'casillas': {
      const validas = new Set(opcionesDe(pregunta));
      const respondientes = noVacios.length;
      const seleccionadas: string[] = [];
      noVacios.forEach((v) => {
        if (!Array.isArray(v)) return;
        v.forEach((x) => {
          if (typeof x === 'string' && (validas.size === 0 || validas.has(x))) {
            seleccionadas.push(x);
          }
        });
      });
      base.conteos = aConteos(
        contar(seleccionadas),
        respondientes,
        (v) => etiquetaDe(pregunta, v)
      );
      return base;
    }

    case 'fecha':
    case 'hora': {
      const valoresValidos = noVacios.filter(
        (v): v is string => typeof v === 'string'
      );
      base.conteos = aConteos(contar(valoresValidos), valoresValidos.length).slice(0, 10);
      return base;
    }
  }
}

/** Resumen por pregunta en el orden del esquema. */
export function resumenRespuestas(
  esquema: FormularioEsquema,
  respuestas: RespuestasFormulario[]
): ResumenPregunta[] {
  const resumen: ResumenPregunta[] = [];
  for (const seccion of esquema.secciones) {
    for (const pregunta of seccion.preguntas) {
      resumen.push(
        resumenPregunta(
          pregunta,
          respuestas.map((r) => r[pregunta.id])
        )
      );
    }
  }
  return resumen;
}
