import type { Schedule, Shift } from "@/types";
import {
  type ShiftLike,
  breakDurationMinutes,
  minutesOf,
  segmentsOverlap,
} from "./shift-utils";

export const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export const DAY_SHORT_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function hasSchedule(schedules: Schedule[], userId: string): boolean {
  return schedules.some((s) => s.user_id === userId);
}

export function daysWithSchedule(
  schedules: Schedule[],
  userId: string,
): number[] {
  return schedules
    .filter((s) => s.user_id === userId)
    .map((s) => s.day_of_week)
    .sort((a, b) => a - b);
}

// Duración efectiva del turno en horas (turnos nocturnos incluidos),
// restando el descanso si está definido.
export function shiftDurationHours(shift: ShiftLike): number {
  const start = minutesOf(shift.start_time);
  const end = minutesOf(shift.end_time);
  if (start === -1 || end === -1) return 0;
  const minutes = start < end ? end - start : 1440 - start + end;
  const effective = Math.max(0, minutes - breakDurationMinutes(shift));
  return Math.round((effective / 60) * 100) / 100;
}

// Horas semanales totales según los turnos asignados.
export function weeklyHoursFromSchedules(
  schedules: Schedule[],
  userId: string,
): number {
  return schedules
    .filter((s) => s.user_id === userId)
    .reduce((sum, s) => sum + (s.shift ? shiftDurationHours(s.shift) : 0), 0);
}

// Un turno propuesto para un usuario choca con otro turno del mismo día.
export function scheduleConflictsWith(
  schedules: Schedule[],
  userId: string,
  dayOfWeek: number,
  shift: ShiftLike,
): Shift | null {
  const existing = schedules.find(
    (s) => s.user_id === userId && s.day_of_week === dayOfWeek && s.shift,
  );
  if (!existing?.shift) return null;
  return segmentsOverlap(existing.shift, shift) ? existing.shift : null;
}