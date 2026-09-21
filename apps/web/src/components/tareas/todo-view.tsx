'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { sesionActual } from '@/lib/auth/sesion';
import { api, apiFetch } from '@/lib/api/cliente';
import { findEntityByParam } from '@/lib/slugs';
import {
  Check,
  Minus,
  Plus,
  Repeat,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
  Tag,
  ListChecks,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CalendarDays,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { aplicarEventoLista, leerEvento, parchearQuery } from '@/lib/realtime-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  todoCycleBounds,
  cycleTitle,
  resetLabel,
  frequencyLabel,
  isDone,
  pctDone,
  isDayActive,
  weekDaysLabel,
  WEEKDAY_LETTERS,
} from '@/lib/todo-config';
import { useTareas } from '@/components/tareas/tareas-context';
import { ShareButton } from '@/components/tareas/share-entity-dialog';
import type { Todo, TodoBoardRow, TodoFrequency } from '@/types';

type ToDoViewProps = {
  todoId: string;
};

type QuickAddPrefs = {
  frequency: TodoFrequency;
  intervalDays: number;
  target: number;
  weekDays: number[];
  time: string | null;
};

const DEFAULT_PREFS: QuickAddPrefs = {
  frequency: 'daily',
  intervalDays: 7,
  target: 1,
  weekDays: [],
  time: null,
};

function CircleCheck({
  checked,
  onToggle,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
        checked
          ? 'border-emerald-500 bg-emerald-500 text-white animate-in zoom-in-50'
          : 'border-muted-foreground/40 text-transparent hover:border-emerald-500 hover:bg-emerald-500/10',
        disabled && 'cursor-not-allowed opacity-50'
      )}
      title={checked ? 'Desmarcar' : 'Completar'}
    >
      <Check className="size-4" strokeWidth={3} />
    </button>
  );
}

function ProgressBar({ value, done }: { value: number; done: boolean }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300',
          done ? 'bg-emerald-500' : 'bg-primary'
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/**
 * Campos compartidos de configuración de un TO-DO (frecuencia, días,
 * hora y meta). Usado por el popover de creación y el de la fila.
 */
function TodoPrefsFields({
  prefs,
  onChange,
}: {
  prefs: QuickAddPrefs;
  onChange: (patch: Partial<QuickAddPrefs>) => void;
}) {
  return (
    <div className="space-y-2 p-2">
      <div className="space-y-0.5">
        {(['daily', 'weekly', 'interval'] as TodoFrequency[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onChange({ frequency: f })}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
          >
            <span>{frequencyLabel(f, f === 'interval' ? prefs.intervalDays : null)}</span>
            {prefs.frequency === f && <Check className="size-4 text-primary" />}
          </button>
        ))}
      </div>
      {prefs.frequency === 'interval' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Cada</span>
          <Input
            type="number"
            min={1}
            value={prefs.intervalDays}
            onChange={(e) => onChange({ intervalDays: Math.max(1, Number(e.target.value) || 1) })}
            className="h-8 w-20"
            aria-label="Días entre reinicios"
          />
          <span className="text-xs text-muted-foreground">días</span>
        </div>
      )}
      {prefs.frequency !== 'interval' ? (
        <div className="space-y-1.5 border-t pt-2">
          <span className="text-xs text-muted-foreground">Días de la semana</span>
          <div className="flex gap-1">
            {WEEKDAY_LETTERS.map((letter, idx) => {
              const selected = prefs.weekDays.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    onChange({
                      weekDays: selected
                        ? prefs.weekDays.filter((d) => d !== idx)
                        : [...prefs.weekDays, idx].sort(),
                    })
                  }
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                  aria-pressed={selected}
                  title={letter === 'D' ? 'Domingo' : letter === 'X' ? 'Miércoles' : letter}
                >
                  {letter}
                </button>
              );
            })}
          </div>
          {prefs.weekDays.length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ weekDays: [] })}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Todos los días
            </button>
          )}
        </div>
      ) : (
        <p className="border-t pt-2 text-[11px] text-muted-foreground">
          Los días de la semana solo aplican a frecuencias diaria y semanal.
        </p>
      )}
      {prefs.frequency === 'daily' ? (
        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-xs text-muted-foreground">Hora límite</span>
          <div className="flex items-center gap-1">
            <Input
              type="time"
              value={prefs.time ?? ''}
              onChange={(e) => onChange({ time: e.target.value || null })}
              className="h-8 w-28"
              aria-label="Hora límite"
            />
            {prefs.time && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => onChange({ time: null })}
              >
                Quitar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="border-t pt-2 text-[11px] text-muted-foreground">
          La hora límite solo aplica a la frecuencia diaria.
        </p>
      )}
      <div className="flex items-center justify-between border-t pt-2">
        <span className="text-xs text-muted-foreground">Meta por ciclo</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => onChange({ target: Math.max(1, prefs.target - 1) })}
            aria-label="Reducir meta"
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="w-8 text-center text-sm font-medium tabular-nums">
            {prefs.target}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => onChange({ target: prefs.target + 1 })}
            aria-label="Aumentar meta"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuickAddRow({
  value,
  showPrefs,
  prefs,
  onValueChange,
  onKeyDown,
  onBlur,
  onPrefsChange,
}: {
  value: string;
  showPrefs: boolean;
  prefs: QuickAddPrefs;
  onValueChange: (value: string) => void;
  onKeyDown: (e: { key: string }) => void;
  onBlur: (e: { relatedTarget: EventTarget | null }) => void;
  onPrefsChange: (patch: Partial<QuickAddPrefs>) => void;
}) {
  return (
    <TableRow data-add-draft className="group border-b hover:bg-muted/40">
      <TableCell className="pl-3">
        <span className="inline-flex w-4 shrink-0 items-center justify-center">
          <Plus className="size-4 text-muted-foreground/60" />
        </span>
      </TableCell>
      <TableCell className="min-w-[220px]">
        <Input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          placeholder="Agregar tarea repetitiva…"
          className="h-7 min-w-32 flex-1 border-0 bg-transparent px-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/50"
        />
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {showPrefs ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                title="Configurar frecuencia y meta"
              >
                <Repeat className="size-3.5" />
                {frequencyLabel(prefs.frequency, prefs.frequency === 'interval' ? prefs.intervalDays : null)} · Meta {prefs.target}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Frecuencia y meta
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <TodoPrefsFields prefs={prefs} onChange={onPrefsChange} />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TableCell>
      <TableCell className="hidden xl:table-cell" />
      <TableCell />
      <TableCell />
    </TableRow>
  );
}

export function ToDoView({ todoId: paramTodoId }: ToDoViewProps) {
  const ctx = useTareas();
  const ctxTodo = ctx.loading
    ? null
    : (findEntityByParam(paramTodoId, ctx.todos) ?? null);
  // Fallback: si el contexto no resuelve el param (refetch en vuelo o
  // entidad recién creada), se resuelve por la API para que el board no
  // reciba un slug que el RPC no entiende (URL navegada pero vista sin
  // entrar).
  const [apiTodo, setApiTodo] = useState<Todo | null>(null);
  const [resolviendo, setResolviendo] = useState(false);
  const todo = ctxTodo ?? apiTodo;
  const todoId = todo?.id ?? null;
  const canWrite = todoId ? ctx.canWrite('todo', todoId) : false;

  useEffect(() => {
    if (ctxTodo?.id || !paramTodoId) return;
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Resolución del param por la API; el estado marca la espera antes del fetch.
    setResolviendo(true);
    apiFetch<{ todo: Todo | null }>(
      `/todos/${encodeURIComponent(paramTodoId)}/resolver`
    )
      .then((r) => {
        if (activo && r.todo) setApiTodo(r.todo);
      })
      .catch(() => undefined)
      .finally(() => {
        if (activo) setResolviendo(false);
      });
    return () => {
      activo = false;
    };
  }, [paramTodoId, ctxTodo?.id]);
  const [rows, setRows] = useState<TodoBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const [timezone, setTimezone] = useState('UTC');
  const [weekStart, setWeekStart] = useState<0 | 1>(1);
  const [drafts, setDrafts] = useState<string[]>(['']);
  const enVueloRef = useRef<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<QuickAddPrefs>(DEFAULT_PREFS);
  const [deleteTarget, setDeleteTarget] = useState<TodoBoardRow | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const queryClient = useQueryClient();
  const todoQuery = useQuery({
    queryKey: ['todo', 'board', todoId],
    queryFn: async () => {
      const sesion = await sesionActual();
      if (!sesion) return null;
      if (!todoId) return null;
      const res = await apiFetch<{ rows: TodoBoardRow[]; timezone: string; preferences: unknown }>(
        `/todos/${todoId}/board`
      );
      return res;
    },
    enabled: !!todoId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    const res = todoQuery.data;
    if (!res) return;
    setRows(res.rows);
    setTimezone(res.timezone);
    const weekPref = (res.preferences as { week_start?: 'monday' | 'sunday' } | null)?.week_start;
    setWeekStart(weekPref === 'sunday' ? 0 : 1);
    setLoading(false);
  }, [todoQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (todoQuery.error) toast.error(todoQuery.error instanceof Error ? todoQuery.error.message : 'No se pudo cargar el TO-DO');
  }, [todoQuery.error]);
  const invalidarTodo = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['todo', 'board', todoId] });
  }, [queryClient, todoId]);

  // Aplica el evento a la caché para que la fila cambie al instante.
  const aplicarEventoItem = useCallback(
    (payload: unknown) => {
      const evt = leerEvento<Record<string, unknown>>(payload);
      if (!evt || evt.table !== 'todo_items') {
        invalidarTodo();
        return;
      }
      let aplicado = false;
      parchearQuery<{ rows: TodoBoardRow[] }>(queryClient, ['todo', 'board', todoId], (data) => {
        const r = aplicarEventoLista<TodoBoardRow>(data.rows, evt);
        if (!r.aplicado || !r.lista) return data;
        aplicado = true;
        return { ...data, rows: r.lista };
      });
      if (!aplicado) invalidarTodo();
    },
    [queryClient, todoId, invalidarTodo]
  );

  // Reflejar en tiempo real los cambios de items del TO-DO
  useEffect(() => {
    if (!todoId) return;
    const channel = canalRealtime(`todo-items-${todoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todo_items', filter: `todo_id=eq.${todoId}` },
        aplicarEventoItem
      )
      // Los DELETE no son filtrables: listener sin filtro resuelto por id.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'todo_items' },
        aplicarEventoItem
      )
      .subscribe();
    return () => {
      removerCanal(channel);
    };
  }, [todoId, aplicarEventoItem]);

  const now = new Date();

  const boundsByRow = new Map(
    rows.map((r) => [
      r.id,
      todoCycleBounds(r.frequency, r.interval_days, now, timezone, weekStart, r.due_time),
    ])
  );

  const activeRows = rows.filter((r) => r.active);
  const doneRows = activeRows.filter((r) => isDone(r.quantity_done, r.target_quantity));
  const pendingRows = activeRows.filter((r) => !isDone(r.quantity_done, r.target_quantity));
  const pausedRows = rows.filter((r) => !r.active);
  const overallPct = activeRows.length
    ? pctDone(doneRows.length, activeRows.length)
    : 0;
  const cycleTitleText = activeRows.length
    ? cycleTitle(
        activeRows[0].frequency,
        boundsByRow.get(activeRows[0].id) ?? { start: now, end: now },
        now,
        timezone
      )
    : 'Hoy';
  const firstRow = activeRows[0];
  const firstBounds = firstRow ? boundsByRow.get(firstRow.id) ?? null : null;
  const firstAppliesToday = firstRow
    ? isDayActive(firstRow.week_days, now, timezone)
    : false;
  const nextReset = firstRow && firstBounds
    ? (firstRow.due_time &&
        (firstRow.frequency === 'daily' || firstRow.frequency === 'shift') &&
        firstAppliesToday
      ) ? (
        now.getTime() >= firstBounds.end.getTime()
          ? `vencido hoy ${firstRow.due_time}`
          : `vence hoy ${firstRow.due_time}`
      ) : resetLabel(firstBounds.end, now, timezone)
    : '';

  const handleTick = async (id: string, delta: number) => {
    try {
      await api.post(`/todos/${todoId}/items/${id}/tick`, { delta });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar el progreso');
    }
    invalidarTodo();
  };

  const handleCreateMany = async (titles: string[]): Promise<boolean> => {
    const trimmed = [...new Set(titles.map((t) => t.trim()).filter(Boolean))].filter(
      (t) => !enVueloRef.current.has(t)
    );
    if (trimmed.length === 0) return true;
    const sesion = await sesionActual();
    if (!sesion) return false;
    const basePos = rows.length;
    const inserts = trimmed.map((name, idx) => ({
      name,
      frequency: prefs.frequency,
      interval_days: prefs.frequency === 'interval' ? prefs.intervalDays : null,
      target_quantity: prefs.target,
      week_days:
        prefs.frequency !== 'interval' && prefs.weekDays.length > 0
          ? prefs.weekDays
          : null,
      due_time: prefs.frequency === 'daily' ? prefs.time : null,
      position: basePos + idx,
      created_by: sesion.userId,
    }));
    trimmed.forEach((t) => enVueloRef.current.add(t));
    try {
      await api.post(`/todos/${todoId}/items`, { items: inserts });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron crear los items');
      return false;
    } finally {
      trimmed.forEach((t) => enVueloRef.current.delete(t));
    }
    invalidarTodo();
    return true;
  };

  const setDraft = (i: number, value: string) => {
    setDrafts((prev) => {
      const next = [...prev];
      next[i] = value;
      if (i === next.length - 1 && value.trim() !== '') next.push('');
      return next;
    });
  };

  const commitDraft = async (i: number) => {
    const value = drafts[i]?.trim();
    if (!value) return;
    // Quita el borrador al instante (feedback inmediato y sin doble envío por
    // Enter + blur) y lo restaura si el guardado falla.
    setDrafts((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [''];
    });
    const ok = await handleCreateMany([value]);
    if (!ok) {
      setDrafts((prev) => (prev[prev.length - 1] === '' ? [...prev.slice(0, -1), value, ''] : [...prev, value, '']));
    }
  };

  const commitAllDrafts = () => {
    const titles = drafts.map((d) => d.trim()).filter(Boolean);
    if (titles.length) void handleCreateMany(titles);
    setDrafts(['']);
  };

  // Al salir del área de escritura (clic fuera o en otra parte de la página)
  // los borradores pendientes se guardan automáticamente. Un clic dentro de la
  // misma área o en un menú desplegable (portal Radix) no guarda.
  const handleAddAreaBlur = (e: { relatedTarget: EventTarget | null }) => {
    const rt = e.relatedTarget;
    if (rt instanceof Element && rt.closest('[data-add-draft], [data-radix-popper-content-wrapper]')) {
      return;
    }
    commitAllDrafts();
  };

  const handleUpdate = async (id: string, patch: Partial<TodoBoardRow>) => {
    try {
      await api.patch(`/todos/${todoId}/items/${id}`, patch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo actualizar el item');
    }
    invalidarTodo();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/todos/${todoId}/items/${deleteTarget.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el item');
    }
    setDeleteTarget(null);
    invalidarTodo();
  };

  const startRename = (row: TodoBoardRow) => {
    setRenamingId(row.id);
    setRenameValue(row.name);
  };

  const commitRename = () => {
    if (renamingId) {
      const value = renameValue.trim();
      if (value) void handleUpdate(renamingId, { name: value });
    }
    setRenamingId(null);
  };

  if (loading && todoId) return <TableSkeleton rows={5} cols={3} />;

  if (resolviendo && !todo) return <TableSkeleton rows={5} cols={3} />;

  if (!ctx.loading && !todo) {
    return (
      <div className="space-y-4">
        <EmptyState icon={ListChecks} title="No encontrado" description="El TO-DO no existe o no tienes acceso" />
      </div>
    );
  }

  if (loading || !todo) return <TableSkeleton rows={5} cols={3} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{todo.name}</h1>
        {ctx.isAdmin && (
          <div className="ml-auto flex items-center gap-2">
            <ShareButton onClick={() => ctx.openShare('todo', todo)} />
          </div>
        )}
      </div>
      <div className="rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CircleDot className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold leading-tight">{cycleTitleText}</h2>
              <p className="text-xs text-muted-foreground">
                {doneRows.length} de {activeRows.length} completadas · {nextReset}
              </p>
            </div>
          </div>
          <div className="w-full max-w-xs">
            <ProgressBar value={overallPct} done={overallPct === 100 && activeRows.length > 0} />
          </div>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <colgroup>
            <col style={{ width: 56 }} />
            <col />
            <col className="hidden lg:table-cell" style={{ width: 130 }} />
            <col className="hidden xl:table-cell" style={{ width: 160 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 40 }} />
          </colgroup>
          <TableHeader>
            <TableRow className="border-b text-xs text-muted-foreground">
              <TableHead className="pl-3">Estado</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden lg:table-cell">Frecuencia</TableHead>
              <TableHead className="hidden xl:table-cell">Programación</TableHead>
              <TableHead>Progreso</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {canWrite && (
              <>
                {drafts.map((draft, i) => (
                  <QuickAddRow
                    key={i}
                    value={draft}
                    showPrefs={i === 0}
                    prefs={prefs}
                    onPrefsChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
                    onValueChange={(value) => setDraft(i, value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitDraft(i);
                      if (e.key === 'Escape') setDraft(i, '');
                    }}
                    onBlur={handleAddAreaBlur}
                  />
                ))}
              </>
            )}

            {pausedRows.length > 0 && (
              <>
                <TableRow className="bg-muted/20">
                  <TableCell colSpan={6} className="py-0">
                    <button
                      onClick={() => setShowPaused((v) => !v)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showPaused ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      <Pause className="size-3.5" />
                      Pausadas ({pausedRows.length})
                    </button>
                  </TableCell>
                </TableRow>
                {showPaused &&
                  pausedRows.map((row) => (
                    <TodoRow
                      key={row.id}
                      row={row}
                      canWrite={canWrite}
                      timezone={timezone}
                      weekStart={weekStart}
                      onTick={handleTick}
                      onRenameStart={startRename}
                      onRenameCommit={commitRename}
                      onRenameCancel={() => setRenamingId(null)}
                      renaming={renamingId === row.id}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onUpdate={handleUpdate}
                      onDelete={() => setDeleteTarget(row)}
                      onTogglePaused={() => void handleUpdate(row.id, { active: true })}
                    />
                  ))}
              </>
            )}

            {pendingRows.map((row) => (
              <TodoRow
                key={row.id}
                row={row}
                canWrite={canWrite}
                timezone={timezone}
                weekStart={weekStart}
                onTick={handleTick}
                onRenameStart={startRename}
                onRenameCommit={commitRename}
                onRenameCancel={() => setRenamingId(null)}
                renaming={renamingId === row.id}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onUpdate={handleUpdate}
                onDelete={() => setDeleteTarget(row)}
                onTogglePaused={() => void handleUpdate(row.id, { active: false })}
              />
            ))}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Sin tareas repetitivas — agrega la primera arriba
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {doneRows.length > 0 && (
        <div className="rounded-md border">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex w-full items-center gap-2 bg-muted/20 px-3 py-2.5 text-sm font-medium"
            aria-expanded={showCompleted}
          >
            {showCompleted ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <Check className="size-4 text-emerald-500" />
            Completadas ({doneRows.length})
          </button>
          {showCompleted && (
            <Table>
              <TableBody>
                {doneRows.map((row) => (
                  <TodoRow
                    key={row.id}
                    row={row}
                    canWrite={canWrite}
                    timezone={timezone}
                    weekStart={weekStart}
                    onTick={handleTick}
                    onRenameStart={startRename}
                    onRenameCommit={commitRename}
                    onRenameCancel={() => setRenamingId(null)}
                    renaming={renamingId === row.id}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onUpdate={handleUpdate}
                    onDelete={() => setDeleteTarget(row)}
                    onTogglePaused={() => void handleUpdate(row.id, { active: false })}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Eliminar "${deleteTarget.name}"` : ''}
        description="La tarea repetitiva se eliminará para todos los trabajadores. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function TodoRow({
  row,
  canWrite,
  timezone,
  weekStart,
  onTick,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  renaming,
  renameValue,
  onRenameChange,
  onUpdate,
  onDelete,
  onTogglePaused,
}: {
  row: TodoBoardRow;
  canWrite: boolean;
  timezone: string;
  weekStart: 0 | 1;
  onTick: (id: string, delta: number) => void;
  onRenameStart: (row: TodoBoardRow) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onUpdate: (id: string, patch: Partial<TodoBoardRow>) => void;
  onDelete: () => void;
  onTogglePaused: () => void;
}) {
  const done = isDone(row.quantity_done, row.target_quantity);
  const pct = pctDone(row.quantity_done, row.target_quantity);
  const isCounter = row.target_quantity > 1;
  const appliesToday = isDayActive(row.week_days, new Date(), timezone);
  const bounds = todoCycleBounds(row.frequency, row.interval_days, new Date(), timezone, weekStart, row.due_time);
  const timePast =
  row.due_time &&
  (row.frequency === 'daily' || row.frequency === 'shift') &&
  new Date().getTime() >= bounds.end.getTime() &&
  !done;

  const rowPrefs: QuickAddPrefs = {
    frequency: row.frequency,
    intervalDays: row.interval_days ?? 7,
    target: row.target_quantity,
    weekDays: row.week_days ?? [],
    time: row.due_time,
  };

const applyPrefs = (patch: Partial<QuickAddPrefs>) => {
    const next: Partial<TodoBoardRow> = {};
    if (patch.frequency !== undefined) {
      next.frequency = patch.frequency;
      next.interval_days =
        patch.frequency === 'interval' ? (row.interval_days ?? 7) : null;
      // A: la hora solo aplica a diario; al pasar a semanal/interval
      // se limpia el dato fantasma.
      if (patch.frequency !== 'daily') next.due_time = null;
      // B: los días de la semana no aplican a "Cada N días".
      if (patch.frequency === 'interval') next.week_days = null;
    }
    if (patch.intervalDays !== undefined) next.interval_days = patch.intervalDays;
    if (patch.weekDays !== undefined) next.week_days = patch.weekDays;
    if (patch.time !== undefined) next.due_time = patch.time;
    if (patch.target !== undefined) next.target_quantity = patch.target;
    void onUpdate(row.id, next);
  };

  return (
    <TableRow
      className={cn(
        'group hover:bg-muted/40',
        !row.active && 'opacity-60',
        !appliesToday && 'opacity-70',
        done && 'bg-emerald-500/5'
      )}
    >
      <TableCell className="pl-3">
        {isCounter ? (
          <div className="flex items-center gap-0.5">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => onTick(row.id, -1)}
              disabled={!canWrite || row.quantity_done <= 0}
              aria-label={`Restar a ${row.name}`}
            >
              <Minus className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => onTick(row.id, 1)}
              disabled={!canWrite || done}
              aria-label={`Sumar a ${row.name}`}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        ) : (
          <CircleCheck
            checked={done}
            disabled={!canWrite}
            ariaLabel={done ? `Desmarcar ${row.name}` : `Completar ${row.name}`}
            onToggle={() => onTick(row.id, done ? -1 : 1)}
          />
        )}
      </TableCell>

      <TableCell className="min-w-[200px]">
        {renaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onBlur={onRenameCancel}
            className="h-8 text-sm"
          />
        ) : (
          <p
            onDoubleClick={() => canWrite && onRenameStart(row)}
            title={canWrite ? 'Doble clic para renombrar' : row.name}
            className={cn(
              '-mx-1 truncate rounded px-1 py-0.5 text-sm font-medium',
              done && 'text-muted-foreground line-through decoration-emerald-500/60',
              canWrite && 'cursor-text hover:bg-muted/70'
            )}
          >
            {row.name}
          </p>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 lg:hidden">
          {row.frequency !== 'daily' && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-normal">
              <Repeat className="size-3" />
              {frequencyLabel(row.frequency, row.interval_days)}
            </Badge>
          )}
          {row.week_days && row.week_days.length > 0 && row.frequency !== 'interval' && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-normal">
              <CalendarDays className="size-3" />
              {weekDaysLabel(row.week_days)}
            </Badge>
          )}
          {row.due_time && (row.frequency === 'daily' || row.frequency === 'shift') && (
            <Badge
              variant="outline"
              className={cn(
                'gap-1 px-1.5 py-0 text-[10px] font-normal',
                timePast && 'border-red-500/40 text-red-500'
              )}
            >
              <Clock className="size-3" />
              {row.due_time}
            </Badge>
          )}
        </div>
      </TableCell>

      <TableCell className="hidden lg:table-cell">
        <span className="text-xs text-muted-foreground">
          {row.frequency !== 'daily'
            ? frequencyLabel(row.frequency, row.interval_days)
            : 'Diaria'}
        </span>
      </TableCell>

      <TableCell className="hidden xl:table-cell">
        <div className="flex flex-wrap items-center gap-1.5">
          {row.week_days && row.week_days.length > 0 && row.frequency !== 'interval' && (
            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-normal">
              <CalendarDays className="size-3" />
              {weekDaysLabel(row.week_days)}
            </Badge>
          )}
          {row.due_time && (row.frequency === 'daily' || row.frequency === 'shift') && (
            <Badge
              variant="outline"
              className={cn(
                'gap-1 px-1.5 py-0 text-[10px] font-normal',
                timePast && 'border-red-500/40 text-red-500'
              )}
            >
              <Clock className="size-3" />
              {row.due_time}
            </Badge>
          )}
          {!appliesToday && (
            <span className="text-[10px] text-muted-foreground">no aplica hoy</span>
          )}
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs tabular-nums text-muted-foreground',
              done && !isCounter && 'text-emerald-600'
            )}
          >
            {isCounter
              ? `${row.quantity_done}/${row.target_quantity}`
              : done
                ? 'Completada'
                : 'Pendiente'}
          </span>
          {isCounter && (
            <div className="hidden w-16 group-hover:block">
              <ProgressBar value={pct} done={done} />
            </div>
          )}
        </div>
      </TableCell>

      <TableCell>
        {canWrite && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                aria-label={`Opciones de ${row.name}`}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                <span className="block truncate">{row.name}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onRenameStart(row)}>
                <Tag className="size-4" />
                <span>Renombrar</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <TodoPrefsFields prefs={rowPrefs} onChange={applyPrefs} />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onTogglePaused}>
                {row.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                <span>{row.active ? 'Pausar' : 'Reanudar'}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                <span>Eliminar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}
