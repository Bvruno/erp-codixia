import type { TimeEntryType } from '@/types';

export interface HoursEntry {
  user_id: string;
  date: string;
  hours: number;
  type: TimeEntryType;
}

export interface PermissionRow {
  user_id: string;
  date: string;
  estimated_hours: number;
  makeup_date: string | null;
  status: "pending" | "approved" | "rejected";
}

export interface HoursSummary {
  worked: number;
  overtime: number;
  makeup: number;
  exempt: number;
  pendingMakeup: boolean;
  pendingMakeupHours: number;
  owed: number;
}

export function inRange(date: string, start: Date, end: Date): boolean {
  const d = new Date(date + "T00:00:00");
  return d >= start && d <= end;
}

export function sumByType(
  entries: HoursEntry[],
  userId: string,
  type: TimeEntryType,
  start: Date,
  end: Date,
): number {
  return entries
    .filter(
      (e) =>
        e.user_id === userId && e.type === type && inRange(e.date, start, end),
    )
    .reduce((sum, e) => sum + e.hours, 0);
}

// Total de horas registradas en una fecha exacta ('yyyy-MM-dd'),
// sin filtrar por usuario ni tipo.
export function dayHours(entries: HoursEntry[], date: string): number {
  return entries
    .filter((e) => e.date === date)
    .reduce((sum, e) => sum + e.hours, 0);
}

// Permiso aprobado exime su deuda salvo que tenga fecha de
// recuperación y no existan horas de tipo `makeup` registradas
// desde esa fecha (dentro del conjunto de entradas provisto).
function coveredByMakeup(
  makeupDate: string,
  entries: HoursEntry[],
  userId: string,
): boolean {
  return entries.some(
    (e) => e.user_id === userId && e.type === "makeup" && e.date >= makeupDate,
  );
}

export function computeHours({
  entries,
  permissions,
  userId,
  start,
  end,
  target,
}: {
  entries: HoursEntry[];
  permissions: PermissionRow[];
  userId: string;
  start: Date;
  end: Date;
  target: number;
}): HoursSummary {
  const worked = sumByType(entries, userId, "worked", start, end);
  const overtime = sumByType(entries, userId, "overtime", start, end);
  const makeup = sumByType(entries, userId, "makeup", start, end);

  let exempt = 0;
  let pendingMakeup = false;
  let pendingMakeupHours = 0;

  permissions
    .filter(
      (p) =>
        p.user_id === userId &&
        p.status === "approved" &&
        inRange(p.date, start, end),
    )
    .forEach((p) => {
      if (!p.makeup_date) {
        exempt += p.estimated_hours;
      } else if (coveredByMakeup(p.makeup_date, entries, userId)) {
        exempt += p.estimated_hours;
      } else {
        pendingMakeup = true;
        pendingMakeupHours += p.estimated_hours;
      }
    });

  const owed = Math.max(0, target - worked - exempt);

  return {
    worked,
    overtime,
    makeup,
    exempt,
    pendingMakeup,
    pendingMakeupHours,
    owed,
  };
}
