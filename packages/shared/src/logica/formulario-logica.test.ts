import { describe, it, expect } from 'vitest';
import {
  esValorVacio,
  evaluarCondicion,
  evaluarRegla,
  recorridoFormulario,
  sanearRespuestas,
  siguienteSeccion,
  tieneLogica,
} from '@/lib/formulario-logica';
import type {
  CondicionFormulario,
  FormularioEsquema,
  PreguntaFormulario,
  ReglaLogica,
} from '@/types';

const pregunta = (patch: Partial<PreguntaFormulario> & { id: string }): PreguntaFormulario => ({
  tipo: 'texto_corto',
  titulo: patch.id,
  requerida: false,
  ...patch,
});

const regla = (condiciones: CondicionFormulario[], modo: ReglaLogica['modo'] = 'todas'): ReglaLogica => ({
  id: 'r1',
  condiciones,
  modo,
});

describe('esValorVacio', () => {
  it('detecta vacíos', () => {
    expect(esValorVacio(undefined)).toBe(true);
    expect(esValorVacio('  ')).toBe(true);
    expect(esValorVacio([])).toBe(true);
    expect(esValorVacio(0)).toBe(false);
    expect(esValorVacio(false)).toBe(false);
    expect(esValorVacio(['a'])).toBe(false);
  });
});

describe('evaluarCondicion', () => {
  const opcion = pregunta({
    id: 'q1',
    tipo: 'opcion_multiple',
    opciones: [
      { id: 'a', etiqueta: 'A' },
      { id: 'b', etiqueta: 'B' },
    ],
  });
  const casillas = pregunta({
    id: 'q2',
    tipo: 'casillas',
    opciones: [
      { id: 'x', etiqueta: 'X' },
      { id: 'y', etiqueta: 'Y' },
    ],
  });
  const numero = pregunta({ id: 'q3', tipo: 'numero' });
  const texto = pregunta({ id: 'q4', tipo: 'texto_largo' });

  it('respondida / no_respondida', () => {
    expect(evaluarCondicion({ pregunta_id: 'q4', operador: 'respondida' }, texto, { q4: 'hola' })).toBe(true);
    expect(evaluarCondicion({ pregunta_id: 'q4', operador: 'respondida' }, texto, {})).toBe(false);
    expect(evaluarCondicion({ pregunta_id: 'q4', operador: 'no_respondida' }, texto, {})).toBe(true);
  });

  it('igual / distinto', () => {
    expect(evaluarCondicion({ pregunta_id: 'q1', operador: 'igual', valor: 'b' }, opcion, { q1: 'b' })).toBe(true);
    expect(evaluarCondicion({ pregunta_id: 'q1', operador: 'distinto', valor: 'b' }, opcion, { q1: 'a' })).toBe(true);
    expect(evaluarCondicion({ pregunta_id: 'q1', operador: 'distinto', valor: 'b' }, opcion, { q1: 'b' })).toBe(false);
  });

  it('igual numérico compara como número', () => {
    expect(evaluarCondicion({ pregunta_id: 'q3', operador: 'igual', valor: 5 }, numero, { q3: '5' })).toBe(true);
  });

  it('incluye en casillas', () => {
    expect(evaluarCondicion({ pregunta_id: 'q2', operador: 'incluye', valor: 'y' }, casillas, { q2: ['x', 'y'] })).toBe(true);
    expect(evaluarCondicion({ pregunta_id: 'q2', operador: 'incluye', valor: 'y' }, casillas, { q2: ['x'] })).toBe(false);
  });

  it('comparadores numéricos', () => {
    expect(evaluarCondicion({ pregunta_id: 'q3', operador: 'mayor', valor: 3 }, numero, { q3: 4 })).toBe(true);
    expect(evaluarCondicion({ pregunta_id: 'q3', operador: 'menor_igual', valor: 3 }, numero, { q3: 3 })).toBe(true);
    expect(evaluarCondicion({ pregunta_id: 'q3', operador: 'menor', valor: 3 }, numero, { q3: 3 })).toBe(false);
  });

  it('contiene_texto sin distinguir mayúsculas', () => {
    expect(evaluarCondicion({ pregunta_id: 'q4', operador: 'contiene_texto', valor: 'urgente' }, texto, { q4: 'Es URGENTE' })).toBe(true);
  });

  it('vacío nunca cumple operadores con valor', () => {
    expect(evaluarCondicion({ pregunta_id: 'q4', operador: 'igual', valor: 'x' }, texto, {})).toBe(false);
    expect(evaluarCondicion({ pregunta_id: 'q4', operador: 'distinto', valor: 'x' }, texto, {})).toBe(false);
  });
});

describe('evaluarRegla', () => {
  const p1 = pregunta({ id: 'a' });
  const p2 = pregunta({ id: 'b' });
  const mapa = new Map([
    ['a', p1],
    ['b', p2],
  ]);

  it('modo todas exige todo', () => {
    const r = regla([
      { pregunta_id: 'a', operador: 'respondida' },
      { pregunta_id: 'b', operador: 'respondida' },
    ]);
    expect(evaluarRegla(r, mapa, { a: 'x' })).toBe(false);
    expect(evaluarRegla(r, mapa, { a: 'x', b: 'y' })).toBe(true);
  });

  it('modo alguna basta una', () => {
    const r = regla(
      [
        { pregunta_id: 'a', operador: 'respondida' },
        { pregunta_id: 'b', operador: 'respondida' },
      ],
      'alguna'
    );
    expect(evaluarRegla(r, mapa, { a: 'x' })).toBe(true);
    expect(evaluarRegla(r, mapa, {})).toBe(false);
  });

  it('referencia inexistente = falsa', () => {
    const r = regla([{ pregunta_id: 'zz', operador: 'respondida' }]);
    expect(evaluarRegla(r, mapa, { zz: 'x' })).toBe(false);
  });
});

const esquemaConRamas: FormularioEsquema = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'Inicio',
      preguntas: [
        pregunta({
          id: 'plan',
          tipo: 'opcion_multiple',
          opciones: [
            { id: 'basico', etiqueta: 'Básico' },
            { id: 'pro', etiqueta: 'Pro' },
          ],
        }),
      ],
      ramas: [
        { id: 'rb', regla: regla([{ pregunta_id: 'plan', operador: 'igual', valor: 'basico' }]), destino: 's3' },
        { id: 'rp', regla: regla([{ pregunta_id: 'plan', operador: 'igual', valor: 'pro' }]), destino: 'enviar' },
      ],
    },
    {
      id: 's2',
      titulo: 'Solo Pro',
      preguntas: [pregunta({ id: 'empresa', requerida: true })],
    },
    {
      id: 's3',
      titulo: 'Solo Básico',
      preguntas: [
        pregunta({
          id: 'detalle',
          requerida: true,
          logica: { mostrar_si: regla([{ pregunta_id: 'plan', operador: 'igual', valor: 'basico' }]) },
        }),
        pregunta({ id: 'comentario' }),
      ],
    },
  ],
};

describe('tieneLogica', () => {
  it('detecta ramas y visibilidad', () => {
    expect(tieneLogica({ version: 1, secciones: [{ id: 's', titulo: 'S', preguntas: [pregunta({ id: 'q' })] }] })).toBe(false);
    expect(tieneLogica(esquemaConRamas)).toBe(true);
  });
});

describe('recorridoFormulario', () => {
  it('sin respuesta a la pregunta de rama recorre todo en orden', () => {
    const { secciones, visibles } = recorridoFormulario(esquemaConRamas, {});
    expect(secciones).toEqual(['s1', 's2', 's3']);
    expect(visibles.has('empresa')).toBe(true);
    expect(visibles.has('detalle')).toBe(false); // logica no cumplida
  });

  it('rama a sección posterior salta la intermedia', () => {
    const { secciones, visibles } = recorridoFormulario(esquemaConRamas, { plan: 'basico' });
    expect(secciones).toEqual(['s1', 's3']);
    expect(visibles.has('empresa')).toBe(false);
    expect(visibles.has('detalle')).toBe(true);
  });

  it("rama 'enviar' termina el formulario", () => {
    const { secciones } = recorridoFormulario(esquemaConRamas, { plan: 'pro' });
    expect(secciones).toEqual(['s1']);
  });

  it('destino inexistente cae a la sección siguiente', () => {
    const roto: FormularioEsquema = {
      version: 1,
      secciones: [
        {
          id: 's1',
          titulo: 'S1',
          preguntas: [pregunta({ id: 'q', requerida: false })],
          ramas: [
            { id: 'r', regla: regla([{ pregunta_id: 'q', operador: 'respondida' }]), destino: 'no-existe' },
          ],
        },
        { id: 's2', titulo: 'S2', preguntas: [pregunta({ id: 'q2' })] },
      ],
    };
    expect(recorridoFormulario(roto, { q: 'x' }).secciones).toEqual(['s1', 's2']);
  });
});

describe('sanearRespuestas', () => {
  it('descarta respuestas ocultas o de secciones saltadas', () => {
    const limpias = sanearRespuestas(esquemaConRamas, {
      plan: 'basico',
      empresa: 'No debió mostrarse',
      detalle: 'ok',
    });
    expect(limpias).toEqual({ plan: 'basico', detalle: 'ok' });
  });

  it('conserva todo cuando no hay lógica', () => {
    const simple: FormularioEsquema = {
      version: 1,
      secciones: [{ id: 's', titulo: 'S', preguntas: [pregunta({ id: 'q' })] }],
    };
    expect(sanearRespuestas(simple, { q: 'x' })).toEqual({ q: 'x' });
  });
});

// ---- Respuestas efectivas (sin fantasmas) ----

const esquemaFantasma: FormularioEsquema = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'Inicio',
      preguntas: [
        pregunta({
          id: 'plan',
          tipo: 'opcion_multiple',
          opciones: [
            { id: 'a', etiqueta: 'A' },
            { id: 'b', etiqueta: 'B' },
          ],
        }),
      ],
    },
    {
      id: 's2',
      titulo: 'Detalle',
      preguntas: [
        pregunta({
          id: 'detalle',
          logica: { mostrar_si: regla([{ pregunta_id: 'plan', operador: 'igual', valor: 'a' }]) },
        }),
        pregunta({
          id: 'comentario',
          requerida: true,
          logica: { mostrar_si: regla([{ pregunta_id: 'detalle', operador: 'respondida' }]) },
        }),
      ],
    },
    {
      id: 's3',
      titulo: 'Final',
      preguntas: [pregunta({ id: 'cierre' })],
    },
  ],
};

describe('respuestas efectivas', () => {
  it('una pregunta oculta no mantiene visibles a sus dependientes', () => {
    const { visibles } = recorridoFormulario(esquemaFantasma, {
      plan: 'b',
      detalle: 'fantasma',
    });
    expect(visibles.has('detalle')).toBe(false);
    expect(visibles.has('comentario')).toBe(false);
  });

  it('con la condición cumplida la cadena se muestra completa', () => {
    const { visibles } = recorridoFormulario(esquemaFantasma, {
      plan: 'a',
      detalle: 'ok',
    });
    expect(visibles.has('detalle')).toBe(true);
    expect(visibles.has('comentario')).toBe(true);
  });

  it('la rama ignora respuestas fantasma', () => {
    const conRama: FormularioEsquema = {
      version: 1,
      secciones: [
        {
          id: 's1',
          titulo: 'S1',
          preguntas: [pregunta({ id: 'q1' })],
        },
        {
          id: 's2',
          titulo: 'S2',
          preguntas: [
            pregunta({
              id: 'q2',
              logica: { mostrar_si: regla([{ pregunta_id: 'q1', operador: 'igual', valor: 'x' }]) },
            }),
          ],
          ramas: [
            {
              id: 'r',
              regla: regla([{ pregunta_id: 'q2', operador: 'respondida' }]),
              destino: 'enviar',
            },
          ],
        },
        { id: 's3', titulo: 'S3', preguntas: [pregunta({ id: 'q3' })] },
      ],
    };
    // q2 no visible (q1 !== 'x'): su valor fantasma no debe disparar la rama.
    const recorrido = recorridoFormulario(conRama, { q1: 'y', q2: 'fantasma' });
    expect(recorrido.siguientes['s2']).toBe('s3');
    expect(recorrido.secciones).toEqual(['s1', 's2', 's3']);
  });

  it('siguienteSeccion expone el mapa del recorrido', () => {
    const recorrido = recorridoFormulario(esquemaConRamas, { plan: 'basico' });
    expect(siguienteSeccion(esquemaConRamas, 's1', { plan: 'basico' })).toBe('s3');
    expect(recorrido.siguientes['s1']).toBe('s3');
    expect(siguienteSeccion(esquemaConRamas, 's1', { plan: 'pro' })).toBe('enviar');
  });

  it('sanearRespuestas es idempotente y descarta fantasmas', () => {
    const entrada = { plan: 'b', detalle: 'fantasma', comentario: 'viejo', cierre: 'ok' };
    const una = sanearRespuestas(esquemaFantasma, entrada);
    expect(una).toEqual({ plan: 'b', cierre: 'ok' });
    expect(sanearRespuestas(esquemaFantasma, una)).toEqual(una);
  });
});
