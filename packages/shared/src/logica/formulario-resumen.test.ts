import { describe, it, expect } from 'vitest';
import { resumenRespuestas } from '@/lib/formulario-resumen';
import type { FormularioEsquema } from '@/types';

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
        { id: 'edad', tipo: 'numero', titulo: 'Edad', requerida: false },
        {
          id: 'satisfaccion',
          tipo: 'escala',
          titulo: 'Satisfacción',
          requerida: true,
          escala: { min: 1, max: 5 },
        },
        { id: 'comentario', tipo: 'texto_largo', titulo: 'Comentario', requerida: false },
        { id: 'fecha', tipo: 'fecha', titulo: 'Fecha', requerida: false },
      ],
    },
  ],
};

describe('resumenRespuestas', () => {
  const respuestas = [
    { plan: 'pro', extras: ['soporte'], edad: 30, satisfaccion: 5, comentario: 'Excelente', fecha: '2026-09-01' },
    { plan: 'pro', extras: ['soporte', 'training'], edad: 40, satisfaccion: 4, comentario: 'Bien', fecha: '2026-09-01' },
    { plan: 'basico', extras: [], edad: 20, satisfaccion: 5, comentario: '', fecha: '2026-09-02' },
  ];

  const resumen = resumenRespuestas(esquema, respuestas);
  const porId = (id: string) => resumen.find((r) => r.pregunta_id === id)!;

  it('mantiene el orden del esquema', () => {
    expect(resumen.map((r) => r.pregunta_id)).toEqual([
      'plan',
      'extras',
      'edad',
      'satisfaccion',
      'comentario',
      'fecha',
    ]);
  });

  it('cuenta opciones con porcentaje y etiqueta', () => {
    const plan = porId('plan');
    expect(plan.total).toBe(3);
    expect(plan.conteos).toEqual([
      { valor: 'pro', etiqueta: 'Pro', conteo: 2, porcentaje: 66.7 },
      { valor: 'basico', etiqueta: 'Básico', conteo: 1, porcentaje: 33.3 },
    ]);
  });

  it('cuenta cada casilla seleccionada', () => {
    const extras = porId('extras');
    expect(extras.total).toBe(2);
    expect(extras.conteos).toEqual([
      { valor: 'soporte', etiqueta: 'Soporte', conteo: 2, porcentaje: 100 },
      { valor: 'training', etiqueta: 'Capacitación', conteo: 1, porcentaje: 50 },
    ]);
  });

  it('calcula promedio, mínimo y máximo de números', () => {
    const edad = porId('edad');
    expect(edad.promedio).toBe(30);
    expect(edad.minimo).toBe(20);
    expect(edad.maximo).toBe(40);
  });

  it('distribuye escala completa con promedio', () => {
    const s = porId('satisfaccion');
    expect(s.conteos?.map((c) => c.valor)).toEqual(['1', '2', '3', '4', '5']);
    expect(s.conteos?.find((c) => c.valor === '5')?.conteo).toBe(2);
    expect(s.promedio).toBe(4.67);
  });

  it('recoge textos no vacíos', () => {
    expect(porId('comentario').textos).toEqual(['Excelente', 'Bien']);
  });

  it('cuenta fechas repetidas', () => {
    expect(porId('fecha').conteos?.[0]).toMatchObject({ valor: '2026-09-01', conteo: 2 });
  });
});
