import { describe, expect, it } from 'vitest';
import {
  cuerpoRecordatorio,
  instanteEnZona,
  recordatorioPendiente,
} from './recordatorios';

describe('instanteEnZona', () => {
  it('convierte hora local de la zona a UTC', () => {
    // Lima (UTC-5 sin DST): 14:30 local = 19:30 UTC.
    expect(
      instanteEnZona('2026-09-18', '14:30', 'America/Lima').toISOString(),
    ).toBe('2026-09-18T19:30:00.000Z');
  });

  it('UTC se mantiene igual', () => {
    expect(
      instanteEnZona('2026-01-05', '09:00', 'UTC').toISOString(),
    ).toBe('2026-01-05T09:00:00.000Z');
  });

  it('soporta zonas con offset positivo', () => {
    // Madrid en septiembre (UTC+2): 08:15 local = 06:15 UTC.
    expect(
      instanteEnZona('2026-09-18', '08:15', 'Europe/Madrid').toISOString(),
    ).toBe('2026-09-18T06:15:00.000Z');
  });
});

describe('recordatorioPendiente', () => {
  const vence = new Date('2026-09-18T12:00:00.000Z');

  it('sin recordatorio no avisa', () => {
    expect(recordatorioPendiente(vence, vence, 'none')).toBe(false);
  });

  it('30m avisa dentro de la ventana', () => {
    expect(
      recordatorioPendiente(
        new Date('2026-09-18T11:31:00.000Z'),
        vence,
        '30m',
      ),
    ).toBe(true);
    expect(
      recordatorioPendiente(
        new Date('2026-09-18T11:29:00.000Z'),
        vence,
        '30m',
      ),
    ).toBe(false);
  });

  it('1d avisa desde 24h antes y no después del vencimiento', () => {
    expect(
      recordatorioPendiente(
        new Date('2026-09-17T12:01:00.000Z'),
        vence,
        '1d',
      ),
    ).toBe(true);
    expect(
      recordatorioPendiente(new Date('2026-09-18T12:00:00.000Z'), vence, '1d'),
    ).toBe(false);
  });
});

describe('cuerpoRecordatorio', () => {
  it('usa la hora y cae a 09:00 sin hora', () => {
    expect(cuerpoRecordatorio('2026-09-18', '14:30:00')).toBe(
      'Vence: 2026-09-18 14:30',
    );
    expect(cuerpoRecordatorio('2026-09-18', null)).toBe(
      'Vence: 2026-09-18 09:00',
    );
  });
});
