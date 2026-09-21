import { resolveStatuses, resolvePriorities } from '@/lib/task-config';
import type { StatusDef, PriorityDef, Shift } from '@/types';

// Tipos y helpers puros del dashboard de entidad.

export type Scope = { type: 'workspace'; id: string } | { type: 'folder'; id: string; wsId: string };

export type Period = '7' | '30' | 'all';

export function periodCutoff(period: Period): number {
  const days = period === '7' ? 7 : 30;
  return Date.now() - days * 86400000;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export function shiftDurationHours(shift: Shift): number {
  const toMin = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  };
  const dur = toMin(shift.end_time) - toMin(shift.start_time) + (shift.crosses_midnight ? 1440 : 0);
  let breakMin = 0;
  if (shift.break_start_time && shift.break_end_time) {
    const bs = toMin(shift.break_start_time);
    const be = toMin(shift.break_end_time);
    breakMin = be > bs ? be - bs : 1440 - bs + be;
  }
  return Math.max(0, dur - breakMin) / 60;
}

export function resolveDefaults(statuses: StatusDef[] | null | undefined): StatusDef[] {
  return resolveStatuses(statuses);
}

export function resolveDefaultsPriorities(priorities: PriorityDef[] | null | undefined): PriorityDef[] {
  return resolvePriorities(priorities);
}

export function formatDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function isOverdue(value: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value}T00:00:00`) < today;
}
