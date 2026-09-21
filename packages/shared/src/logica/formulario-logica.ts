import type {
  CondicionFormulario,
  FormularioEsquema,
  PreguntaFormulario,
  RamaSeccion,
  ReglaLogica,
  RespuestasFormulario,
  SeccionFormulario,
} from '@/types';

// Motor de lógica condicional (IF): evalúa visibilidad de preguntas y
// ramas de sección contra las respuestas acumuladas. Puro y compartido:
// el SPA lo usa para navegar/validar y la API para recomputar en servidor
// (nunca confía en el cliente).

export function esValorVacio(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true;
  if (typeof valor === 'string') return valor.trim() === '';
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

export function tieneLogica(esquema: FormularioEsquema): boolean {
  return esquema.secciones.some(
    (s) => (s.ramas?.length ?? 0) > 0 || s.preguntas.some((p) => !!p.logica)
  );
}

function comoNumero(valor: unknown): number | null {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function evaluarCondicion(
  condicion: CondicionFormulario,
  referencia: PreguntaFormulario,
  respuestas: RespuestasFormulario
): boolean {
  const valor = respuestas[condicion.pregunta_id];
  const vacio = esValorVacio(valor);

  switch (condicion.operador) {
    case 'respondida':
      return !vacio;
    case 'no_respondida':
      return vacio;
  }

  if (vacio) return false;
  const esperado = condicion.valor;

  switch (condicion.operador) {
    case 'igual':
    case 'distinto': {
      let coincide: boolean;
      if (referencia.tipo === 'casillas') {
        coincide = Array.isArray(valor) && valor.includes(esperado as string);
      } else if (typeof valor === 'number' || typeof esperado === 'number') {
        coincide = comoNumero(valor) === comoNumero(esperado);
      } else {
        coincide = String(valor) === String(esperado);
      }
      return condicion.operador === 'igual' ? coincide : !coincide;
    }

    case 'incluye':
      return Array.isArray(valor) && valor.includes(esperado as string);

    case 'mayor':
    case 'menor':
    case 'mayor_igual':
    case 'menor_igual': {
      const actual = comoNumero(valor);
      const limite = comoNumero(esperado);
      if (actual === null || limite === null) return false;
      if (condicion.operador === 'mayor') return actual > limite;
      if (condicion.operador === 'menor') return actual < limite;
      if (condicion.operador === 'mayor_igual') return actual >= limite;
      return actual <= limite;
    }

    case 'contiene_texto':
      return (
        typeof valor === 'string' &&
        valor.toLowerCase().includes(String(esperado).toLowerCase())
      );
  }
}

export function evaluarRegla(
  regla: ReglaLogica,
  preguntasPorId: Map<string, PreguntaFormulario>,
  respuestas: RespuestasFormulario
): boolean {
  if (regla.condiciones.length === 0) return false;
  const resultados = regla.condiciones.map((c) => {
    const ref = preguntasPorId.get(c.pregunta_id);
    return ref ? evaluarCondicion(c, ref, respuestas) : false;
  });
  return regla.modo === 'todas' ? resultados.every(Boolean) : resultados.some(Boolean);
}

export interface RecorridoFormulario {
  /** Secciones visitadas en orden (con ramas aplicadas). */
  secciones: string[];
  /** Preguntas visibles del recorrido (ocultas por logica quedan fuera). */
  visibles: Set<string>;
  /** Siguiente paso desde cada sección visitada: id, 'enviar' o null. */
  siguientes: Record<string, string | 'enviar' | null>;
}

function porId(esquema: FormularioEsquema) {
  const preguntasPorId = new Map<string, PreguntaFormulario>();
  const seccionesPorId = new Map<string, SeccionFormulario>();
  esquema.secciones.forEach((s) => {
    seccionesPorId.set(s.id, s);
    s.preguntas.forEach((p) => preguntasPorId.set(p.id, p));
  });
  return { preguntasPorId, seccionesPorId };
}

function indiceSiguiente(esquema: FormularioEsquema, seccionId: string): string | null {
  const idx = esquema.secciones.findIndex((s) => s.id === seccionId);
  if (idx === -1 || idx === esquema.secciones.length - 1) return null;
  return esquema.secciones[idx + 1].id;
}

function ramaQueCumple(
  ramas: RamaSeccion[] | undefined,
  preguntasPorId: Map<string, PreguntaFormulario>,
  respuestas: RespuestasFormulario
): RamaSeccion | null {
  for (const rama of ramas ?? []) {
    if (evaluarRegla(rama.regla, preguntasPorId, respuestas)) return rama;
  }
  return null;
}

function calcularSiguiente(
  esquema: FormularioEsquema,
  seccion: SeccionFormulario,
  preguntasPorId: Map<string, PreguntaFormulario>,
  seccionesPorId: Map<string, SeccionFormulario>,
  respuestas: RespuestasFormulario
): string | 'enviar' | null {
  const rama = ramaQueCumple(seccion.ramas, preguntasPorId, respuestas);
  if (rama) {
    if (rama.destino === 'enviar') return 'enviar';
    if (seccionesPorId.has(rama.destino)) return rama.destino;
  }
  return indiceSiguiente(esquema, seccion.id);
}

/**
 * Siguiente sección tras responder la actual: primera rama que cumple,
 * luego la sección siguiente, `null` si ya no hay más. `'enviar'` cuando
 * una rama termina el formulario. Las condiciones se evalúan con las
 * respuestas efectivas del recorrido (una pregunta oculta no cuenta
 * como respondida).
 */
export function siguienteSeccion(
  esquema: FormularioEsquema,
  seccionId: string,
  respuestas: RespuestasFormulario
): string | 'enviar' | null {
  const recorrido = recorridoFormulario(esquema, respuestas);
  return recorrido.siguientes[seccionId] ?? null;
}

/**
 * Recorre el formulario con las respuestas actuales manteniendo las
 * respuestas EFECTIVAS: cuando una pregunta queda oculta, su valor deja
 * de contar como respondido para las condiciones y ramas posteriores
 * (misma semántica que el saneo y que la validación del servidor).
 */
export function recorridoFormulario(
  esquema: FormularioEsquema,
  respuestas: RespuestasFormulario
): RecorridoFormulario {
  const { preguntasPorId, seccionesPorId } = porId(esquema);
  const visitadas: string[] = [];
  const visibles = new Set<string>();
  const siguientes: Record<string, string | 'enviar' | null> = {};
  const efectivas: RespuestasFormulario = {};
  const vistas = new Set<string>();

  let actualId: string | null = esquema.secciones[0]?.id ?? null;
  while (actualId) {
    if (vistas.has(actualId)) break;
    vistas.add(actualId);
    const seccion: SeccionFormulario | undefined = seccionesPorId.get(actualId);
    if (!seccion) break;
    visitadas.push(seccion.id);

    for (const p of seccion.preguntas) {
      const visible =
        !p.logica || evaluarRegla(p.logica.mostrar_si, preguntasPorId, efectivas);
      if (!visible) continue;
      visibles.add(p.id);
      if (p.id in respuestas) efectivas[p.id] = respuestas[p.id];
    }

    const siguiente = calcularSiguiente(
      esquema,
      seccion,
      preguntasPorId,
      seccionesPorId,
      efectivas
    );
    siguientes[seccion.id] = siguiente;
    if (siguiente === null || siguiente === 'enviar') break;
    actualId = siguiente;
  }

  return { secciones: visitadas, visibles, siguientes };
}

/**
 * Preguntas visibles de una sección concreta. Se deriva del recorrido
 * efectivo, así que una sección fuera del camino devuelve su visibilidad
 * con las respuestas efectivas del recorrido (sin fantasmas).
 */
export function preguntasVisiblesDeSeccion(
  esquema: FormularioEsquema,
  seccion: SeccionFormulario,
  respuestas: RespuestasFormulario
): Set<string> {
  const { visibles } = recorridoFormulario(esquema, respuestas);
  const resultado = new Set<string>();
  for (const p of seccion.preguntas) {
    if (visibles.has(p.id)) resultado.add(p.id);
  }
  return resultado;
}

/**
 * Descarta respuestas de preguntas que no pertenecen al recorrido
 * (ocultas o de secciones saltadas). La API lo aplica antes de guardar.
 */
export function sanearRespuestas(
  esquema: FormularioEsquema,
  respuestas: RespuestasFormulario
): RespuestasFormulario {
  const { visibles } = recorridoFormulario(esquema, respuestas);
  const limpias: RespuestasFormulario = {};
  for (const [clave, valor] of Object.entries(respuestas)) {
    if (visibles.has(clave)) limpias[clave] = valor;
  }
  return limpias;
}
