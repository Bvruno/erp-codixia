import type { TodoFrequency } from '@/types';

export const FREQUENCY_LABELS: Record<TodoFrequency, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  // 'shift' es legacy: su comportamiento siempre fue idéntico a daily.
  shift: 'Diario',
  interval: 'Cada N días',
};

export function frequencyLabel(frequency: TodoFrequency, intervalDays?: number | null): string {
  if (frequency === 'interval') {
    return intervalDays && intervalDays > 0 ? `Cada ${intervalDays} días` : 'Cada N días';
  }
  return FREQUENCY_LABELS[frequency];
}

export interface CycleBounds {
  start: Date;
  end: Date;
}

type WeekStart = 0 | 1;

export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour % 24,
    map.minute,
    map.second
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

export function localDateParts(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  return { y: map.year, m: map.month, d: map.day };
}

function localDateToUTC(y: number, m: number, d: number, offsetMin: number): number {
  return Date.UTC(y, m - 1, d) - offsetMin * 60000;
}

export function todoCycleBounds(
  frequency: TodoFrequency,
  intervalDays: number | null,
  now: Date,
  timeZone: string,
  weekStart: WeekStart = 1,
  dueTime?: string | null
): CycleBounds {
  const offset = tzOffsetMinutes(now, timeZone);
  const { y, m, d } = localDateParts(now, timeZone);
  const dayStart = localDateToUTC(y, m, d, offset);

  if (frequency === 'weekly') {
    const jsDay = new Date(dayStart).getUTCDay();
    const monday = dayStart - ((jsDay + 6) % 7) * 86400000;
    const start = monday + (weekStart === 0 ? -86400000 : 0);
    return { start: new Date(start), end: new Date(start + 7 * 86400000) };
  }

  if (frequency === 'interval') {
    const days = intervalDays && intervalDays > 0 ? intervalDays : 7;
    const epoch = Date.UTC(2000, 0, 1);
    const daysSinceEpoch = Math.floor((dayStart - epoch) / 86400000);
    const offsetDays = ((daysSinceEpoch % days) + days) % days;
    const start = dayStart - offsetDays * 86400000;
    return { start: new Date(start), end: new Date(start + days * 86400000) };
  }

  const timeMinutes = parseTimeMinutes(dueTime);
  let end =
    timeMinutes !== null
      ? dayStart + timeMinutes * 60000
      : dayStart + 86400000;
  // due_time=00:00 (o equivalente) produce un ciclo de duración
  // cero: extender al día completo para no dejar el item vencido
  // de forma perpetua.
  if (end <= dayStart) {
    end = dayStart + 86400000;
  }
  return { start: new Date(dayStart), end: new Date(end) };
}

export function parseTimeMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export const WEEKDAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function isDayActive(days: number[] | null | undefined, date: Date, timeZone: string): boolean {
  if (!days || days.length === 0) return true;
  return days.includes(getLocalDay(date, timeZone));
}

function getLocalDay(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const parts = dtf.formatToParts(date);
  const wd = parts.find((p) => p.type === 'weekday')?.value.toLowerCase();
  const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return wd ? (map[wd] ?? -1) : -1;
}

export function weekDaysLabel(days: number[] | null | undefined, short = true): string {
  if (!days || days.length === 0) return '';
  const names = short ? WEEKDAY_LETTERS : WEEKDAY_NAMES;
  return days
    .filter((d) => d >= 0 && d <= 6)
    .map((d) => names[d])
    .join('·');
}

export function isInCycle(bounds: CycleBounds, now: Date): boolean {
  return now.getTime() >= bounds.start.getTime() && now.getTime() < bounds.end.getTime();
}

export function isDone(quantityDone: number, target: number): boolean {
  return quantityDone >= target;
}

export function pctDone(quantityDone: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, quantityDone) / target) * 100));
}

const DAY_MS = 86400000;

export function daysUntil(end: Date, now: Date, timeZone: string): number {
  const { y: ey, m: em, d: ed } = localDateParts(end, timeZone);
  const { y: ny, m: nm, d: nd } = localDateParts(now, timeZone);
  const endLocal = Date.UTC(ey, em - 1, ed);
  const nowLocal = Date.UTC(ny, nm - 1, nd);
  return Math.round((endLocal - nowLocal) / DAY_MS);
}

export function resetLabel(end: Date, now: Date, timeZone: string): string {
  const days = daysUntil(end, now, timeZone);
  if (days <= 0) return 'se reinicia hoy';
  if (days === 1) return 'se reinicia mañana';
  if (days < 14) return `se reinicia en ${days} días`;
  const weeks = Math.round(days / 7);
  return `se reinicia en ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
}

export function cycleTitle(
  frequency: TodoFrequency,
  bounds: CycleBounds,
  now: Date,
  timeZone: string
): string {
  if (frequency === 'daily' || frequency === 'shift') {
    const today = localDateParts(now, timeZone);
    const startLocal = localDateParts(bounds.start, timeZone);
    const sameDay = today.y === startLocal.y && today.m === startLocal.m && today.d === startLocal.d;
    return sameDay ? 'Hoy' : 'Ciclo';
  }
  if (frequency === 'weekly') return 'Esta semana';
  return 'Esta tanda';
}

