import type { ReminderBefore } from '@erp/shared';

// Cálculo puro de recordatorios de vencimiento (sin BD ni red).

export const DESPLAZAMIENTO_RECORDATORIO: Record<
  Exclude<ReminderBefore, 'none'>,
  number
> = {
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

// Instante UTC para una fecha/hora local ("YYYY-MM-DD", "HH:mm") en una zona
// IANA. Doble pasada para resolver el offset (incluye cambios de DST).
export function instanteEnZona(fecha: string, hora: string, zona: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  const base = Date.UTC(y, m - 1, d, h, min, 0, 0);
  const formato = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  let intento = base;
  for (let i = 0; i < 2; i++) {
    const partes: Record<string, string> = {};
    for (const p of formato.formatToParts(new Date(intento))) {
      partes[p.type] = p.value;
    }
    const comoUtc = Date.UTC(
      Number(partes.year),
      Number(partes.month) - 1,
      Number(partes.day),
      Number(partes.hour === '24' ? '00' : partes.hour),
      Number(partes.minute),
      Number(partes.second ?? '00'),
    );
    const offset = comoUtc - intento;
    intento = base - offset;
  }
  return new Date(intento);
}

// ¿Toca avisar ahora? Ventana [vence - offset, vence).
export function recordatorioPendiente(
  ahora: Date,
  vence: Date,
  recordatorio: ReminderBefore,
): boolean {
  if (recordatorio === 'none') return false;
  const offset = DESPLAZAMIENTO_RECORDATORIO[recordatorio];
  const t = ahora.getTime();
  return t >= vence.getTime() - offset && t < vence.getTime();
}

// Cuerpo estable para deduplicar (si cambia el vencimiento, se vuelve a avisar).
export function cuerpoRecordatorio(
  fecha: string,
  hora: string | null | undefined,
): string {
  return `Vence: ${fecha} ${(hora ?? '09:00').slice(0, 5)}`;
}
