import { describe, it, expect } from 'vitest';
import {
  esquemaFormularioVacio,
  validarEsquemaLogica,
  validarRespuestas,
  zAjustesFormulario,
  zEsquemaFormulario,
} from '@/lib/formulario-esquema';
import { AJUSTES_FORMULARIO_DEFAULT } from '@/types';
import type { FormularioEsquema } from '@/types';

const base = (preguntas: FormularioEsquema['secciones'][number]['preguntas']): FormularioEsquema => ({
  version: 1,
  secciones: [{ id: 's1', titulo: 'Sección', preguntas }],
});

describe('esquemaFormularioVacio', () => {
  it('es válido contra el schema zod', () => {
    expect(zEsquemaFormulario.safeParse(esquemaFormularioVacio()).success).toBe(true);
  });
});

describe('zAjustesFormulario', () => {
  it('acepta los ajustes default', () => {
    expect(zAjustesFormulario.safeParse(AJUSTES_FORMULARIO_DEFAULT).success).toBe(true);
  });

  it('rechaza modo de acceso desconocido', () => {
    const res = zAjustesFormulario.safeParse({
      ...AJUSTES_FORMULARIO_DEFAULT,
      modo_acceso: 'otro',
    });
    expect(res.success).toBe(false);
  });
});

describe('validarRespuestas', () => {
  it('marca requerida vacía', () => {
    const esquema = base([
      { id: 'q1', tipo: 'texto_corto', titulo: 'Nombre', requerida: true },
    ]);
    const errores = validarRespuestas(esquema, {});
    expect(errores).toHaveLength(1);
    expect(errores[0].pregunta_id).toBe('q1');
  });

  it('ignora opcional vacía', () => {
    const esquema = base([
      { id: 'q1', tipo: 'texto_corto', titulo: 'Nombre', requerida: false },
    ]);
    expect(validarRespuestas(esquema, {})).toEqual([]);
  });

  it('valida max_caracteres', () => {
    const esquema = base([
      { id: 'q1', tipo: 'texto_corto', titulo: 'Nombre', requerida: true, max_caracteres: 3 },
    ]);
    expect(validarRespuestas(esquema, { q1: 'abcd' })).toHaveLength(1);
    expect(validarRespuestas(esquema, { q1: 'abc' })).toEqual([]);
  });

  it('valida correo', () => {
    const esquema = base([
      { id: 'q1', tipo: 'email', titulo: 'Correo', requerida: true },
    ]);
    expect(validarRespuestas(esquema, { q1: 'no-es-correo' })).toHaveLength(1);
    expect(validarRespuestas(esquema, { q1: 'a@b.co' })).toEqual([]);
  });

  it('valida rango de número', () => {
    const esquema = base([
      { id: 'q1', tipo: 'numero', titulo: 'Edad', requerida: true, numero: { min: 0, max: 120 } },
    ]);
    expect(validarRespuestas(esquema, { q1: 130 })).toHaveLength(1);
    expect(validarRespuestas(esquema, { q1: 42 })).toEqual([]);
  });

  it('rechaza fecha imposible', () => {
    const esquema = base([
      { id: 'q1', tipo: 'fecha', titulo: 'Fecha', requerida: true },
    ]);
    expect(validarRespuestas(esquema, { q1: '2026-02-30' })).toHaveLength(1);
    expect(validarRespuestas(esquema, { q1: '2026-02-28' })).toEqual([]);
  });

  it('valida hora 24h', () => {
    const esquema = base([
      { id: 'q1', tipo: 'hora', titulo: 'Hora', requerida: true },
    ]);
    expect(validarRespuestas(esquema, { q1: '25:00' })).toHaveLength(1);
    expect(validarRespuestas(esquema, { q1: '23:59' })).toEqual([]);
  });

  it('valida opción única contra el catálogo', () => {
    const esquema = base([
      {
        id: 'q1',
        tipo: 'opcion_multiple',
        titulo: 'Plan',
        requerida: true,
        opciones: [
          { id: 'a', etiqueta: 'A' },
          { id: 'b', etiqueta: 'B' },
        ],
      },
    ]);
    expect(validarRespuestas(esquema, { q1: 'c' })).toHaveLength(1);
    expect(validarRespuestas(esquema, { q1: 'b' })).toEqual([]);
  });

  it('valida casillas: requerida exige al menos una', () => {
    const esquema = base([
      {
        id: 'q1',
        tipo: 'casillas',
        titulo: 'Intereses',
        requerida: true,
        opciones: [
          { id: 'a', etiqueta: 'A' },
          { id: 'b', etiqueta: 'B' },
        ],
      },
    ]);
    expect(validarRespuestas(esquema, { q1: [] })).toHaveLength(1);
    expect(validarRespuestas(esquema, { q1: ['a', 'b'] })).toEqual([]);
    expect(validarRespuestas(esquema, { q1: ['z'] })).toHaveLength(1);
  });

  it('valida escala dentro de rango', () => {
    const esquema = base([
      {
        id: 'q1',
        tipo: 'escala',
        titulo: 'Satisfacción',
        requerida: true,
        escala: { min: 1, max: 5 },
      },
    ]);
    expect(validarRespuestas(esquema, { q1: 6 })).toHaveLength(1);
    expect(validarRespuestas(esquema, { q1: 3 })).toEqual([]);
  });
});

// ---- Lógica condicional (IF) ----

const conLogica: FormularioEsquema = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'S1',
      preguntas: [
        {
          id: 'plan',
          tipo: 'opcion_multiple',
          titulo: 'Plan',
          requerida: true,
          opciones: [
            { id: 'a', etiqueta: 'A' },
            { id: 'b', etiqueta: 'B' },
          ],
        },
        {
          id: 'detalle',
          tipo: 'texto_corto',
          titulo: 'Detalle',
          requerida: true,
          logica: {
            mostrar_si: {
              id: 'r1',
              condiciones: [{ pregunta_id: 'plan', operador: 'igual', valor: 'a' }],
              modo: 'todas',
            },
          },
        },
      ],
      ramas: [
        {
          id: 'ra',
          regla: { id: 'r2', condiciones: [{ pregunta_id: 'plan', operador: 'igual', valor: 'a' }], modo: 'todas' },
          destino: 'enviar',
        },
      ],
    },
    {
      id: 's2',
      titulo: 'S2',
      preguntas: [{ id: 'extra', tipo: 'texto_corto', titulo: 'Extra', requerida: true }],
    },
  ],
};

describe('zEsquemaFormulario con IF', () => {
  it('acepta logica y ramas', () => {
    expect(zEsquemaFormulario.safeParse(conLogica).success).toBe(true);
  });

  it('rechaza regla sin condiciones', () => {
    const malo = structuredClone(conLogica) as unknown as {
      secciones: { preguntas: { logica: { mostrar_si: { condiciones: unknown[] } } }[] }[];
    };
    malo.secciones[0].preguntas[1].logica.mostrar_si.condiciones = [];
    expect(zEsquemaFormulario.safeParse(malo).success).toBe(false);
  });
});

describe('validarEsquemaLogica', () => {
  it('acepta el esquema con referencias anteriores', () => {
    expect(validarEsquemaLogica(conLogica)).toEqual([]);
  });

  it('rechaza referencia a pregunta inexistente', () => {
    const malo = structuredClone(conLogica) as FormularioEsquema;
    malo.secciones[0].preguntas[1].logica!.mostrar_si.condiciones[0].pregunta_id = 'zz';
    expect(validarEsquemaLogica(malo)).toHaveLength(1);
  });

  it('rechaza referencia a pregunta posterior (ciclo)', () => {
    const malo = structuredClone(conLogica) as FormularioEsquema;
    malo.secciones[0].preguntas[0].logica = {
      mostrar_si: { id: 'rx', condiciones: [{ pregunta_id: 'detalle', operador: 'respondida' }], modo: 'todas' },
    };
    const errores = validarEsquemaLogica(malo);
    expect(errores).toHaveLength(1);
    expect(errores[0].mensaje).toContain('anteriores');
  });

  it('rechaza operador incompatible con el tipo', () => {
    const malo = structuredClone(conLogica) as FormularioEsquema;
    malo.secciones[0].preguntas[1].logica!.mostrar_si.condiciones[0].operador = 'mayor';
    expect(validarEsquemaLogica(malo)).toHaveLength(1);
  });

  it('rechaza valor faltante', () => {
    const malo = structuredClone(conLogica) as FormularioEsquema;
    delete malo.secciones[0].preguntas[1].logica!.mostrar_si.condiciones[0].valor;
    expect(validarEsquemaLogica(malo)).toHaveLength(1);
  });

  it('rechaza opción inválida', () => {
    const malo = structuredClone(conLogica) as FormularioEsquema;
    malo.secciones[0].preguntas[1].logica!.mostrar_si.condiciones[0].valor = 'z';
    expect(validarEsquemaLogica(malo)).toHaveLength(1);
  });

  it('rechaza rama a sección anterior', () => {
    const malo = structuredClone(conLogica) as FormularioEsquema;
    malo.secciones[1].ramas = [
      {
        id: 'rx',
        regla: { id: 'r3', condiciones: [{ pregunta_id: 'extra', operador: 'respondida' }], modo: 'todas' },
        destino: 's1',
      },
    ];
    expect(validarEsquemaLogica(malo)).toHaveLength(1);
  });

  it('rechaza rama a sección inexistente', () => {
    const malo = structuredClone(conLogica) as FormularioEsquema;
    malo.secciones[0].ramas![0].destino = 'nope';
    expect(validarEsquemaLogica(malo)).toHaveLength(1);
  });
});

describe('validarRespuestas con IF', () => {
  it('no exige preguntas ocultas', () => {
    expect(validarRespuestas(conLogica, { plan: 'b', extra: 'x' })).toEqual([]);
  });

  it('exige la pregunta visible', () => {
    const errores = validarRespuestas(conLogica, { plan: 'a' });
    expect(errores.map((e) => e.pregunta_id)).toContain('detalle');
  });

  it('no valida requeridas de secciones saltadas', () => {
    // plan=a ramifica a 'enviar'; s2 (extra requerida) no se visita.
    expect(validarRespuestas(conLogica, { plan: 'a', detalle: 'ok' })).toEqual([]);
  });
});

// ---- Validación de texto corto ----

const conValidacion = (
  validacion_texto: FormularioEsquema['secciones'][number]['preguntas'][number]['validacion_texto']
): FormularioEsquema =>
  base([
    {
      id: 'q1',
      tipo: 'texto_corto',
      titulo: 'Texto',
      requerida: true,
      validacion_texto,
    },
  ]);

describe('validación de texto_corto', () => {
  it('modo texto acepta letras y espacios y rechaza dígitos', () => {
    const esquema = conValidacion({ modo: 'texto' });
    expect(validarRespuestas(esquema, { q1: 'Ana Pérez' })).toEqual([]);
    expect(validarRespuestas(esquema, { q1: 'Ana123' })).toHaveLength(1);
  });

  it('modo numero exige solo dígitos', () => {
    const esquema = conValidacion({ modo: 'numero' });
    expect(validarRespuestas(esquema, { q1: 'abc' })[0].mensaje).toBe(
      'Solo se permiten números'
    );
    expect(validarRespuestas(esquema, { q1: '123456' })).toEqual([]);
  });

  it('modo numero respeta dígitos mínimos y máximos', () => {
    const esquema = conValidacion({ modo: 'numero', digitos_min: 4, digitos_max: 6 });
    expect(validarRespuestas(esquema, { q1: '123' })[0].mensaje).toBe('Mínimo 4 dígitos');
    expect(validarRespuestas(esquema, { q1: '1234567' })[0].mensaje).toBe('Máximo 6 dígitos');
    expect(validarRespuestas(esquema, { q1: '1234' })).toEqual([]);
  });

  it('modo email valida el correo', () => {
    const esquema = conValidacion({ modo: 'email' });
    expect(validarRespuestas(esquema, { q1: 'no-correo' })[0].mensaje).toBe('Correo inválido');
    expect(validarRespuestas(esquema, { q1: 'a@b.co' })).toEqual([]);
  });

  it('sin validación no aplica reglas extra', () => {
    const esquema = conValidacion(undefined);
    expect(validarRespuestas(esquema, { q1: 'lo que sea 123' })).toEqual([]);
  });

  it('zod rechaza mínimos mayores que máximos', () => {
    const esquema = conValidacion({ modo: 'numero', digitos_min: 6, digitos_max: 4 });
    expect(zEsquemaFormulario.safeParse(esquema).success).toBe(false);
  });

  it('zod rechaza validacion_texto en preguntas que no son texto corto', () => {
    const esquema: FormularioEsquema = base([
      {
        id: 'q1',
        tipo: 'numero',
        titulo: 'Edad',
        requerida: false,
        validacion_texto: { modo: 'numero' },
      },
    ]);
    expect(zEsquemaFormulario.safeParse(esquema).success).toBe(false);
  });
});
