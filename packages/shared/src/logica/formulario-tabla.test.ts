import { describe, it, expect } from 'vitest';
import {
  COLUMNAS_FIJAS,
  columnasDeFormulario,
  construirFilasTabla,
  personaRespuesta,
  tablaRespuestasMarkdown,
  valorColumna,
  valorLegible,
} from '@/lib/formulario-tabla';
import type { FormularioEsquema, FormularioRespuesta, PreguntaFormulario } from '@/types';

const esquema: FormularioEsquema = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'General',
      preguntas: [
        {
          id: 'plan',
          tipo: 'opcion_multiple',
          titulo: 'Plan',
          requerida: true,
          opciones: [
            { id: 'basico', etiqueta: 'Básico' },
            { id: 'pro', etiqueta: 'Pro' },
          ],
        },
        {
          id: 'extras',
          tipo: 'casillas',
          titulo: 'Extras',
          requerida: false,
          opciones: [
            { id: 'soporte', etiqueta: 'Soporte' },
            { id: 'training', etiqueta: 'Capacitación' },
          ],
        },
        { id: 'comentario', tipo: 'texto_largo', titulo: 'Comentario', requerida: false },
      ],
    },
  ],
};

function respuesta(
  patch: Partial<FormularioRespuesta> & { id: string }
): FormularioRespuesta {
  return {
    formulario_id: 'f1',
    profile_id: null,
    invitado_id: null,
    identificador_hash: null,
    consentimiento: true,
    respuestas: {},
    created_at: '2026-09-01T10:00:00.000Z',
    ...patch,
  };
}

const respuestas: FormularioRespuesta[] = [
  respuesta({
    id: 'r1',
    invitado_nombre: 'Ana',
    created_at: '2026-09-01T10:00:00.000Z',
    respuestas: { plan: 'pro', extras: ['soporte', 'training'], comentario: 'Excelente' },
  }),
  respuesta({
    id: 'r2',
    profile_id: 'p1',
    created_at: '2026-09-02T09:30:00.000Z',
    consentimiento: false,
    respuestas: { plan: 'basico', extras: [], comentario: '' },
  }),
  respuesta({ id: 'r3', identificador_hash: 'abc' }),
];

describe('valorLegible', () => {
  const plan = esquema.secciones[0].preguntas[0];
  const extras = esquema.secciones[0].preguntas[1];

  it('resuelve etiquetas de opción múltiple', () => {
    expect(valorLegible(plan, 'pro')).toBe('Pro');
    expect(valorLegible(plan, 'desconocido')).toBe('desconocido');
  });

  it('une etiquetas de casillas y tolera valores no-array', () => {
    expect(valorLegible(extras, ['soporte', 'training'])).toBe('Soporte, Capacitación');
    expect(valorLegible(extras, 'soporte')).toBe('—');
  });

  it('marca vacíos con guion', () => {
    expect(valorLegible(plan, null)).toBe('—');
    expect(valorLegible(plan, '')).toBe('—');
  });
});

describe('personaRespuesta', () => {
  it('prioriza nombre de invitado, luego miembro, identificado y anónimo', () => {
    expect(personaRespuesta(respuestas[0])).toBe('Ana');
    expect(personaRespuesta(respuestas[1])).toBe('Miembro');
    expect(personaRespuesta(respuestas[2])).toBe('Identificado');
    expect(personaRespuesta(respuesta({ id: 'r4' }))).toBe('Anónimo');
  });
});

describe('columnasDeFormulario', () => {
  it('antepone las columnas fijas y respeta el orden del esquema', () => {
    expect(columnasDeFormulario(esquema).map((c) => c.id)).toEqual([
      'fecha',
      'persona',
      'consentimiento',
      'plan',
      'extras',
      'comentario',
    ]);
    expect(COLUMNAS_FIJAS.map((c) => c.titulo)).toEqual([
      'Fecha',
      'Persona',
      'Consentimiento',
    ]);
  });
});

describe('construirFilasTabla', () => {
  it('construye filas legibles con fecha formateada', () => {
    const filas = construirFilasTabla(esquema, respuestas, {
      formatearFecha: (iso) => `F:${iso.slice(0, 10)}`,
    });
    expect(filas.map((f) => f.id)).toEqual(['r1', 'r2', 'r3']);
    expect(filas[0]).toEqual({
      id: 'r1',
      fecha: 'F:2026-09-01',
      persona: 'Ana',
      consentimiento: 'Sí',
      valores: { plan: 'Pro', extras: 'Soporte, Capacitación', comentario: 'Excelente' },
    });
    expect(filas[1].consentimiento).toBe('No');
    expect(filas[2].valores.plan).toBe('—');
  });

  it('usa la fecha ISO cuando no se pasa formateador', () => {
    expect(construirFilasTabla(esquema, respuestas)[0].fecha).toBe(
      '2026-09-01T10:00:00.000Z'
    );
  });

  it('valorColumna resuelve fijas y preguntas', () => {
    const fila = construirFilasTabla(esquema, respuestas)[0];
    expect(valorColumna(fila, 'persona')).toBe('Ana');
    expect(valorColumna(fila, 'consentimiento')).toBe('Sí');
    expect(valorColumna(fila, 'plan')).toBe('Pro');
    expect(valorColumna(fila, 'inexistente')).toBe('—');
  });
});

describe('tablaRespuestasMarkdown', () => {
  const columnas = columnasDeFormulario(esquema);
  const filas = construirFilasTabla(esquema, respuestas);

  it('genera cabecera, delimitador y cuerpo GFM', () => {
    const tabla = tablaRespuestasMarkdown(columnas, filas.slice(0, 1));
    const lineas = tabla.split('\n');
    expect(lineas[0]).toBe('| Fecha | Persona | Consentimiento | Plan | Extras | Comentario |');
    expect(lineas[1]).toBe('| --- | --- | --- | --- | --- | --- |');
    expect(lineas[2]).toBe(
      '| 2026-09-01T10:00:00.000Z | Ana | Sí | Pro | Soporte, Capacitación | Excelente |'
    );
    expect(lineas).toHaveLength(3);
  });

  it('respeta subconjuntos de columnas y filas', () => {
    const tabla = tablaRespuestasMarkdown(
      columnas.filter((c) => c.id === 'persona' || c.id === 'plan'),
      filas.slice(0, 2)
    );
    expect(tabla.split('\n')).toEqual([
      '| Persona | Plan |',
      '| --- | --- |',
      '| Ana | Pro |',
      '| Miembro | Básico |',
    ]);
  });

  it('escapa pipes, saltos de línea y barras invertidas', () => {
    const preguntas = [
      esquema.secciones[0].preguntas[0],
      { id: 'nota', tipo: 'texto_largo', titulo: 'Nota | rara', requerida: false } as PreguntaFormulario,
    ];
    const filasEspeciales = construirFilasTabla(
      { version: 1, secciones: [{ id: 's', titulo: 'S', preguntas }] },
      [
        respuesta({
          id: 'rx',
          respuestas: { plan: 'pro', nota: 'linea1\nlinea2 | pipe \\ barra' },
        }),
      ]
    );
    const tabla = tablaRespuestasMarkdown(
      [
        { id: 'nota', titulo: 'Nota | rara' },
        { id: 'plan', titulo: 'Plan' },
      ],
      filasEspeciales
    );
    const lineas = tabla.split('\n');
    expect(lineas[0]).toBe('| Nota \\| rara | Plan |');
    expect(lineas[2]).toBe('| linea1<br>linea2 \\| pipe \\\\ barra | Pro |');
  });

  it('devuelve cadena vacía sin columnas o sin filas', () => {
    expect(tablaRespuestasMarkdown([], filas)).toBe('');
    expect(tablaRespuestasMarkdown(columnas, [])).toBe('');
  });
});
