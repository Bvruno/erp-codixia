import type { PriorityDef, StatusDef } from '@/types';

export const DEFAULT_STATUSES: StatusDef[] = [
  { key: 'backlog', label: 'Backlog', color: '#6b7280' },
  { key: 'todo', label: 'Pendiente', color: '#3b82f6' },
  { key: 'in_progress', label: 'En Progreso', color: '#eab308' },
  { key: 'review', label: 'Revisión', color: '#a855f7' },
  { key: 'done', label: 'Completado', color: '#10b981', hidden_by_default: true },
  { key: 'cancelled', label: 'Cancelado', color: '#ef4444', hidden_by_default: true },
];

export const DEFAULT_PRIORITIES: PriorityDef[] = [
  { key: 'low', label: 'Baja', color: '#6b7280' },
  { key: 'medium', label: 'Media', color: '#eab308' },
  { key: 'high', label: 'Alta', color: '#f97316' },
  { key: 'urgent', label: 'Urgente', color: '#ef4444' },
];

export function resolveStatuses(statuses?: StatusDef[] | null): StatusDef[] {
  if (Array.isArray(statuses) && statuses.length > 0) return statuses;
  return DEFAULT_STATUSES;
}

export function resolvePriorities(priorities?: PriorityDef[] | null): PriorityDef[] {
  if (Array.isArray(priorities) && priorities.length > 0) return priorities;
  return DEFAULT_PRIORITIES;
}

export function statusMap(defs: StatusDef[]): Map<string, StatusDef> {
  return new Map(defs.map((d) => [d.key, d]));
}

export function priorityMap(defs: PriorityDef[]): Map<string, PriorityDef> {
  return new Map(defs.map((d) => [d.key, d]));
}

export function statusLabel(defs: StatusDef[], key: string): string {
  return defs.find((d) => d.key === key)?.label ?? key;
}

export function priorityLabel(defs: PriorityDef[], key: string): string {
  return defs.find((d) => d.key === key)?.label ?? key;
}

export function hiddenStatuses(defs: StatusDef[]): Set<string> {
  return new Set(defs.filter((d) => d.hidden_by_default).map((d) => d.key));
}

export function statusStyle(color: string) {
  return {
    backgroundColor: `${color}1A`,
    color,
    borderColor: `${color}40`,
  };
}

export function dotStyle(color: string) {
  return { backgroundColor: color };
}

export function unionConfig(
  lists: { statuses?: StatusDef[] | null; priorities?: PriorityDef[] | null }[]
): { statuses: StatusDef[]; priorities: PriorityDef[] } {
  const statuses: StatusDef[] = [];
  const statusSeen = new Set<string>();
  lists.forEach((l) => {
    resolveStatuses(l.statuses).forEach((s) => {
      if (!statusSeen.has(s.key)) {
        statusSeen.add(s.key);
        statuses.push(s);
      }
    });
  });
  const priorities: PriorityDef[] = [];
  const prioritySeen = new Set<string>();
  lists.forEach((l) => {
    resolvePriorities(l.priorities).forEach((p) => {
      if (!prioritySeen.has(p.key)) {
        prioritySeen.add(p.key);
        priorities.push(p);
      }
    });
  });
  if (statuses.length === 0) statuses.push(...DEFAULT_STATUSES);
  if (priorities.length === 0) priorities.push(...DEFAULT_PRIORITIES);
  return { statuses, priorities };
}
