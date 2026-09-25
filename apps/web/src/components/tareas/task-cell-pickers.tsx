'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/cliente';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { TimePicker } from '@/components/ui/time-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Check,
  CheckCircle2,
  Circle,
  PlayCircle,
  AlertCircle,
  XCircle,
  Clock,
  Flag,
  Loader2,
  MessageSquare,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useFormatoHora } from '@/lib/use-formato-hora';
import { usePreferenciasTrabajo } from '@/lib/use-preferencias-trabajo';
import type { StatusDef, PriorityDef, TaskNote } from '@/types';

export function formatDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: '2-digit' });
}

export function DueDatePicker({
  dueDate,
  dueTime,
  overdue,
  onSave,
}: {
  dueDate: string | null;
  dueTime: string | null;
  overdue: boolean;
  onSave: (date: string | null, time: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<Date | null>(null);
  const { formatHora } = useFormatoHora();
  const { workdayStart } = usePreferenciasTrabajo();
  const [draftTime, setDraftTime] = useState(workdayStart);

  const openPicker = () => {
    setDraftDate(dueDate ? new Date(`${dueDate}T00:00:00`) : null);
    setDraftTime(dueTime?.slice(0, 5) || workdayStart);
    setOpen(true);
  };

  const save = () => {
    const dateStr = draftDate ? format(draftDate, 'yyyy-MM-dd') : '';
    const timeStr = draftDate ? draftTime : null;
    onSave(dateStr || null, timeStr);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) openPicker();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex cursor-pointer items-center gap-1 rounded-md px-1 text-xs transition-colors hover:bg-muted/60',
            overdue ? 'text-destructive' : 'text-muted-foreground'
          )}
          title="Editar fecha límite"
        >
          {dueDate ? (
            <>
              <CalendarIcon className="size-3.5" />
              {formatDate(dueDate)}
              {dueTime && (
                <span className="font-medium tabular-nums">{formatHora(dueTime)}</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-[calc(100vw-1rem)] p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.closest('[data-slot="select-content"]') ||
            target.closest('[data-slot="select-trigger"]')
          ) {
            e.preventDefault();
          }
        }}
      >
        <Calendar
          mode="single"
          selected={draftDate ?? undefined}
          onSelect={(date) => setDraftDate(date ?? null)}
          autoFocus
        />
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <Label className="text-xs text-muted-foreground">Hora límite</Label>
          <div className="w-32">
            <TimePicker value={draftTime} onChange={setDraftTime} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-2">
          {dueDate && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                onSave(null, null);
                setOpen(false);
              }}
            >
              Quitar fecha
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={!draftDate}
            onClick={save}
          >
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  backlog: Clock,
  in_progress: PlayCircle,
  review: AlertCircle,
  done: CheckCircle2,
  cancelled: XCircle,
};

function StatusIconFor({ status, className }: { status: string; className?: string }) {
  const Icon = STATUS_ICONS[status] || Circle;
  return <Icon className={className} />;
}

export function StatusPicker({
  value,
  onSelect,
  statuses,
}: {
  value: string;
  onSelect: (key: string) => void;
  statuses: StatusDef[];
}) {
  const [open, setOpen] = useState(false);
  const current = statuses.find((s) => s.key === value) || {
    key: value, label: value, color: '#6b7280',
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded-md transition-colors hover:opacity-80"
          title="Cambiar estado"
        >
          <Badge variant="outline" className="gap-1.5 px-2 py-1 text-xs font-medium">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: current.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{current.label}</span>
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <p className="px-2 pt-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Estados
        </p>
        <div className="max-h-72 overflow-y-auto">
          {statuses.map((s) => {
            const isSelected = s.key === value;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => { onSelect(s.key); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                  isSelected && 'bg-accent'
                )}
              >
                <span
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${s.color}33`, color: s.color }}
                >
                  <StatusIconFor status={s.key} className="size-3" />
                </span>
                <span className="flex-1 truncate text-left">{s.label}</span>
                {isSelected && <Check className="size-4" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PriorityPicker({
  value,
  onSelect,
  priorities,
}: {
  value: string;
  onSelect: (key: string) => void;
  priorities: PriorityDef[];
}) {
  const [open, setOpen] = useState(false);
  const current = priorities.find((p) => p.key === value) || {
    key: value, label: value, color: '#6b7280',
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs font-medium transition-colors hover:bg-muted/60"
          title="Cambiar prioridad"
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: current.color }}
            aria-hidden
          />
          <span className="text-muted-foreground">{current.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <p className="px-2 pt-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Prioridades
        </p>
        <div className="max-h-72 overflow-y-auto">
          {priorities.map((p) => {
            const isSelected = p.key === value;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => { onSelect(p.key); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                  isSelected && 'bg-accent'
                )}
              >
                <span
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${p.color}33`, color: p.color }}
                >
                  <Flag className="size-2.5 fill-current" />
                </span>
                <span className="flex-1 truncate text-left">{p.label}</span>
                {isSelected && <Check className="size-4" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function NotesPopover({
  taskId,
  count,
  href,
}: {
  taskId: string;
  count: number;
  href: string;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [loading, setLoading] = useState(false);
  const { formatHoraDeFecha } = useFormatoHora();

  const load = async () => {
    if (loading || notes.length > 0) return;
    setLoading(true);
    const res = await apiFetch<{ notas: TaskNote[] }>(
      `/tareas/${encodeURIComponent(taskId)}/notas/recientes?limit=30`
    ).catch(() => null);
    setNotes(res?.notas ?? []);
    setLoading(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          title="Ver comentarios"
        >
          <MessageSquare className="size-3.5" />
          {count > 0 && <span className="tabular-nums">{count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-1rem)] p-0" align="start">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-medium">Comentarios ({count})</p>
        </div>
        <div className="max-h-80 space-y-3 overflow-y-auto p-3">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && notes.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Sin comentarios</p>
          )}
          {notes.map((n) => (
            <div key={n.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">{n.author?.full_name || 'Usuario'}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format(new Date(n.created_at), 'd MMM')},{' '}
                  {formatHoraDeFecha(new Date(n.created_at))}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{n.content}</p>
            </div>
          ))}
        </div>
        <div className="border-t p-1.5">
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs" asChild>
            <Link href={href}>Ver en la tarea</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
