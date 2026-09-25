'use client';

import { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
import { shortUid } from '@/lib/slugs';
import { useFormatoHora } from '@/lib/use-formato-hora';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  PlayCircle,
  AlertCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Plus,
  ExternalLink,
  User,
  ArrowUpDown,
  MoreHorizontal,
  Trash2,
  CalendarDays,
  Tag,
  Flag,
  Check,
  GripVertical,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AssigneeSelect } from '@/components/tareas/assignee-select';
import {
  StatusPicker,
  PriorityPicker,
  NotesPopover,
  DueDatePicker,
} from '@/components/tareas/task-cell-pickers';
import { cn } from '@/lib/utils';
import type { Task, Profile, TaskStatus, TaskPriority, StatusDef, PriorityDef } from '@/types';
import { hiddenStatuses } from '@/lib/task-config';
import type { GrantDraft } from '@/components/tareas/assign-access-dialog';

export type AssignRequestHandler = (
  assigneeId: string,
  listId: string | null,
  onAccepted: (grants: GrantDraft[]) => void
) => void;

export type SortKey = 'position' | 'title' | 'assigned_to' | 'due_date' | 'priority' | 'status' | 'shift' | 'estimated_hours';

export type QuickAddInput = {
  title: string;
  parentId: string | null;
  assigned_to: string | null;
  due_date: string | null;
  due_time: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  grantAssigneeId?: string;
  grants?: GrantDraft[];
};

export type TaskDropTarget =
  | {
      kind: 'reorder';
      rowId: string;
      parentId: string | null;
      beforeId: string | null;
      place: 'before' | 'after';
    }
  | { kind: 'nest'; targetId: string };

type EditableField = 'title' | 'assigned_to' | 'due_date' | 'priority' | 'status';

const STATUS_ICONS: Record<string, React.ElementType> = {
  backlog: Clock,
  in_progress: PlayCircle,
  review: AlertCircle,
  done: CheckCircle2,
  cancelled: XCircle,
};

function StatusIcon({ status, className }: { status: string; className?: string }) {
  const Icon = STATUS_ICONS[status] || Circle;
  return <Icon className={className} />;
}

const COLUMNS: { label: string; key: SortKey | null }[] = [
  { label: 'Nombre', key: 'title' },
  { label: 'Persona asignada', key: 'assigned_to' },
  { label: 'Fecha límite', key: 'due_date' },
  { label: 'Prioridad', key: 'priority' },
  { label: 'Estado', key: 'status' },
  { label: 'Comentarios', key: null },
];

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function avatarColor(id: string) {
  const hue = hashHue(id);
  return {
    bg: `hsl(${hue} 60% 45% / 0.18)`,
    text: `hsl(${hue} 70% 35%)`,
    border: `hsl(${hue} 60% 45% / 0.25)`,
  };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function countDescendants(task: Task, map: Record<string, Task[]>): number {
  const children = map[task.id] || [];
  return children.length + children.reduce((sum, child) => sum + countDescendants(child, map), 0);
}

function formatShortDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function isOverdue(value: string, time?: string | null): boolean {
  const due = time ? new Date(`${value}T${time}`) : new Date(`${value}T23:59:59`);
  return due < new Date();
}

function getFieldValue(task: Task, field: EditableField): string {
  switch (field) {
    case 'title': return task.title;
    case 'assigned_to': return task.assigned_to ?? '';
    case 'due_date': return task.due_date ?? '';
    case 'priority': return task.priority;
    case 'status': return task.status;
  }
}

type AddTaskDraft = {
  title: string;
  assignedTo: string | null;
  dueDate: string | null;
  dueTime: string | null;
  priority: string | null;
  grantAssigneeId?: string;
  grants?: GrantDraft[];
};

function emptyDraft(): AddTaskDraft {
  return {
    title: '',
    assignedTo: null,
    dueDate: null,
    dueTime: null,
    priority: null,
  };
}

function AddTaskRow({
  depth,
  parentId,
  onAdd,
  placeholder,
  variant = 'table',
  collaborators,
  priorities,
  isAdmin,
  organizationId,
  listId,
  onAssignRequested,
}: {
  depth: number;
  parentId: string | null;
  onAdd: (input: QuickAddInput) => void;
  placeholder: string;
  variant?: 'table' | 'card';
  collaborators: Profile[];
  priorities: PriorityDef[];
  isAdmin: boolean;
  organizationId: string | null;
  listId: string | null;
  onAssignRequested: AssignRequestHandler;
}) {
  const [drafts, setDrafts] = useState<AddTaskDraft[]>([emptyDraft()]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const enviadosRef = useRef<Set<string>>(new Set());

  const updateDraft = (i: number, patch: Partial<AddTaskDraft>) => {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  };

  const handleTitleChange = (i: number, value: string) => {
    enviadosRef.current.delete(value);
    setDrafts((prev) => {
      const next = prev.map((d, idx) => (idx === i ? { ...d, title: value } : d));
      if (i === next.length - 1 && value.trim() !== '') next.push(emptyDraft());
      return next;
    });
  };

  const submitDraft = (draft: AddTaskDraft) => {
    const title = draft.title.trim();
    if (!title || enviadosRef.current.has(title)) return;
    enviadosRef.current.add(title);
    onAdd({
      title,
      parentId,
      assigned_to: draft.assignedTo,
      due_date: draft.dueDate,
      due_time: draft.dueTime,
      priority: draft.priority ?? undefined,
      grantAssigneeId: draft.grantAssigneeId,
      grants: draft.grants,
    });
  };

  const create = (i: number, refocus: boolean) => {
    const draft = drafts[i];
    const trimmed = draft?.title.trim() ?? '';
    if (!trimmed) {
      if (!refocus) setFocusedIndex(null);
      return;
    }
    submitDraft(draft);
    setDrafts((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [emptyDraft()];
    });
    if (refocus) requestAnimationFrame(() => inputRefs.current[i]?.focus());
    else setFocusedIndex(null);
  };

  const commitAll = () => {
    drafts.filter((d) => d.title.trim() !== '').forEach(submitDraft);
    setDrafts([emptyDraft()]);
    setFocusedIndex(null);
  };

  const handleTitleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const nextTarget = e.relatedTarget;
    if (
      nextTarget instanceof Element &&
      nextTarget.closest('[data-add-draft], [data-radix-popper-content-wrapper]')
    ) {
      return;
    }
    commitAll();
  };

  const titleInput = (draft: AddTaskDraft, i: number) => (
    <Input
      ref={(el) => {
        inputRefs.current[i] = el;
      }}
      value={draft.title}
      onChange={(e) => handleTitleChange(i, e.target.value)}
      onFocus={() => setFocusedIndex(i)}
      onBlur={handleTitleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) create(i, true);
        if (e.key === 'Escape') updateDraft(i, { title: '' });
      }}
      placeholder={placeholder}
      className="h-7 flex-1 min-w-32 border-0 bg-transparent px-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/50"
    />
  );

  const assigneePicker = (draft: AddTaskDraft, i: number) => (
    <AssigneeSelect
      value={draft.assignedTo ?? ''}
      onSelect={(id) => {
        if (!id) {
          updateDraft(i, { assignedTo: null, grantAssigneeId: undefined, grants: undefined });
          return;
        }
        onAssignRequested(id, listId, (grants) => {
          updateDraft(i, { assignedTo: id, grantAssigneeId: id, grants });
        });
      }}
      collaborators={collaborators}
      isAdmin={isAdmin}
      organizationId={organizationId}
      listId={listId}
    />
  );

  const duePicker = (draft: AddTaskDraft, i: number) => (
    <DueDatePicker
      dueDate={draft.dueDate}
      dueTime={draft.dueTime}
      overdue={false}
      onSave={(date, time) => updateDraft(i, { dueDate: date, dueTime: time })}
    />
  );

  const priorityPicker = (draft: AddTaskDraft, i: number) => (
    <PriorityPicker
      value={draft.priority ?? (priorities[0]?.key ?? 'medium')}
      onSelect={(p) => updateDraft(i, { priority: p })}
      priorities={priorities}
    />
  );

  if (variant === 'card') {
    return (
      <>
        {drafts.map((draft, i) => {
          const active = focusedIndex === i || draft.title.trim().length > 0;
          return (
            <div key={i} data-add-draft className="border-b">
              <div
                className="flex flex-wrap items-center gap-2 py-1.5"
                style={{ marginLeft: `${depth * 24}px` }}
              >
                <span className="inline-flex w-4 shrink-0 items-center justify-center">
                  <Plus className="size-4 text-muted-foreground/60" />
                </span>
                {titleInput(draft, i)}
                {active && (
                  <>
                    {assigneePicker(draft, i)}
                    {duePicker(draft, i)}
                    {priorityPicker(draft, i)}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      {drafts.map((draft, i) => {
        const active = focusedIndex === i || draft.title.trim().length > 0;
        return (
          <TableRow key={i} data-add-draft className="group border-b hover:bg-muted/40">
            <TableCell className="min-w-[300px]">
              <div className="flex items-center gap-2 px-2 py-1" style={{ paddingLeft: `${8 + depth * 24}px` }}>
                <span className="inline-flex w-4 shrink-0 items-center justify-center">
                  <Plus className="size-4 text-muted-foreground/60" />
                </span>
                {titleInput(draft, i)}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-center">{active && assigneePicker(draft, i)}</div>
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-center">{active && duePicker(draft, i)}</div>
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-center">{active && priorityPicker(draft, i)}</div>
            </TableCell>
            <TableCell />
            <TableCell />
          </TableRow>
        );
      })}
    </>
  );
}

function TaskNode({
  task,
  depth,
  childTasksByParent,
  notesCount,
  collaborators,
  expandedTasks,
  toggleExpand,
  showAddRows,
  onAddTask,
  listPath,
  onUpdateTask,
  onDeleteTask,
  statuses,
  priorities,
  isAdmin,
  canWrite,
  canManageList,
  currentUserId,
  organizationId,
  listId,
  onAssignRequested,
  variant = 'table',
  groupKey,
  canReorder,
  dragTaskId,
  dragDrop,
  onStartTaskDrag,
  onTaskFocus,
}: {
  task: Task;
  depth: number;
  childTasksByParent: Record<string, Task[]>;
  notesCount: Record<string, number>;
  collaborators: Profile[];
  expandedTasks: Set<string>;
  toggleExpand: (id: string) => void;
  showAddRows: boolean;
  onAddTask: (input: QuickAddInput) => void;
  listPath: string;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onDeleteTask: (id: string) => Promise<void>;
  statuses: StatusDef[];
  priorities: PriorityDef[];
  isAdmin: boolean;
  canWrite: boolean;
  canManageList: boolean;
  currentUserId: string | null;
  organizationId: string | null;
  listId: string | null;
  onAssignRequested: AssignRequestHandler;
  variant?: 'table' | 'card';
  groupKey?: string;
  canReorder?: boolean;
  dragTaskId?: string | null;
  dragDrop?: TaskDropTarget | null;
  onStartTaskDrag?: (id: string, x: number, y: number) => void;
  onTaskFocus?: (id: string) => void;
}) {
  const childTasks = childTasksByParent[task.id] || [];
  const hasChildren = childTasks.length > 0;
  const isExpanded = expandedTasks.has(task.id);
  const pending = task.id.startsWith('temp-');
  const reorderable = canReorder && variant === 'table' && !pending;
  const overdue = task.due_date ? isOverdue(task.due_date, task.due_time) : false;
  const comments = notesCount[task.id] || 0;
  const childCount = countDescendants(task, childTasksByParent);
  const href = listPath ? `${listPath}/tarea/${shortUid(task.id)}` : `/proyectos/${shortUid(task.id)}`;
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const titleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { formatHora } = useFormatoHora();

  useEffect(() => () => {
    if (titleClickTimer.current) clearTimeout(titleClickTimer.current);
  }, []);

  const commit = (field: EditableField, value: string) => {
    setEditing(null);
    if (field === 'title' && !value.trim()) return;
    const current = getFieldValue(task, field);
    if (value === current) return;
    onUpdateTask(task.id, { [field]: value || null } as Partial<Task>);
  };

  const cancel = () => {
    setEditing(null);
  };

  const startTextEdit = (field: EditableField) => {
    setEditing(field);
  };

  const optionsMenu = (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) onTaskFocus?.(task.id);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          className="text-muted-foreground transition-colors hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
          title="Opciones de la tarea"
          aria-label={`Opciones de ${task.title}`}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          <span className="block truncate">{task.title}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(href)}>
          <Pencil className="size-4" />
          <span>Editar</span>
        </DropdownMenuItem>
        {canWrite && (
          <>
            <DropdownMenuItem onClick={() => startTextEdit('title')}>
              <Tag className="size-4" />
              <span>Editar título</span>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Tag className="size-4" />
                <span>Estado</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                {statuses.map((s) => (
                  <DropdownMenuItem
                    key={s.key}
                    onClick={() => commit('status', s.key)}
                    className="justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                    {task.status === s.key && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Flag className="size-4" />
                <span>Prioridad</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {priorities.map((p) => (
                  <DropdownMenuItem
                    key={p.key}
                    onClick={() => commit('priority', p.key)}
                    className="justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.label}
                    </span>
                    {task.priority === p.key && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <User className="size-4" />
                <span>Asignar a</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                <DropdownMenuItem
                  onClick={() => {
                    if (task.assigned_to) commit('assigned_to', '');
                  }}
                  className="justify-between"
                >
                  <span>Sin asignar</span>
                  {!task.assigned_to && <Check className="size-4 text-primary" />}
                </DropdownMenuItem>
                {collaborators.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => {
                      if (c.id === task.assigned_to) return;
                      onAssignRequested(c.id, task.list_id, () => {
                        commit('assigned_to', c.id);
                      });
                    }}
                    className="justify-between"
                  >
                    <span className="truncate">{c.full_name}</span>
                    {task.assigned_to === c.id && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CalendarDays className="size-4" />
                <span>Fecha límite</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-60">
                <div className="space-y-2 p-1">
                  <Input
                    type="date"
                    defaultValue={task.due_date ?? ''}
                    onChange={(e) =>
                      onUpdateTask(task.id, { due_date: e.target.value || null })
                    }
                    className="h-8"
                  />
                  <Input
                    type="time"
                    defaultValue={task.due_time ?? ''}
                    onChange={(e) =>
                      onUpdateTask(task.id, { due_time: e.target.value || null })
                    }
                    className="h-8"
                  />
                  {task.due_date && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-full text-xs"
                      onClick={() =>
                        onUpdateTask(task.id, { due_date: null, due_time: null })
                      }
                    >
                      Quitar fecha
                    </Button>
                  )}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(href)}>
          <ExternalLink className="size-4" />
          <span>Ver detalles</span>
        </DropdownMenuItem>
        {canWrite && (canManageList || task.created_by === currentUserId) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              <span>Eliminar tarea</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const confirmDialog = (
    <ConfirmDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      title={`Eliminar "${task.title}"`}
      description={
        hasChildren && childCount > 0
          ? `Se eliminará la tarea y sus ${childCount} sub-tarea(s). Esta acción no se puede deshacer.`
          : 'La tarea se eliminará definitivamente. Esta acción no se puede deshacer.'
      }
      confirmLabel="Eliminar"
      loading={deleting}
      onConfirm={async () => {
        setDeleting(true);
        await onDeleteTask(task.id);
        setDeleting(false);
        setDeleteOpen(false);
      }}
    />
  );

  const titleLink = editing === 'title' ? (
    <Input
      autoFocus
      defaultValue={task.title}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit('title', (e.target as HTMLInputElement).value);
        if (e.key === 'Escape') cancel();
      }}
      onBlur={(e) => commit('title', e.target.value)}
      className="h-7 flex-1 text-sm"
    />
  ) : pending ? (
    <span
      className="flex-1 cursor-default truncate text-sm font-medium text-muted-foreground"
      title={task.title}
    >
      {task.title}
    </span>
  ) : (
    <Link
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (titleClickTimer.current) clearTimeout(titleClickTimer.current);
        titleClickTimer.current = setTimeout(() => router.push(href), 250);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        if (titleClickTimer.current) clearTimeout(titleClickTimer.current);
        if (canWrite) startTextEdit('title');
      }}
      className="flex-1 truncate text-sm font-medium hover:underline"
      title={task.title}
    >
      {task.title}
    </Link>
  );

  const childCountBadge = hasChildren && childCount > 0 && (
    <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
      {childCount}
    </span>
  );

  const expandToggle = (
    <button
      onClick={() => toggleExpand(task.id)}
      className="text-muted-foreground transition-colors hover:text-foreground"
      title={isExpanded ? 'Colapsar' : 'Expandir'}
      aria-expanded={isExpanded}
    >
      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
    </button>
  );

  if (variant === 'card') {
    const indent = { marginLeft: `${depth * 20}px` } as const;
    return (
      <div
        data-task-row={canReorder ? '1' : undefined}
        data-task-id={canReorder ? task.id : undefined}
        data-parent-id={canReorder ? (task.parent_task_id ?? '') : undefined}
        data-group={canReorder ? groupKey : undefined}
        className={cn(
          'border-b px-3 py-2',
          dragTaskId === task.id && 'opacity-40',
          dragDrop?.kind === 'reorder' &&
            dragDrop.rowId === task.id &&
            (dragDrop.place === 'before'
              ? 'shadow-[inset_0_2px_0_0_var(--primary)]'
              : 'shadow-[inset_0_-2px_0_0_var(--primary)]'),
          dragDrop?.kind === 'nest' &&
            dragDrop.targetId === task.id &&
            'ring-2 ring-primary/70 bg-primary/5'
        )}
      >
        <div className="flex items-center gap-2" style={indent}>
          {reorderable && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStartTaskDrag?.(task.id, e.clientX, e.clientY);
              }}
              title="Arrastrar para reordenar"
              aria-label="Reordenar tarea"
              className="cursor-grab touch-none text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </button>
          )}
          <span className="inline-flex w-4 shrink-0 items-center justify-center">
            {expandToggle}
          </span>
          {titleLink}
          {childCountBadge}
          {!pending && optionsMenu}
        </div>
        {dragDrop?.kind === 'nest' && dragDrop.targetId === task.id && (
          <div
            className="mt-1 flex items-center gap-2 rounded-md border-2 border-dashed border-primary/50 bg-primary/5 px-3 py-1.5 text-xs text-primary"
            style={{ marginLeft: `${(depth + 1) * 20}px` }}
          >
            <GripVertical className="size-3.5" />
            Soltar aquí para anidar la tarea
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" style={indent}>
          <AssigneeSelect
            value={task.assigned_to ?? ''}
            onSelect={(v) => {
              if (v === '') {
                commit('assigned_to', '');
                return;
              }
              onAssignRequested(v, task.list_id, () => {
                commit('assigned_to', v);
              });
            }}
            collaborators={collaborators}
            isAdmin={isAdmin && canWrite}
            organizationId={organizationId}
            listId={task.list_id ?? listId}
            readOnly={!canWrite}
          />
          {canWrite ? (
            <DueDatePicker
              dueDate={task.due_date}
              dueTime={task.due_time}
              overdue={overdue}
              onSave={(date, time) => {
                if (date === task.due_date && time === task.due_time) return;
                onUpdateTask(task.id, { due_date: date, due_time: time });
              }}
            />
          ) : (
            <span className="text-muted-foreground text-xs">
              {task.due_date ? (
                <>
                  {formatShortDate(task.due_date)}
                  {task.due_time ? ` ${formatHora(task.due_time)}` : ''}
                </>
              ) : (
                '—'
              )}
            </span>
          )}
          {canWrite ? (
            <PriorityPicker
              value={task.priority}
              onSelect={(v) => commit('priority', v)}
              priorities={priorities}
            />
          ) : (
            <span className="text-muted-foreground text-xs">
              {priorities.find((p) => p.key === task.priority)?.label ?? task.priority}
            </span>
          )}
          {canWrite ? (
            <StatusPicker
              value={task.status}
              onSelect={(v) => commit('status', v)}
              statuses={statuses}
            />
          ) : (
            <span className="text-muted-foreground text-xs">
              {statuses.find((s) => s.key === task.status)?.label ?? task.status}
            </span>
          )}
          <NotesPopover taskId={task.id} count={comments} href={pending ? '' : href} />
        </div>
        {confirmDialog}
        {isExpanded && childTasks.map((child) => (
          <TaskNode
            key={child.id}
            task={child}
            depth={depth + 1}
            childTasksByParent={childTasksByParent}
            notesCount={notesCount}
            collaborators={collaborators}
            expandedTasks={expandedTasks}
            toggleExpand={toggleExpand}
            showAddRows={showAddRows}
            onAddTask={onAddTask}
            listPath={listPath}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
            statuses={statuses}
            priorities={priorities}
            isAdmin={isAdmin}
            canWrite={canWrite}
            canManageList={canManageList}
            currentUserId={currentUserId}
            organizationId={organizationId}
            listId={listId}
            onAssignRequested={onAssignRequested}
            variant="card"
            groupKey={groupKey}
            canReorder={canReorder}
            dragTaskId={dragTaskId}
            dragDrop={dragDrop}
            onStartTaskDrag={onStartTaskDrag}
            onTaskFocus={onTaskFocus}
          />
        ))}
        {isExpanded && showAddRows && canWrite && (
          <AddTaskRow
            depth={depth + 1}
            parentId={task.id}
            onAdd={onAddTask}
            placeholder="Agregar sub-tarea"
            variant="card"
            collaborators={collaborators}
            priorities={priorities}
            isAdmin={isAdmin}
            organizationId={organizationId}
            listId={listId}
            onAssignRequested={onAssignRequested}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <TableRow
        data-task-row={variant === 'table' ? '1' : undefined}
        data-task-id={variant === 'table' ? task.id : undefined}
        data-parent-id={variant === 'table' ? (task.parent_task_id ?? '') : undefined}
        data-group={variant === 'table' ? groupKey : undefined}
        className={cn(
          'group border-b hover:bg-muted/40',
          dragTaskId === task.id && 'opacity-40',
          dragDrop?.kind === 'reorder' &&
            dragDrop.rowId === task.id &&
            (dragDrop.place === 'before'
              ? 'shadow-[inset_0_2px_0_0_var(--primary)]'
              : 'shadow-[inset_0_-2px_0_0_var(--primary)]'),
          dragDrop?.kind === 'nest' &&
            dragDrop.targetId === task.id &&
            'ring-2 ring-primary/70 bg-primary/5'
        )}
      >
        <TableCell className="min-w-[300px]">
          <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 24}px` }}>
            {reorderable && (
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStartTaskDrag?.(task.id, e.clientX, e.clientY);
                }}
                title="Arrastrar para reordenar"
                aria-label="Reordenar tarea"
                className="cursor-grab touch-none text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
              >
                <GripVertical className="size-3.5" />
              </button>
            )}
            <span className="inline-flex w-4 shrink-0 items-center justify-center">
              {expandToggle}
            </span>
            {titleLink}
            {childCountBadge}
            {!pending && optionsMenu}
            {confirmDialog}
          </div>
        </TableCell>
        <TableCell className="text-center">
          <AssigneeSelect
            value={task.assigned_to ?? ''}
            onSelect={(v) => {
              if (v === '') {
                commit('assigned_to', '');
                return;
              }
              onAssignRequested(v, task.list_id, () => {
                commit('assigned_to', v);
              });
            }}
            collaborators={collaborators}
            isAdmin={isAdmin && canWrite}
            organizationId={organizationId}
            listId={task.list_id ?? listId}
            readOnly={!canWrite}
          />
        </TableCell>
        <TableCell className="text-center">
          {canWrite ? (
            <DueDatePicker
              dueDate={task.due_date}
              dueTime={task.due_time}
              overdue={overdue}
              onSave={(date, time) => {
                if (date === task.due_date && time === task.due_time) return;
                onUpdateTask(task.id, { due_date: date, due_time: time });
              }}
            />
          ) : (
            <span className="text-muted-foreground text-xs">
              {task.due_date ? (
                <>
                  {formatShortDate(task.due_date)}
                  {task.due_time ? ` ${formatHora(task.due_time)}` : ''}
                </>
              ) : (
                '—'
              )}
            </span>
          )}
        </TableCell>
        <TableCell className="text-center">
          {canWrite ? (
            <PriorityPicker
              value={task.priority}
              onSelect={(v) => commit('priority', v)}
              priorities={priorities}
            />
          ) : (
            <span className="text-muted-foreground text-xs">
              {priorities.find((p) => p.key === task.priority)?.label ?? task.priority}
            </span>
          )}
        </TableCell>
        <TableCell className="text-center">
          {canWrite ? (
            <StatusPicker
              value={task.status}
              onSelect={(v) => commit('status', v)}
              statuses={statuses}
            />
          ) : (
            <span className="text-muted-foreground text-xs">
              {statuses.find((s) => s.key === task.status)?.label ?? task.status}
            </span>
          )}
        </TableCell>
        <TableCell className="text-center">
          <div className="flex items-center justify-center gap-1">
            <NotesPopover taskId={task.id} count={comments} href={pending ? '' : href} />
          </div>
        </TableCell>
      </TableRow>
      {dragDrop?.kind === 'nest' && dragDrop.targetId === task.id && (
        <tr>
          <td colSpan={6} className="px-3 py-1">
            <div
              className="flex items-center gap-2 rounded-md border-2 border-dashed border-primary/50 bg-primary/5 px-3 py-1.5 text-xs text-primary"
              style={{ marginLeft: `${(depth + 1) * 24}px` }}
            >
              <GripVertical className="size-3.5" />
              Soltar aquí para anidar la tarea
            </div>
          </td>
        </tr>
      )}
      {isExpanded && childTasks.map((child) => (
        <TaskNode
          key={child.id}
          task={child}
          depth={depth + 1}
          childTasksByParent={childTasksByParent}
          notesCount={notesCount}
          collaborators={collaborators}
          expandedTasks={expandedTasks}
          toggleExpand={toggleExpand}
          showAddRows={showAddRows}
          onAddTask={onAddTask}
          listPath={listPath}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          statuses={statuses}
          priorities={priorities}
          isAdmin={isAdmin}
          canWrite={canWrite}
          canManageList={canManageList}
          currentUserId={currentUserId}
          organizationId={organizationId}
          listId={listId}
          onAssignRequested={onAssignRequested}
          groupKey={groupKey}
          canReorder={canReorder}
          dragTaskId={dragTaskId}
          dragDrop={dragDrop}
          onStartTaskDrag={onStartTaskDrag}
          onTaskFocus={onTaskFocus}
        />
      ))}
      {isExpanded && showAddRows && canWrite && (
        <AddTaskRow
          depth={depth + 1}
          parentId={task.id}
          onAdd={onAddTask}
          placeholder="Agregar sub-tarea"
          collaborators={collaborators}
          priorities={priorities}
          isAdmin={isAdmin}
          organizationId={organizationId}
          listId={listId}
          onAssignRequested={onAssignRequested}
        />
      )}
    </>
  );
}

export function TaskList({
  tasks,
  childTasksByParent,
  notesCount,
  collaborators,
  expandedTasks,
  toggleExpand,
  showAddRows,
  onAddTask,
  sortBy,
  onSort,
  listPath,
  showDoneCancelled,
  groupBy,
  onUpdateTask,
  onDeleteTask,
  statuses,
  priorities,
  isAdmin,
  canWrite,
  canManageList,
  currentUserId,
  organizationId,
  listId,
  onAssignRequested,
  canReorder,
  dragTaskId,
  dragDrop,
  onTaskDragStart,
  onTaskDragOver,
  onTaskDragEnd,
  onTaskFocus,
}: {
  tasks: Task[];
  childTasksByParent: Record<string, Task[]>;
  notesCount: Record<string, number>;
  collaborators: Profile[];
  expandedTasks: Set<string>;
  toggleExpand: (id: string) => void;
  showAddRows: boolean;
  onAddTask: (input: QuickAddInput) => void;
  sortBy: string;
  onSort: (key: SortKey) => void;
  listPath: string;
  showDoneCancelled: boolean;
  groupBy: 'status' | 'assignee';
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onDeleteTask: (id: string) => Promise<void>;
  statuses: StatusDef[];
  priorities: PriorityDef[];
  isAdmin: boolean;
  canWrite: boolean;
  canManageList: boolean;
  currentUserId: string | null;
  organizationId: string | null;
  listId: string | null;
  onAssignRequested: AssignRequestHandler;
  canReorder?: boolean;
  dragTaskId?: string | null;
  dragDrop?: TaskDropTarget | null;
  onTaskDragStart?: (id: string) => void;
  onTaskDragOver?: (drop: TaskDropTarget | null) => void;
  onTaskDragEnd?: () => void;
  onTaskFocus?: (id: string) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const draggingRef = useRef(false);
  const hoverKeyRef = useRef<string | null>(null);
  const nestActiveRef = useRef<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const ghostStartRef = useRef({ x: 0, y: 0 });

  const startTaskDrag = (id: string, x: number, y: number) => {
    if (!canReorder) return;
    draggingRef.current = true;
    ghostStartRef.current = { x, y };
    onTaskDragStart?.(id);
  };

  useLayoutEffect(() => {
    if (!dragTaskId || !ghostElRef.current) return;
    ghostElRef.current.style.transform = `translate(${ghostStartRef.current.x + 14}px, ${ghostStartRef.current.y + 10}px)`;
  }, [dragTaskId]);

  const nextSiblingId = (row: HTMLElement): string | null => {
    const parentId = row.dataset.parentId ?? '';
    let el = row.nextElementSibling as HTMLElement | null;
    while (el) {
      if (el.matches('[data-task-row]') && (el.dataset.parentId ?? '') === parentId) {
        return el.dataset.taskId ?? null;
      }
      el = el.nextElementSibling as HTMLElement | null;
    }
    return null;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      if (ghostElRef.current) {
        ghostElRef.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest?.('[data-task-row]') as HTMLElement | null;
      const key = row?.dataset.taskId ?? null;
      if (key !== hoverKeyRef.current) {
        hoverKeyRef.current = key;
        nestActiveRef.current = null;
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        if (key) {
          hoverTimerRef.current = setTimeout(() => {
            if (hoverKeyRef.current !== key) return;
            nestActiveRef.current = key;
            onTaskDragOver?.({ kind: 'nest', targetId: key });
          }, 2000);
        }
      }
      if (nestActiveRef.current === key) return;
      if (!row || !row.dataset.taskId) {
        onTaskDragOver?.(null);
        return;
      }
      const r = row.getBoundingClientRect();
      const frac = (e.clientY - r.top) / r.height;
      const parentId = row.dataset.parentId === '' ? null : (row.dataset.parentId ?? null);
      const place: 'before' | 'after' = frac < 0.5 ? 'before' : 'after';
      const beforeId = frac < 0.5 ? row.dataset.taskId : nextSiblingId(row);
      onTaskDragOver?.({
        kind: 'reorder',
        rowId: row.dataset.taskId,
        parentId,
        beforeId,
        place,
      });
    };
    const up = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      hoverKeyRef.current = null;
      nestActiveRef.current = null;
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      onTaskDragEnd?.();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, [onTaskDragOver, onTaskDragEnd]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  type Group = {
    key: string;
    mode: 'status' | 'assignee';
    status?: TaskStatus;
    tasks: Task[];
    count: number;
  };

  const groups = useMemo<Group[]>(() => {
    const hidden = showDoneCancelled ? new Set<string>() : hiddenStatuses(statuses);
    if (groupBy === 'assignee') {
      const map: Record<string, Task[]> = {};
      tasks.forEach((task) => {
        if (hidden.has(task.status)) return;
        const key = task.assigned_to ?? 'unassigned';
        if (!map[key]) map[key] = [];
        map[key].push(task);
      });
      const nameOf = (id: string) => {
        if (id === 'unassigned') return '';
        return collaborators.find((c) => c.id === id)?.full_name || id;
      };
      return Object.entries(map)
        .sort(([a], [b]) => {
          const aU = a === 'unassigned';
          const bU = b === 'unassigned';
          if (aU && bU) return 0;
          if (aU) return 1;
          if (bU) return -1;
          return nameOf(a).localeCompare(nameOf(b));
        })
        .map(([key, groupTasks]) => ({ key, mode: 'assignee' as const, tasks: groupTasks, count: groupTasks.length }));
    }
    const map: Record<string, Task[]> = {};
    tasks.forEach((task) => {
      if (!map[task.status]) map[task.status] = [];
      map[task.status].push(task);
    });
    return statuses
      .filter((s) => map[s.key]?.length > 0 && !hidden.has(s.key))
      .map((s) => ({
        key: s.key,
        mode: 'status' as const,
        status: s.key,
        tasks: map[s.key],
        count: map[s.key].length,
      }));
  }, [tasks, showDoneCancelled, groupBy, collaborators, statuses]);

  if (groups.length === 0) {
    return (
      <div className="rounded-md border">
        <div className="md:hidden">
          <div className="px-3 py-2">
            <p className="mb-2 text-xs text-muted-foreground">
              No hay tareas en esta vista.
            </p>
          </div>
{showAddRows && canWrite && (
            <AddTaskRow
 depth={0}
              parentId={null}
              onAdd={onAddTask}
              placeholder="Agregar tarea"
              variant="card"
              collaborators={collaborators}
              priorities={priorities}
              isAdmin={isAdmin}
              organizationId={organizationId}
              listId={listId}
              onAssignRequested={onAssignRequested}
            />
          )}
        </div>
      <div className="hidden md:block">
          <Table>
            <colgroup>
              <col style={{ minWidth: 320 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <tbody className="[&_tr:last-child]:border-0">
              <TableRow className="border-b text-xs text-muted-foreground">
                {COLUMNS.map((col) => (
                  <TableCell
                    key={col.label}
                    className={cn(
                      'py-2',
                      col.key ? 'cursor-pointer hover:text-foreground' : '',
                      col.label === 'Nombre' ? 'pl-2 text-left' : 'text-center'
                    )}
                    onClick={() => col.key && onSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.key && (
                        <ArrowUpDown
                          className={cn(
                            'size-3 transition-opacity',
                            sortBy === col.key ? 'opacity-100' : 'opacity-40'
                          )}
                        />
                      )}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
              <AddTaskRow
                depth={0}
                parentId={null}
                onAdd={onAddTask}
                placeholder="Agregar tarea"
                collaborators={collaborators}
                priorities={priorities}
                isAdmin={isAdmin}
                organizationId={organizationId}
                listId={listId}
                onAssignRequested={onAssignRequested}
              />
            </tbody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ key, mode, status, tasks: groupTasks, count }) => {
        const isCollapsed = collapsedGroups.has(key);
        const assignee = mode === 'assignee' && key !== 'unassigned'
          ? collaborators.find((c) => c.id === key) ?? null
          : null;
        const av = assignee ? avatarColor(assignee.id) : null;
        const initials = assignee ? getInitials(assignee.full_name) : '';
        const statusDef = mode === 'status' && status
          ? statuses.find((s) => s.key === status) || { key: status, label: status, color: '#6b7280' }
          : null;

        const groupHeader = (
          <button
            onClick={() => toggleGroup(key)}
            className="flex items-center gap-2"
            aria-expanded={!isCollapsed}
          >
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                isCollapsed && '-rotate-90'
              )}
            />
            {statusDef ? (
              <Badge
                variant="outline"
                className="gap-1.5 px-2 py-1 text-sm font-medium"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: statusDef.color }}
                  aria-hidden
                />
                <StatusIcon status={statusDef.key} className="size-4 text-muted-foreground" />
                {statusDef.label}
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0 text-xs font-medium tabular-nums">
                  {count}
                </span>
              </Badge>
            ) : (
              <Badge
                className="gap-1.5 border px-2 py-1 text-sm font-medium"
                style={av ? { backgroundColor: av.bg, color: av.text, borderColor: av.border } : undefined}
              >
                {assignee ? (
                  <span
                    className="inline-flex size-5 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ backgroundColor: av?.bg, color: av?.text }}
                  >
                    {initials}
                  </span>
                ) : (
                  <User className="size-4 text-muted-foreground" />
                )}
                {assignee ? assignee.full_name : 'Sin asignar'}
                <span className="ml-1 rounded-full bg-background px-1.5 py-0 text-xs font-medium tabular-nums">
                  {count}
                </span>
              </Badge>
            )}
          </button>
        );

        return (
          <div key={key} className="rounded-md border">
            {/* Mobile card layout */}
            <div className="md:hidden">
              <div className="border-b bg-muted/20 px-3 py-2">
                {groupHeader}
              </div>
              {!isCollapsed && (
                <>
                  {groupTasks.map((task) => (
                    <TaskNode
                      key={task.id}
                      task={task}
                      depth={0}
                      childTasksByParent={childTasksByParent}
                      notesCount={notesCount}
                      collaborators={collaborators}
                      expandedTasks={expandedTasks}
                      toggleExpand={toggleExpand}
                      showAddRows={showAddRows}
                      onAddTask={onAddTask}
                      listPath={listPath}
                      onUpdateTask={onUpdateTask}
                      onDeleteTask={onDeleteTask}
                      statuses={statuses}
                      priorities={priorities}
                      isAdmin={isAdmin}
                      canWrite={canWrite}
                      canManageList={canManageList}
                      currentUserId={currentUserId}
                      organizationId={organizationId}
                      listId={listId}
                      onAssignRequested={onAssignRequested}
                      variant="card"
                      groupKey={key}
                      canReorder={canReorder}
                      dragTaskId={dragTaskId}
                      dragDrop={dragDrop}
                      onStartTaskDrag={startTaskDrag}
                      onTaskFocus={onTaskFocus}
                    />
                  ))}
                  {showAddRows && canWrite && (
                    <AddTaskRow
                      depth={0}
                      parentId={null}
                      onAdd={onAddTask}
                      placeholder="Agregar tarea"
                      variant="card"
                      collaborators={collaborators}
                      priorities={priorities}
                      isAdmin={isAdmin}
                      organizationId={organizationId}
                      listId={listId}
                      onAssignRequested={onAssignRequested}
                    />
                  )}
                </>
              )}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <colgroup>
                  <col style={{ minWidth: 320 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 100 }} />
                </colgroup>
                <tbody className="[&_tr:last-child]:border-0">
                  <TableRow className="border-b bg-muted/20">
                    <TableCell colSpan={6} className="py-2">
                      {groupHeader}
                    </TableCell>
                  </TableRow>
                  {!isCollapsed && (
                    <>
                      <TableRow className="border-b text-xs text-muted-foreground">
                        {COLUMNS.map((col) => (
                          <TableCell
                            key={col.label}
                            className={cn(
                              'py-2',
                              col.key ? 'cursor-pointer hover:text-foreground' : '',
                              col.label === 'Nombre' ? 'pl-2 text-left' : 'text-center'
                            )}
                            onClick={() => col.key && onSort(col.key)}
                          >
                            <span className="inline-flex items-center gap-1">
                              {col.label}
                              {col.key && (
                                <ArrowUpDown
                                  className={cn(
                                    'size-3 transition-opacity',
                                    sortBy === col.key ? 'opacity-100' : 'opacity-40'
                                  )}
                                />
                              )}
                            </span>
                          </TableCell>
                        ))}
                      </TableRow>
                      {groupTasks.map((task) => (
                        <TaskNode
                          key={task.id}
                          task={task}
                          depth={0}
                          childTasksByParent={childTasksByParent}
                          notesCount={notesCount}
                          collaborators={collaborators}
                          expandedTasks={expandedTasks}
                          toggleExpand={toggleExpand}
                          showAddRows={showAddRows}
                          onAddTask={onAddTask}
                          listPath={listPath}
                          onUpdateTask={onUpdateTask}
                          onDeleteTask={onDeleteTask}
                          statuses={statuses}
                          priorities={priorities}
                          isAdmin={isAdmin}
                          canWrite={canWrite}
                          canManageList={canManageList}
                          currentUserId={currentUserId}
                          organizationId={organizationId}
                          listId={listId}
                          onAssignRequested={onAssignRequested}
                          groupKey={key}
                          canReorder={canReorder}
                          dragTaskId={dragTaskId}
                          dragDrop={dragDrop}
                          onStartTaskDrag={startTaskDrag}
                          onTaskFocus={onTaskFocus}
                        />
                      ))}
                      {showAddRows && canWrite && (
                        <AddTaskRow
                          depth={0}
                          parentId={null}
                          onAdd={onAddTask}
                          placeholder="Agregar tarea"
                          collaborators={collaborators}
                          priorities={priorities}
                          isAdmin={isAdmin}
                          organizationId={organizationId}
                          listId={listId}
                          onAssignRequested={onAssignRequested}
                        />
                      )}
                    </>
                  )}
                </tbody>
              </Table>
            </div>
          </div>
        );
      })}
      {canReorder && dragTaskId && (
        <div ref={ghostElRef} className="pointer-events-none fixed left-0 top-0 z-50" aria-hidden>
          <div className="drag-ghost-inner flex w-64 items-center gap-2.5 rounded-lg bg-card px-3 py-2 shadow-raised ring-1 ring-border/80">
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium text-foreground">
              {tasks.find((t) => t.id === dragTaskId)?.title ?? ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
