'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/cliente';
import { TTL_CACHE } from '@/lib/cache-claves';
import { entitySlug, findEntityByParam } from '@/lib/slugs';
import { Badge } from '@/components/ui/badge';
import { ListTodo, CheckCircle2, Clock, AlertCircle, Layers, CalendarClock, Settings2 } from 'lucide-react';
import { unionConfig } from '@/lib/task-config';
import { StatusConfigDialog } from '@/components/tareas/status-config-dialog';
import { AccionEntidad } from '@/components/entidad/accion-entidad';
import { CabeceraEntidad } from '@/components/entidad/cabecera-entidad';
import { EntidadPagina } from '@/components/entidad/entidad-pagina';
import { EsqueletoEntidad } from '@/components/entidad/estado-entidad';
import { useTareas } from '@/components/tareas/tareas-context';
import { ShareButton } from '@/components/tareas/share-entity-dialog';
import type { Task, TaskList as TaskListEntry, Profile, Shift, Schedule } from '@/types';
import {
  daysBetween,
  isOverdue,
  periodCutoff,
  resolveDefaults,
  resolveDefaultsPriorities,
  shiftDurationHours,
  type Period,
  type Scope,
} from './utils';
import {
  PanelAntiguedad,
  PanelesResumen,
  PanelAsignados,
  PanelDistribucion,
  PanelListas,
  PanelProximas,
  PanelRecientes,
  PanelVencidasPorAsignado,
  StatsGrid,
} from './paneles';

export function EntityDashboard({ scope }: { scope: Scope }) {
  const ctx = useTareas();
  const canManageWs = scope.type === 'workspace' ? ctx.canManageEntity('workspace', scope.id) : false;
  const workspaces = ctx.workspaces;
  const folders = ctx.folders;
  const lists = ctx.lists;
  const collaborators = ctx.collaborators as Profile[];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [period, setPeriod] = useState<Period>('30');
  const [nowTs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const scopeKey = `${scope.type}:${scope.id}`;
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', scopeKey, ctx.organizationId],
    queryFn: async () => {
      const orgId = ctx.organizationId;
      if (!orgId) return null;

      const [tasksRes, shiftsRes, schedRes] = await Promise.all([
        apiFetch<{ tasks: Task[] }>(
          `/tareas?organization_id=${encodeURIComponent(orgId)}&limit=500`
        ).catch(() => null),
        apiFetch<{ shifts: Shift[] }>(
          `/horarios/shifts?organization_id=${encodeURIComponent(orgId)}`
        ).catch(() => null),
        apiFetch<{ schedules: { user_id: string; shift_id: string; day_of_week: number }[]; owner_id: string | null }>(
          `/horarios/asignables?organization_id=${encodeURIComponent(orgId)}`
        ).catch(() => null),
      ]);

      const loadedWs = ctx.workspaces;
      const loadedFolders = ctx.folders;
      const loadedTasks = (tasksRes?.tasks ?? []) as unknown as Task[];

      if (scope.type === 'workspace') {
        const ws = findEntityByParam(scope.id, loadedWs);
        if (!ws) return { notFound: true, tasks: [], shifts: [], schedules: [] };
      } else {
        const folder = findEntityByParam(scope.id, loadedFolders);
        if (!folder) return { notFound: true, tasks: [], shifts: [], schedules: [] };
      }

      return {
        notFound: false,
        tasks: loadedTasks,
        shifts: shiftsRes?.shifts ?? [],
        schedules: (schedRes?.schedules ?? []) as unknown as Schedule[],
      };
    },
    enabled: !!ctx.organizationId,
    // El realtime de tareas (tareas-context) invalida esta key ante cambios;
    // además, red de seguridad con datos frescos al entrar.
    staleTime: TTL_CACHE.estructura,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    if (!dashboardQuery.data) return;
    setTasks(dashboardQuery.data.tasks);
    setShifts(dashboardQuery.data.shifts);
    setSchedules(dashboardQuery.data.schedules);
    setNotFound(dashboardQuery.data.notFound);
    setLoading(false);
  }, [dashboardQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return <EsqueletoEntidad variante="tablero" />;
  }

  const workspace = scope.type === 'workspace'
    ? findEntityByParam(scope.id, workspaces) || null
    : findEntityByParam(scope.wsId, workspaces) || null;

  const folder = scope.type === 'folder'
    ? findEntityByParam(scope.id, folders) || null
    : null;

  const wsForSlug =
    scope.type === 'workspace'
      ? workspace
      : findEntityByParam(scope.wsId, workspaces) || null;
  const dashboardWsSlug = wsForSlug ? entitySlug(wsForSlug, workspaces) : '';

  if (notFound || !workspace || (scope.type === 'folder' && !folder)) {
    return (
      <div className="space-y-4">
        <Link href="/proyectos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          ← Volver a Proyectos
        </Link>
        <p className="text-muted-foreground">No encontrado</p>
      </div>
    );
  }

  const scopeFolders = scope.type === 'workspace'
    ? folders.filter((f) => f.workspace_id === workspace!.id)
    : [folder!];

  const scopeLists = scope.type === 'workspace'
    ? lists.filter((l) => l.workspace_id === workspace!.id)
    : lists.filter((l) => l.folder_id === folder!.id);
  const scopeTaskIds = new Set(scopeLists.map((l) => l.id));
  const scopeTasks = tasks.filter((t) => t.list_id && scopeTaskIds.has(t.list_id));
  const periodCutoffMs = periodCutoff(period);
  const periodTasks =
    period === 'all'
      ? scopeTasks
      : scopeTasks.filter((t) => new Date(t.created_at).getTime() >= periodCutoffMs);
  const { statuses, priorities } = unionConfig(scopeLists);

  const folderSegmentOf = (list: TaskListEntry) => {
    if (!list.folder_id) return 'raiz';
    const f = folders.find((x) => x.id === list.folder_id);
    return f ? entitySlug(f, folders) : 'raiz';
  };

  const byStatus = (s: string) => periodTasks.filter((t) => t.status === s).length;
  const byPriority = (p: string) => periodTasks.filter((t) => t.priority === p).length;
  const total = periodTasks.length;
  const done = byStatus('done');
  const inProgress = byStatus('in_progress');
  const pending = byStatus('todo');
  const subTasks = periodTasks.filter((t) => t.parent_task_id).length;
  const overdueTasks = periodTasks.filter(
    (t) =>
      t.due_date &&
      isOverdue(t.due_date) &&
      t.status !== 'done' &&
      t.status !== 'cancelled'
  );
  const overdue = overdueTasks.length;
  const completion = total > 0 ? Math.round((done / total) * 100) : 0;

  // 1. Próximas a vencer (dentro del periodo)
  const todayStart = new Date(nowTs);
  todayStart.setHours(0, 0, 0, 0);
  const upcoming = periodTasks
    .filter(
      (t) =>
        t.due_date &&
        !isOverdue(t.due_date) &&
        t.status !== 'done' &&
        t.status !== 'cancelled'
    )
    .sort((a, b) => {
      const da = new Date(`${a.due_date}T${a.due_time || '00:00'}`).getTime();
      const db = new Date(`${b.due_date}T${b.due_time || '00:00'}`).getTime();
      return da - db;
    })
    .slice(0, 5);

  // 2. Vencidas por asignado
  const overdueByAssignee = new Map<string, number>();
  overdueTasks.forEach((t) => {
    if (t.assigned_to) {
      overdueByAssignee.set(t.assigned_to, (overdueByAssignee.get(t.assigned_to) || 0) + 1);
    }
  });
  const overdueTop = [...overdueByAssignee.entries()]
    .map(([id, count]) => ({ id, count, name: collaborators.find((c) => c.id === id)?.full_name || null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // 3. Antigüedad de pendientes (sin resolver)
  const agingBuckets = [
    { key: '0-3', label: '0-3 días', min: 0, max: 3 },
    { key: '4-7', label: '4-7 días', min: 4, max: 7 },
    { key: '8-15', label: '8-15 días', min: 8, max: 15 },
    { key: '16+', label: '+15 días', min: 16, max: Infinity },
  ];
  const agingCounts = agingBuckets.map((b) => ({
    ...b,
    count: periodTasks.filter((t) => {
      if (t.status === 'done' || t.status === 'cancelled') return false;
      const age = daysBetween(new Date(t.created_at), todayStart);
      return age >= b.min && age <= b.max;
    }).length,
  }));

  // 4. Velocidad: completadas por semana (8 semanas)
  const weekMs = 7 * 86400000;
  const weeklyDone = new Array(8).fill(0) as number[];
  scopeTasks.forEach((t) => {
    if (t.status !== 'done') return;
    const completedAt = t.completed_at ? new Date(t.completed_at).getTime() : new Date(t.updated_at).getTime();
    const weeksAgo = Math.floor((nowTs - completedAt) / weekMs);
    if (weeksAgo >= 0 && weeksAgo < 8) weeklyDone[weeksAgo]++;
  });
  const weeklyLabels = weeklyDone.map((_, i) => {
    const d = new Date(nowTs - (7 - i) * weekMs);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  });

  // 5. Subtareas: % de avance de los padres con hijos
  const childTasks = scopeTasks.filter((t) => t.parent_task_id);
  const parentIds = new Set(childTasks.map((t) => t.parent_task_id!));
  const parentsWithChildren = periodTasks.filter(
    (t) => !t.parent_task_id && parentIds.has(t.id)
  );
  const childrenDone = childTasks.filter((t) => t.status === 'done').length;
  const subtaskPct =
    childTasks.length > 0 ? Math.round((childrenDone / childTasks.length) * 100) : 0;

  // 6. Sin asignar
  const unassigned = periodTasks.filter(
    (t) =>
      !t.assigned_to &&
      t.status !== 'done' &&
      t.status !== 'cancelled'
  ).length;

  // 15. Horas de turno planeadas del equipo en el periodo
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  let plannedHours = 0;
  if (schedules.length > 0) {
    for (let d = periodCutoffMs; d <= nowTs; d += 86400000) {
      const weekday = new Date(d).getDay();
      schedules.forEach((sch) => {
        if (sch.day_of_week !== weekday) return;
        const shift = shiftById.get(sch.shift_id);
        if (shift) plannedHours += shiftDurationHours(shift);
      });
    }
  }
  const plannedHoursRounded = Math.round(plannedHours * 10) / 10;
  const periodLabel =
    period === 'all' ? 'últimos 30 días' : period === '7' ? 'últimos 7 días' : 'últimos 30 días';

  const assignedCounts = new Map<string, number>();
  periodTasks.forEach((t) => {
    if (t.assigned_to) assignedCounts.set(t.assigned_to, (assignedCounts.get(t.assigned_to) || 0) + 1);
  });
  const assignedTop = [...assignedCounts.entries()]
    .map(([id, count]) => ({ id, count, name: collaborators.find((c) => c.id === id)?.full_name || null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const recent = [...periodTasks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8);

  const stats: { label: string; value: number; icon: React.ReactNode; color: string }[] = [
    { label: 'Total tareas', value: total, icon: <Layers className="size-4" />, color: 'text-info' },
    { label: 'Completadas', value: done, icon: <CheckCircle2 className="size-4" />, color: 'text-success' },
    { label: 'En progreso', value: inProgress, icon: <Clock className="size-4" />, color: 'text-warning' },
    { label: 'Pendientes', value: pending, icon: <AlertCircle className="size-4" />, color: 'text-info' },
    { label: 'Vencidas', value: overdue, icon: <CalendarClock className="size-4" />, color: overdue > 0 ? 'text-destructive' : 'text-muted-foreground' },
    { label: 'Sub-tareas', value: subTasks, icon: <ListTodo className="size-4" />, color: 'text-muted-foreground' },
  ];

  return (
    <EntidadPagina className="space-y-6">
      <CabeceraEntidad
        tipo={scope.type}
        titulo={scope.type === 'workspace' ? workspace!.name : folder!.name}
        subtitulo={
          scope.type === 'workspace'
            ? `${scopeFolders.length} carpeta(s) · ${scopeLists.length} lista(s) · ${total} tareas`
            : `${workspace!.name} / ${folder!.name} · ${scopeLists.length} lista(s) · ${total} tareas`
        }
        badges={<Badge className="bg-primary/10 text-primary">{completion}% completado</Badge>}
        acciones={
          <>
            <div className="flex items-center gap-1 rounded-md border p-0.5 text-xs">
              {(
                [
                  ['7', '7d'],
                  ['30', '30d'],
                  ['all', 'Todo'],
                ] as [Period, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setPeriod(value)}
                  className={`rounded px-2 py-1 font-medium transition-colors ${
                    period === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {scope.type === 'workspace' && canManageWs && (
              <AccionEntidad icono={Settings2} onClick={() => setShowConfig(true)}>
                Estados y prioridades por defecto
              </AccionEntidad>
            )}
            {ctx.isAdmin && (
              <ShareButton
                onClick={() =>
                  ctx.openShare(
                    scope.type,
                    scope.type === 'workspace' ? workspace! : folder!
                  )
                }
              />
            )}
          </>
        }
      />

      <StatsGrid stats={stats} />

      <PanelDistribucion
        statuses={statuses}
        priorities={priorities}
        byStatus={byStatus}
        byPriority={byPriority}
        total={total}
        weeklyDone={weeklyDone}
        weeklyLabels={weeklyLabels}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <PanelProximas upcoming={upcoming} todayStart={todayStart} />
        <PanelVencidasPorAsignado overdueTop={overdueTop} />
        <PanelAntiguedad agingCounts={agingCounts} total={total} />
      </div>

      <PanelesResumen
        subtaskPct={subtaskPct}
        childrenDone={childrenDone}
        childTasksCount={childTasks.length}
        parentsCount={parentsWithChildren.length}
        unassigned={unassigned}
        plannedHoursRounded={plannedHoursRounded}
        periodLabel={periodLabel}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <PanelListas
          scopeLists={scopeLists}
          scopeTasks={scopeTasks}
          scopeType={scope.type}
          dashboardWsSlug={dashboardWsSlug}
          folderSegmentOf={folderSegmentOf}
          lists={lists}
        />
        <PanelRecientes
          recent={recent}
          scopeLists={scopeLists}
          dashboardWsSlug={dashboardWsSlug}
          folderSegmentOf={folderSegmentOf}
          lists={lists}
          statuses={statuses}
        />
      </div>

      <PanelAsignados assignedTop={assignedTop} />

      {scope.type === 'workspace' && canManageWs && workspace && (
        <StatusConfigDialog
          open={showConfig}
          onOpenChange={setShowConfig}
          mode={{ type: 'workspace', wsId: workspace.id }}
          initialStatuses={resolveDefaults(workspace.default_statuses)}
          initialPriorities={resolveDefaultsPriorities(workspace.default_priorities)}
          onSaved={() => void dashboardQuery.refetch()}
        />
      )}
    </EntidadPagina>
  );
}
