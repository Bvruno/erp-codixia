import { describe, expect, it } from 'vitest';
import { formatearHora, formatearHoraDesdeFecha } from './formato-hora';

describe('formatearHora', () => {
  it('formatea en 24h con padding', () => {
    expect(formatearHora('9:05', '24h')).toBe('09:05');
    expect(formatearHora('14:30', '24h')).toBe('14:30');
    expect(formatearHora('00:00', '24h')).toBe('00:00');
  });

  it('formatea en 12h con AM/PM', () => {
    expect(formatearHora('14:30', '12h')).toBe('2:30 PM');
    expect(formatearHora('09:05', '12h')).toBe('9:05 AM');
    expect(formatearHora('00:15', '12h')).toBe('12:15 AM');
    expect(formatearHora('12:00', '12h')).toBe('12:00 PM');
  });

  it('ignora los segundos', () => {
    expect(formatearHora('22:45:30', '24h')).toBe('22:45');
    expect(formatearHora('22:45:30', '12h')).toBe('10:45 PM');
  });

  it('devuelve vacío para valores nulos y tal cual los inválidos', () => {
    expect(formatearHora(null, '24h')).toBe('');
    expect(formatearHora(undefined, '12h')).toBe('');
    expect(formatearHora('sin-hora', '24h')).toBe('sin-hora');
  });

  it('formatea desde Date', () => {
    const fecha = new Date(2026, 0, 5, 15, 7);
    expect(formatearHoraDesdeFecha(fecha, '24h')).toBe('15:07');
    expect(formatearHoraDesdeFecha(fecha, '12h')).toBe('3:07 PM');
  });
});
