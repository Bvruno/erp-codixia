import { describe, it, expect } from 'vitest';
import {
  todoCycleBounds,
  tzOffsetMinutes,
  isDone,
  pctDone,
  resetLabel,
  daysUntil,
  cycleTitle,
  frequencyLabel,
  isDayActive,
  weekDaysLabel,
  parseTimeMinutes,
} from '@/lib/todo-config';

const NOW = new Date('2026-08-21T15:00:00Z'); // viernes

describe('tzOffsetMinutes', () => {
  it('UTC sin offset', () => {
    expect(tzOffsetMinutes(NOW, 'UTC')).toBe(0);
  });

  it('Buenos Aires -3', () => {
    expect(tzOffsetMinutes(NOW, 'America/Argentina/Buenos_Aires')).toBe(-180);
  });
});

describe('todoCycleBounds', () => {
  it('daily: empieza hoy a medianoche', () => {
    const { start, end } = todoCycleBounds('daily', null, NOW, 'UTC');
    expect(start.toISOString()).toBe('2026-08-21T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-22T00:00:00.000Z');
  });

  it('shift: igual que daily', () => {
    const { start, end } = todoCycleBounds('shift', null, NOW, 'UTC');
    expect(start.toISOString()).toBe('2026-08-21T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-22T00:00:00.000Z');
  });

  it('weekly: semana desde lunes', () => {
    const { start, end } = todoCycleBounds('weekly', null, NOW, 'UTC', 1);
    expect(start.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('weekly: semana desde domingo', () => {
    const { start, end } = todoCycleBounds('weekly', null, NOW, 'UTC', 0);
    expect(start.toISOString()).toBe('2026-08-16T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-23T00:00:00.000Z');
  });

  it('interval: ventana de N días desde 2000-01-01', () => {
    const days = 3;
    const { start, end } = todoCycleBounds('interval', days, NOW, 'UTC');
    const epoch = Date.UTC(2000, 0, 1);
    const dayStart = Date.UTC(2026, 7, 21);
    const offset = ((Math.floor((dayStart - epoch) / 86400000) % days) + days) % days;
    expect(start.getTime()).toBe(dayStart - offset * 86400000);
    expect(end.getTime() - start.getTime()).toBe(days * 86400000);
    expect(start.getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(NOW.getTime()).toBeLessThan(end.getTime());
  });

  it('daily respeta timezone no-UTC', () => {
    const { start, end } = todoCycleBounds('daily', null, NOW, 'America/Argentina/Buenos_Aires');
    expect(start.toISOString()).toBe('2026-08-21T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-22T03:00:00.000Z');
  });
});

describe('progreso', () => {
  it('isDone al alcanzar target', () => {
    expect(isDone(5, 5)).toBe(true);
    expect(isDone(4, 5)).toBe(false);
  });

  it('pctDone hace clamp a 100', () => {
    expect(pctDone(3, 10)).toBe(30);
    expect(pctDone(12, 10)).toBe(100);
    expect(pctDone(0, 10)).toBe(0);
  });
});

describe('resetLabel', () => {
  it('hoy / mañana / días / semanas', () => {
    expect(resetLabel(new Date('2026-08-21T00:00:00Z'), NOW, 'UTC')).toBe('se reinicia hoy');
    expect(resetLabel(new Date('2026-08-22T00:00:00Z'), NOW, 'UTC')).toBe('se reinicia mañana');
    expect(resetLabel(new Date('2026-08-24T00:00:00Z'), NOW, 'UTC')).toBe('se reinicia en 3 días');
    expect(resetLabel(new Date('2026-08-30T00:00:00Z'), NOW, 'UTC')).toBe('se reinicia en 9 días');
  });

  it('intervalos largos muestran días exactos hasta 13', () => {
    expect(resetLabel(new Date('2026-08-31T00:00:00Z'), NOW, 'UTC')).toBe('se reinicia en 10 días');
  });

  it('a partir de 14 días muestra semanas', () => {
    expect(resetLabel(new Date('2026-09-04T00:00:00Z'), NOW, 'UTC')).toBe('se reinicia en 2 semanas');
  });

  it('daysUntil cuenta días calendario', () => {
    expect(daysUntil(new Date('2026-08-23T00:00:00Z'), NOW, 'UTC')).toBe(2);
  });
});

describe('cycleTitle', () => {
  it('daily en día actual es Hoy', () => {
    const bounds = todoCycleBounds('daily', null, NOW, 'UTC');
    expect(cycleTitle('daily', bounds, NOW, 'UTC')).toBe('Hoy');
  });

  it('weekly es Esta semana', () => {
    const bounds = todoCycleBounds('weekly', null, NOW, 'UTC');
    expect(cycleTitle('weekly', bounds, NOW, 'UTC')).toBe('Esta semana');
  });
});

describe('frequencyLabel', () => {
  it('labels de frecuencia', () => {
    expect(frequencyLabel('daily')).toBe('Diario');
    expect(frequencyLabel('weekly')).toBe('Semanal');
    // shift es legacy: se muestra como Diario (comportamiento idéntico)
    expect(frequencyLabel('shift')).toBe('Diario');
    expect(frequencyLabel('interval', 5)).toBe('Cada 5 días');
    expect(frequencyLabel('interval', null)).toBe('Cada N días');
  });
});

describe('hora límite', () => {
  it('cycle end con due_time en daily', () => {
    const { start, end } = todoCycleBounds('daily', null, NOW, 'UTC', 1, '14:00');
    expect(start.toISOString()).toBe('2026-08-21T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-21T14:00:00.000Z');
  });

  it('sin due_time el ciclo termina al día siguiente', () => {
    const { end } = todoCycleBounds('daily', null, NOW, 'UTC', 1, null);
    expect(end.toISOString()).toBe('2026-08-22T00:00:00.000Z');
  });

  it('weekly ignora la hora', () => {
    const { start, end } = todoCycleBounds('weekly', null, NOW, 'UTC', 1, '14:00');
    expect(start.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('due_time=00:00 no produce ciclo de duración cero', () => {
    const { start, end } = todoCycleBounds('daily', null, NOW, 'UTC', 1, '00:00');
    expect(start.toISOString()).toBe('2026-08-21T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-22T00:00:00.000Z');
  });

  it('parseTimeMinutes valida formato', () => {
    expect(parseTimeMinutes('14:00')).toBe(840);
    expect(parseTimeMinutes('00:30')).toBe(30);
    expect(parseTimeMinutes('25:00')).toBeNull();
    expect(parseTimeMinutes(null)).toBeNull();
  });
});

describe('días de la semana', () => {
  it('isDayActive con días seleccionados', () => {
    // 2026-08-21 es viernes (5)
    expect(isDayActive([1, 3, 5], NOW, 'UTC')).toBe(true);
    expect(isDayActive([1, 2], NOW, 'UTC')).toBe(false);
    expect(isDayActive(null, NOW, 'UTC')).toBe(true);
    expect(isDayActive([], NOW, 'UTC')).toBe(true);
  });

  it('weekDaysLabel corto y largo', () => {
    expect(weekDaysLabel([1, 3, 5])).toBe('L·X·V');
    expect(weekDaysLabel([0, 6], false)).toBe('Domingo·Sábado');
    expect(weekDaysLabel(null)).toBe('');
  });
});