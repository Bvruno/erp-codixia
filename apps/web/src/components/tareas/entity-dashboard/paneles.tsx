'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { entitySlug, shortUid } from '@/lib/slugs';
import type { Task, TaskList as TaskListEntry, StatusDef, PriorityDef } from '@/types';
import { daysBetween, formatDate, isOverdue } from './utils';

// Paneles de presentación del dashboard (reciben datos ya calculados).

export function Bar({ value, color, label, count }: { value: number; color: string; label: string; count: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{count}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function StatsGrid({ stats }: { stats: { label: string; value: number; icon: React.ReactNode; color: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="p-4">
            <div className={cn('flex items-center gap-2', s.color)}>
              {s.icon}
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PanelDistribucion({
  statuses,
  priorities,
  byStatus,
  byPriority,
  total,
  weeklyDone,
  weeklyLabels,
}: {
  statuses: StatusDef[];
  priorities: PriorityDef[];
  byStatus: (s: string) => number;
  byPriority: (p: string) => number;
  total: number;
  weeklyDone: number[];
  weeklyLabels: string[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Por estado</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {statuses.map((s) => {
            const count = byStatus(s.key);
            return (
              <Bar
                key={s.key}
                label={s.label}
                count={count}
                color={s.color}
                value={total > 0 ? (count / total) * 100 : 0}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Por prioridad</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {priorities.map((p) => {
            const count = byPriority(p.key);
            return (
              <Bar
                key={p.key}
                label={p.label}
                count={count}
                color={p.color}
                value={total > 0 ? (count / total) * 100 : 0}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Velocidad · completadas por semana</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-24 items-end gap-1.5">
            {weeklyDone.map((count, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
                <div
                  className="w-full rounded-sm bg-success/80"
                  style={{ height: `${Math.max(4, (count / Math.max(1, ...weeklyDone)) * 80)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {weeklyLabels.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PanelProximas({ upcoming, todayStart }: { upcoming: Task[]; todayStart: Date }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Próximas a vencer</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {upcoming.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin tareas por vencer en el periodo</p>
        ) : (
          upcoming.map((t) => {
            const due = new Date(`${t.due_date}T${t.due_time || '00:00'}`);
            const days = Math.max(0, daysBetween(todayStart, due));
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-xs text-muted-foreground">{formatDate(t.due_date!)}</span>
                <Badge variant={days <= 2 ? 'destructive' : 'secondary'} className="text-xs">
                  {days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} d`}
                </Badge>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function PanelVencidasPorAsignado({ overdueTop }: { overdueTop: { id: string; count: number; name: string | null }[] }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Vencidas por asignado</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {overdueTop.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin vencidas en el periodo</p>
        ) : (
          overdueTop.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{a.name || 'Sin asignar'}</span>
              <span className="font-bold tabular-nums text-red-500">{a.count}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function PanelAntiguedad({
  agingCounts,
  total,
}: {
  agingCounts: { key: string; label: string; count: number }[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Antigüedad de pendientes</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {agingCounts.map((b) => (
          <Bar
            key={b.key}
            label={b.label}
            count={b.count}
            color={b.key === '16+' ? '#ef4444' : '#f59e0b'}
            value={
              b.count > 0 && total > 0
                ? (b.count / Math.max(1, agingCounts.reduce((acc, x) => acc + x.count, 0))) * 100
                : 0
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}

export function PanelesResumen({
  subtaskPct,
  childrenDone,
  childTasksCount,
  parentsCount,
  unassigned,
  plannedHoursRounded,
  periodLabel,
}: {
  subtaskPct: number;
  childrenDone: number;
  childTasksCount: number;
  parentsCount: number;
  unassigned: number;
  plannedHoursRounded: number;
  periodLabel: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Subtareas · avance</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{subtaskPct}%</p>
          <p className="text-xs text-muted-foreground">
            {childrenDone}/{childTasksCount} subtareas de {parentsCount} tareas padre
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Sin asignar</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{unassigned}</p>
          <p className="text-xs text-muted-foreground">tareas sin responsable en el periodo</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Horas de turno planeadas</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{plannedHoursRounded}h</p>
          <p className="text-xs text-muted-foreground">equipo · {periodLabel}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function PanelListas({
  scopeLists,
  scopeTasks,
  scopeType,
  dashboardWsSlug,
  folderSegmentOf,
  lists,
}: {
  scopeLists: TaskListEntry[];
  scopeTasks: Task[];
  scopeType: 'workspace' | 'folder';
  dashboardWsSlug: string;
  folderSegmentOf: (list: TaskListEntry) => string;
  lists: TaskListEntry[];
}) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3"><CardTitle className="text-sm">Listas</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {scopeLists.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin listas en esta {scopeType === 'workspace' ? 'carpeta' : 'área'}</p>
        ) : (
          scopeLists.map((l) => {
            const listTasks = scopeTasks.filter((t) => t.list_id === l.id);
            const listDone = listTasks.filter((t) => t.status === 'done').length;
            const pct = listTasks.length > 0 ? Math.round((listDone / listTasks.length) * 100) : 0;
            return (
              <Link
                key={l.id}
                href={`/proyectos/${dashboardWsSlug}/${folderSegmentOf(l)}/${entitySlug(l, lists)}`}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
              >
                <ListTodo className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm font-medium">{l.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {listDone}/{listTasks.length}
                </span>
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function PanelRecientes({
  recent,
  scopeLists,
  dashboardWsSlug,
  folderSegmentOf,
  lists,
  statuses,
}: {
  recent: Task[];
  scopeLists: TaskListEntry[];
  dashboardWsSlug: string;
  folderSegmentOf: (list: TaskListEntry) => string;
  lists: TaskListEntry[];
  statuses: StatusDef[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Tareas recientes</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin tareas</p>
        ) : (
          recent.map((t) => {
            const list = scopeLists.find((l) => l.id === t.list_id);
            return (
              <Link
                key={t.id}
                href={`/proyectos/${dashboardWsSlug}/${list ? folderSegmentOf(list) : 'raiz'}/${list ? entitySlug(list, lists) : ''}/tarea/${shortUid(t.id)}`}
                className="block rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
              >
                <p className="truncate text-sm">{t.title}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: statuses.find((s) => s.key === t.status)?.color ?? 'var(--muted-foreground)' }}
                  />
                  <span className="truncate">{list?.name || '—'}</span>
                  {t.due_date && (
                    <span className={cn(isOverdue(t.due_date) ? 'text-red-500' : '')}>
                      {formatDate(t.due_date)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function PanelAsignados({ assignedTop }: { assignedTop: { id: string; count: number; name: string | null }[] }) {
  if (assignedTop.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Tareas por asignado</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {assignedTop.map((a) => (
          <div key={a.id} className="rounded-md border px-3 py-2">
            <p className="text-base font-bold tabular-nums">{a.count}</p>
            <p className="truncate text-xs text-muted-foreground">{a.name || 'Colaborador'}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
