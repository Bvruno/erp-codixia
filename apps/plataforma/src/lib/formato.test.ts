import { describe, expect, it } from 'vitest';
import { formatearDinero, formatearFecha, hace, periodoActual } from './formato';

describe('formato', () => {
  it('formatea fechas nulas', () => {
    expect(formatearFecha(null)).toBe('—');
    expect(formatearFecha('no-es-fecha')).toBe('—');
  });

  it('formatea fechas válidas', () => {
    expect(formatearFecha('2026-09-21T12:00:00Z')).not.toBe('—');
  });

  it('formatea dinero', () => {
    expect(formatearDinero(49)).toContain('49');
  });

  it('describe tiempo relativo', () => {
    expect(hace(null)).toBe('—');
    expect(hace(new Date().toISOString())).toBe('ahora');
  });

  it('periodo actual en formato AAAA-MM', () => {
    expect(periodoActual()).toMatch(/^\d{4}-\d{2}$/);
  });
});
