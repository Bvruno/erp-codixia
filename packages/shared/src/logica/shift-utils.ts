import type { CSSProperties } from "react";

export const DEFAULT_SHIFT_COLOR = "#3b82f6";

export interface ShiftLike {
  start_time: string;
  end_time: string;
  crosses_midnight?: boolean;
  color?: string;
  break_start_time?: string | null;
  break_end_time?: string | null;
}

export function normalizeTime(t: string): string {
  return t.length > 5 ? t.slice(0, 5) : t;
}

export function minutesOf(time: string | null | undefined): number {
  if (!time) return -1;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return -1;
  return h * 60 + (m || 0);
}

export function isOvernightShift(shift: ShiftLike): boolean {
  if (typeof shift.crosses_midnight === "boolean")
    return shift.crosses_midnight;
  return normalizeTime(shift.start_time) >= normalizeTime(shift.end_time);
}

export function hasBreak(shift: ShiftLike): boolean {
  return (
    !!shift.break_start_time &&
    !!shift.break_end_time &&
    shift.break_start_time !== shift.break_end_time
  );
}

// Duración del descanso en minutos (0 si no hay descanso válido).
// Soporta descansos que cruzan medianoche dentro de turnos nocturnos.
export function breakDurationMinutes(shift: ShiftLike): number {
  if (!hasBreak(shift)) return 0;
  const start = minutesOf(shift.break_start_time);
  const end = minutesOf(shift.break_end_time);
  if (start === -1 || end === -1) return 0;
  return end > start ? end - start : 1440 - start + end;
}

// El descanso debe caer dentro del rango del turno (con wrap de medianoche).
export function breakWithinShift(shift: ShiftLike): boolean {
  if (!hasBreak(shift)) return true;
  const ss = minutesOf(shift.start_time);
  const se = minutesOf(shift.end_time);
  const bs = minutesOf(shift.break_start_time);
  const be = minutesOf(shift.break_end_time);
  if (ss === -1 || se === -1 || bs === -1 || be === -1) return false;
  const breakLen = breakDurationMinutes(shift);
  const shiftLen = se > ss ? se - ss : 1440 - ss + se;
  if (breakLen > shiftLen) return false;
  const offset = (((bs - ss) % 1440) + 1440) % 1440;
  return offset + breakLen <= shiftLen;
}

// Un turno se modela como segmentos en minutos [0, 1440).
// Un turno nocturno (ej. 20:00-02:00) son dos segmentos: [1200, 1440) y [0, 120).
export function shiftSegments(shift: ShiftLike): [number, number][] {
  const start = minutesOf(shift.start_time);
  const end = minutesOf(shift.end_time);
  if (start === -1 || end === -1) return [];
  if (!isOvernightShift(shift)) {
    return end === 0 ? [[start, 1440]] : [[start, end]];
  }
  const segs: [number, number][] = [];
  if (start < 1440) segs.push([start, 1440]);
  if (end > 0) segs.push([0, end]);
  return segs;
}

// Segmentos en "minutos de jornada corrida" [0, 1440): el turno
// nocturno pertenece al mismo día y extiende la jornada:
// 20:00-02:00 → [1200, 1440) + [1440, 1560).
// La jornada arranca en el turno más temprano del día.
export function shiftDaySegments(shift: ShiftLike): [number, number][] {
  const start = minutesOf(shift.start_time);
  const end = minutesOf(shift.end_time);
  if (start === -1 || end === -1) return [];
  if (!isOvernightShift(shift)) {
    return end === 0 ? [[start, 1440]] : [[start, end]];
  }
  return [
    [start, 1440],
    [1440, 1440 + end],
  ];
}

export function segmentsOverlap(a: ShiftLike, b: ShiftLike): boolean {
  const aSegs = shiftSegments(a);
  const bSegs = shiftSegments(b);
  return aSegs.some(([as, ae]) => bSegs.some(([bs, be]) => as < be && bs < ae));
}

export function shiftCardStyle(color?: string): CSSProperties {
  const c = color || DEFAULT_SHIFT_COLOR;
  return { backgroundColor: `${c}22`, borderColor: `${c}55` };
}

export function shiftBandStyle(color?: string): CSSProperties {
  return { backgroundColor: `${color || DEFAULT_SHIFT_COLOR}0A` };
}

export function shiftTextStyle(color?: string): CSSProperties {
  return { color: color || DEFAULT_SHIFT_COLOR };
}

export function generateTimeSlots(
  shifts: ShiftLike[],
  minHourOverride?: number,
): string[] {
  const segs = shifts.flatMap((s) => shiftDaySegments(s));

  const minM = segs.length
    ? Math.min(
        ...segs.map((s) => s[0]),
        minHourOverride ? minHourOverride * 60 : Infinity,
      )
    : (minHourOverride ?? 0) * 60;
  const maxM = segs.length ? Math.max(...segs.map((s) => s[1])) : 1440;

  // Alineación exacta a 30 min: un turno 08:30-14:30 genera
  // slots desde 08:30 hasta 14:30, sin media hora de sobra.
  const startSlotMin = Math.floor(minM / 30) * 30;
  const endSlotMin = Math.ceil(maxM / 30) * 30;

  const slots: string[] = [];
  for (let m = startSlotMin; m < endSlotMin; m += 30) {
    slots.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  }
  return slots;
}
