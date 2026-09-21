'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { api, apiFetch } from '@/lib/api/cliente';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Eye, EyeOff, CheckCircle2, XCircle, Users, Settings2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { TableSkeleton } from '@/components/ui/skeleton';
import { TaskList } from '@/components/tareas/task-list';
import { StatusConfigDialog } from '@/components/tareas/status-config-dialog';
import { FilterPopover } from '@/components/tareas/filter-popover';
import { avatarColor, getInitials } from '@/components/tareas/assignee-select';
import { useTareas } from '@/components/tareas/tareas-context';
import { cn } from '@/lib/utils';
import { ShareButton } from '@/components/tareas/share-entity-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { resolveStatuses, resolvePriorities, hiddenStatuses } from '@/lib/task-config';
import { friendlyTaskError } from '@/lib/task-errors';
import { saveAssignmentGrants } from '@/lib/auth/actions';
import { cacheGet, cacheSet } from '@/lib/cache';
import { aplicarEventoLista, leerEvento, parchearQuery } from '@/lib/realtime-cache';
import { useAssignAccess, type GrantDraft } from '@/components/tareas/assign-access-dialog';
import type { AccessTree } from '@/lib/access';
import type { Task, ProfilePreferences } from '@/types';
import type { QuickAddInput, SortKey, TaskDropTarget } from '@/components/tareas/task-list';

type BoardData = {
  tasks: Task[];
  notesCount: Record<string, number>;
  preferences: ProfilePreferences | null;
};

const PREFS_TTL_MS = 10 * 60 * 1000;

export function TaskBoard() {
  const ctx = useTareas();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notesCount, setNotesCount] = useState<Record<string, number>>({});
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('position');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAddRows, setShowAddRows] = useState(true);
  const [showDoneCancelled, setShowDoneCancelled] = useState(false);
  const [groupBy, setGroupBy] = useState<'status' | 'assignee'>('status');
  const [showConfig, setShowConfig] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragDrop, setDragDrop] = useState<TaskDropTarget | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [editingFocusedTitle, setEditingFocusedTitle] = useState(false);
  const dragTaskIdRef = useRef<string | null>(null);
  const dragDropRef = useRef<TaskDropTarget | null>(null);
  const dragOriginalTasksRef = useRef<Task[]>([]);
  const tasksRef = useRef<Task[]>(tasks);
  const prevTaskPositionsRef = useRef<Map<string, number> | null>(null);
  const selectedListIdRef = useRef<string | null>(null);
  const quickAddEnVueloRef = useRef<Set<string>>(new Set());

  const captureTaskPositions = useCallback(() => {
    const rows = document.querySelectorAll('[data-task-row]');
    const m = new Map<string, number>();
    rows.forEach((el) => {
      const id = (el as HTMLElement).dataset.taskId;
      if (id) m.set(id, (el as HTMLElement).getBoundingClientRect().top);
    });
    return m;
  }, []);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lectura SSR-safe de localStorage post-mount; patr�n can�nico (ver theme-toggle.tsx).
    setShowAddRows(localStorage.getItem('tasks-show-add-rows') !== 'false');
  }, []);

  const listId = ctx.selectedListId;

  useEffect(() => {
    selectedListIdRef.current = listId;
  }, [listId]);
  const organizationId = ctx.organizationId;
  const currentUserId = ctx.currentUserId;
  const collaborators = ctx.collaborators;
  const canManageList = !!listId && ctx.canManageEntity('list', listId);

  const tree: AccessTree = useMemo(
    () => ({
      workspaces: ctx.workspaces,
      folders: ctx.folders,
      lists: ctx.lists,
      documents: ctx.documents,
      mindmaps: ctx.mindmaps,
      todos: ctx.todos,
      formularios: ctx.formularios,
    }),
    [ctx.workspaces, ctx.folders, ctx.lists, ctx.documents, ctx.mindmaps, ctx.todos, ctx.formularios]
  );
  const { openAssignAccess, dialog: assignAccessDialog } = useAssignAccess(tree);

  const saveGrants = async (assigneeId: string, grants: GrantDraft[]) => {
    if (grants.length === 0) return;
    const res = await saveAssignmentGrants({ assigneeId, mainListId: listId, grants });
    if (res?.error) {
      toast.error(res.error);
    } else if (res?.note) {
      toast.info(res.note);
    }
  };

  const handleAssignRequest = (
    assigneeId: string,
    taskListId: string | null,
    onAccepted: (grants: GrantDraft[]) => void
  ) => {
    const assignee = collaborators.find((c) => c.id === assigneeId);
    if (!assignee) {
      onAccepted([]);
      return;
    }
    openAssignAccess(assignee, taskListId, (grants) => {
      onAccepted(grants);
      void saveGrants(assigneeId, grants);
    });
  };

  const queryClient = useQueryClient();
  const boardQuery = useQuery({
    queryKey: ['board', 'tareas', listId, organizationId, currentUserId],
    queryFn: async (): Promise<BoardData | null> => {
      const userId = currentUserId;
      if (!userId || !organizationId || !listId) return null;
      let loadedTasks: Task[] = [];
      try {
        const res = await apiFetch<{ tasks: Task[] }>(
          `/tareas?list_id=${encodeURIComponent(listId)}&organization_id=${encodeURIComponent(organizationId)}`
        );
        loadedTasks = res.tasks;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las tareas');
        throw e;
      }

      const taskIds = loadedTasks.map((t) => t.id);

      // Preferencias cacheadas (TTL 10min): evita 1 query por fetchData.
      let preferences: ProfilePreferences | null = null;
      const cachedPrefs = await cacheGet<ProfilePreferences>(`cs:prefs:v1:${userId}`, PREFS_TTL_MS);
      if (cachedPrefs) {
        preferences = cachedPrefs.value;
      } else {
        try {
          const res = await apiFetch<{ preferences: ProfilePreferences | null }>('/perfil/preferencias');
          preferences = res.preferences;
          if (res.preferences) void cacheSet(`cs:prefs:v1:${userId}`, res.preferences);
        } catch {
          // sin preferencias: defaults
        }
      }

      let notesCountMap: Record<string, number> = {};
      if (taskIds.length > 0) {
        try {
          const res = await apiFetch<{ notas: Record<string, number> }>(
            `/tareas/conteo-notas?task_ids=${encodeURIComponent(taskIds.join(','))}`
          );
          notesCountMap = res.notas;
        } catch {
          // sin conteo de notas
        }
      }

      return { tasks: loadedTasks, notesCount: notesCountMap, preferences };
    },
    enabled: !!listId && !!organizationId && !!currentUserId,
    staleTime: 30_000,
    // Red de seguridad: si el realtime falla, al volver a la lista siempre se
    // traen datos frescos en vez de servir caché hasta 30s.
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    const data = boardQuery.data;
    if (!data) return;
    setTasks(data.tasks);
    setNotesCount(data.notesCount);
    setShowDoneCancelled(Boolean(data.preferences?.show_done_cancelled));
    setLoading(false);
  }, [boardQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const invalidarBoard = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['board', 'tareas', listId, organizationId, currentUserId] });
  }, [queryClient, listId, organizationId, currentUserId]);

  // Aplica el evento a la caché del board (la UI cambia al instante). Los
  // eventos sin data local o desconocidos caen a invalidación clásica.
  const aplicarEventoTasks = useCallback(
    (payload: unknown) => {
      const evt = leerEvento<Record<string, unknown>>(payload);
      if (!evt || evt.table !== 'tasks') {
        invalidarBoard();
        return;
      }
      let aplicado = false;
      parchearQuery<BoardData>(
        queryClient,
        ['board', 'tareas', listId, organizationId, currentUserId],
        (data) => {
          const r = aplicarEventoLista<Task>(data.tasks, evt, (previo, nuevo) => ({
            ...previo,
            ...nuevo,
            assigned_profile: nuevo.assigned_profile ?? previo.assigned_profile,
            shift: nuevo.shift ?? previo.shift,
          }));
          if (!r.aplicado || !r.lista) return data;
          aplicado = true;
          return { ...data, tasks: r.lista };
        }
      );
      if (aplicado && evt.eventType === 'INSERT') invalidarBoard();
      if (!aplicado) invalidarBoard();
    },
    [queryClient, listId, organizationId, currentUserId, invalidarBoard]
  );

  // Realtime: cambios en tareas de la lista y notas refrescan el board.
  // RLS aplica: solo llegan eventos de filas visibles para el usuario.
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!listId) return;
    const debouncedFetch = () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(invalidarBoard, 300);
    };
    const channel = canalRealtime(`board-live-${listId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `list_id=eq.${listId}` },
        aplicarEventoTasks
      )
      // Los DELETE no son filtrables: listener sin filtro que el SPA
      // resuelve por id contra las tareas cargadas.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tasks' },
        aplicarEventoTasks
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_notes' },
        debouncedFetch
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      removerCanal(channel);
    };
  }, [listId, invalidarBoard, aplicarEventoTasks]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleSort = (column: string) => {
    if (sortBy === column) setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(column as SortKey); setSortDirection('asc'); }
  };

  const handleQuickAdd = (input: QuickAddInput) => {
    if (!input.title.trim() || !organizationId || !listId) return;
    if (input.parentId && input.parentId.startsWith('temp-')) {
      toast.info('Espera a que la tarea se guarde para agregar sub-tareas');
      return;
    }
    const userId = currentUserId;
    if (!userId) return;
    const capturedListId = listId;
    const claveEnVuelo = `${capturedListId}:${input.title.trim().toLowerCase()}`;
    if (quickAddEnVueloRef.current.has(claveEnVuelo)) return;
    quickAddEnVueloRef.current.add(claveEnVuelo);

    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const status =
      input.status ??
      statuses.find((s) => !hiddenStatuses(statuses).has(s.key))?.key ??
      statuses[0]?.key ??
      'todo';
    const priority = input.priority ?? priorities[0]?.key ?? 'medium';

    const optimistic: Task = {
      id: tempId,
      organization_id: organizationId,
      parent_task_id: input.parentId,
      list_id: listId,
      title: input.title.trim(),
      description: null,
      status,
      priority,
      assigned_to: input.assigned_to ?? null,
      created_by: userId,
      shift_id: null,
      due_date: input.due_date,
      due_time: input.due_time,
      start_date: null,
      estimated_hours: null,
      position: tasksRef.current.reduce((m, t) => Math.max(m, t.position ?? 0), 0) + 1,
      status_position: tasksRef.current
        .filter((t) => t.status === status)
        .reduce((m, t) => Math.max(m, t.status_position ?? 0), 0) + 1,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };

    setTasks((prev) => [...prev, optimistic]);
    if (input.parentId) {
      setExpandedTasks((prev) => new Set(prev).add(input.parentId!));
    }

    void (async () => {
      try {
        const res = await api.post<{ tarea: Task }>('/tareas', {
          title: optimistic.title,
          status,
          priority,
          assigned_to: optimistic.assigned_to,
          due_date: optimistic.due_date,
          due_time: optimistic.due_time,
          parent_task_id: optimistic.parent_task_id,
          list_id: listId,
          organization_id: organizationId,
          created_by: userId,
          position: optimistic.position,
        });

        if (selectedListIdRef.current !== capturedListId) return;
        const created = res.tarea;
        setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
        if (input.grantAssigneeId && input.grants && input.grants.length > 0) {
          void saveGrants(input.grantAssigneeId, input.grants);
        }
      } catch (e) {
        if (selectedListIdRef.current !== capturedListId) return;
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        toast.error(friendlyTaskError(e instanceof Error ? e.message : 'No se pudo crear la tarea'));
      } finally {
        quickAddEnVueloRef.current.delete(claveEnVuelo);
      }
    })();
  };

  const handleUpdateTask = async (id: string, patch: Partial<Task>) => {
    if (id.startsWith('temp-')) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      return;
    }
    try {
      await api.patch(`/tareas/${id}`, patch);
    } catch (e) {
      toast.error(`No se pudo guardar la tarea: ${e instanceof Error ? e.message : 'error'}`);
      return;
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, ...patch, updated_at: new Date().toISOString() } : t
      )
    );
  };

  const handleDeleteTask = async (id: string) => {
    if (id.startsWith('temp-')) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    try {
      await api.delete(`/tareas/${id}`);
    } catch (e) {
      toast.error(`No se pudo eliminar la tarea: ${e instanceof Error ? e.message : 'error'}`);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const computeChildOrder = (
    fromId: string,
    parentId: string | null,
    beforeId: string | null,
    pool: Task[]
  ): string[] => {
    const children = pool
      .filter((t) => (t.parent_task_id ?? null) === parentId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const ids = children.map((t) => t.id).filter((x) => x !== fromId);
    if (beforeId) {
      const i = ids.indexOf(beforeId);
      if (i >= 0) ids.splice(i, 0, fromId);
      else ids.push(fromId);
    } else {
      ids.push(fromId);
    }
    return ids;
  };

  const applyTaskMove = (fromId: string, drop: TaskDropTarget) => {
    setTasks((prev) => {
      if (drop.kind === 'reorder') {
        const ids = computeChildOrder(fromId, drop.parentId, drop.beforeId, prev);
        const pos = new Map(ids.map((id, i) => [id, i]));
        return prev.map((t) => {
          if (t.id === fromId) {
            return {
              ...t,
              parent_task_id: drop.parentId,
              position: pos.get(fromId) ?? t.position,
            };
          }
          if ((t.parent_task_id ?? null) === drop.parentId) {
            return { ...t, position: pos.get(t.id) ?? t.position };
          }
          return t;
        });
      }
      if (drop.kind === 'nest') {
        let anc: string | null = drop.targetId;
        while (anc) {
          if (anc === fromId) return prev;
          const t = prev.find((x) => x.id === anc);
          anc = t?.parent_task_id ?? null;
        }
        const childCount = prev.filter((t) => t.parent_task_id === drop.targetId).length;
        return prev.map((t) =>
          t.id === fromId ? { ...t, parent_task_id: drop.targetId, position: childCount } : t
        );
      }
      return prev;
    });
  };

  const handleTaskDragStart = useCallback((fromId: string) => {
    dragTaskIdRef.current = fromId;
    dragDropRef.current = null;
    dragOriginalTasksRef.current = tasksRef.current;
    setDragTaskId(fromId);
    setDragDrop(null);
  }, []);

  const handleTaskDragOver = useCallback((drop: TaskDropTarget | null) => {
    dragDropRef.current = drop;
    setDragDrop(drop);
    const from = dragTaskIdRef.current;
    if (!from) return;
    if (!drop) {
      setTasks(dragOriginalTasksRef.current);
      return;
    }
    if (drop.kind === 'reorder') {
      prevTaskPositionsRef.current = captureTaskPositions();
    }
    applyTaskMove(from, drop);
  }, [captureTaskPositions]);

  useLayoutEffect(() => {
    const prev = prevTaskPositionsRef.current;
    if (!prev) return;
    const rows = Array.from(
      document.querySelectorAll('[data-task-row]')
    ) as HTMLElement[];
    const next = new Map<string, number>();
    rows.forEach((el) => {
      const id = el.dataset.taskId;
      if (id) next.set(id, el.getBoundingClientRect().top);
    });
    rows.forEach((el) => {
      const id = el.dataset.taskId;
      if (!id) return;
      const from = prev.get(id);
      const to = next.get(id);
      if (from === undefined || to === undefined || from === to) return;
      const dy = from - to;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      el.style.willChange = 'transform';
    });
    void document.body.offsetHeight;
    requestAnimationFrame(() => {
      rows.forEach((el) => {
        el.style.transition =
          'transform 220ms cubic-bezier(0.22, 0.8, 0.32, 1)';
        el.style.transform = '';
        el.style.willChange = '';
      });
    });
    prevTaskPositionsRef.current = next;
  }, [dragDrop]);

  const handleTaskDragEnd = useCallback(async () => {
    const from = dragTaskIdRef.current;
    const drop = dragDropRef.current;
    dragTaskIdRef.current = null;
    dragDropRef.current = null;
    setDragTaskId(null);
    setDragDrop(null);
    if (!from || !drop) return;
    const pool = dragOriginalTasksRef.current;
    const origTask = pool.find((x) => x.id === from);
    if (!origTask) return;
    let newParent: string | null;
    let beforeId: string | null;
    if (drop.kind === 'nest') {
      let anc: string | null = drop.targetId;
      let cycle = false;
      while (anc) {
        if (anc === from) {
          cycle = true;
          break;
        }
        const t = pool.find((x) => x.id === anc);
        anc = t?.parent_task_id ?? null;
      }
      if (cycle) {
        setTasks(pool);
        return;
      }
      newParent = drop.targetId;
      beforeId = null;
    } else {
      newParent = drop.parentId;
      beforeId = drop.beforeId;
    }
    const ids = computeChildOrder(from, newParent, beforeId, pool);
    const parentChanged = (origTask.parent_task_id ?? null) !== newParent;
    const updates = ids
      .map((id, idx) => {
        const t = pool.find((x) => x.id === id);
        if (t && t.position !== idx) return { id, position: idx };
        return null;
      })
      .filter((x): x is { id: string; position: number } => x !== null);
    try {
      await api.post('/tareas/reordenar', {
        ...(parentChanged ? { mover: from, parent_task_id: newParent } : {}),
        items: updates,
      });
    } catch (e) {
      toast.error(`No se pudo reordenar: ${e instanceof Error ? e.message : 'error'}`);
      setTasks(pool);
      return;
    }
    invalidarBoard();
  }, [invalidarBoard]);

  const toggleDoneCancelled = async () => {
    const next = !showDoneCancelled;
    setShowDoneCancelled(next);
    const userId = currentUserId;
    if (!userId) return;
    try {
      const res = await apiFetch<{ preferences: ProfilePreferences | null }>('/perfil/preferencias');
      const prefs = { ...(res.preferences || {}), show_done_cancelled: next };
      await api.put('/perfil/preferencias', { preferences: prefs });
      void cacheSet(`cs:prefs:v1:${userId}`, prefs);
    } catch {
      // best-effort
    }
  };

  const selectedList = ctx.lists.find((l) => l.id === listId) || null;
  const canEditList = selectedList ? ctx.canWrite('list', selectedList.id) : false;
  const focusedTask = focusedTaskId ? tasks.find((t) => t.id === focusedTaskId) || null : null;
  const statuses = resolveStatuses(selectedList?.statuses);
  const priorities = resolvePriorities(selectedList?.priorities);
  const inUseStatuses = new Set(tasks.map((t) => t.status));
  const inUsePriorities = new Set(tasks.map((t) => t.priority));

  const rootTasks = tasks.filter((t) => !t.parent_task_id);
  const childTasksByParent: Record<string, Task[]> = {};
  tasks.forEach((t) => {
    if (t.parent_task_id) {
      if (!childTasksByParent[t.parent_task_id]) childTasksByParent[t.parent_task_id] = [];
      childTasksByParent[t.parent_task_id].push(t);
    }
  });
  Object.values(childTasksByParent).forEach((arr) =>
    arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  );

  const filteredRootTasks = rootTasks.filter((t) => {
    if (debouncedSearch && !t.title.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterAssignee !== 'all' && t.assigned_to !== filterAssignee) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  }).sort((a, b) => {
    const cmp = (() => {
      switch (sortBy) {
        case 'position':
          return (a.position ?? 0) - (b.position ?? 0);
        case 'title':
          return a.title.localeCompare(b.title);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'priority': {
          const ord: Record<string, number> = {};
          priorities.forEach((p, i) => { ord[p.key] = i; });
          return (ord[a.priority] ?? 99) - (ord[b.priority] ?? 99);
        }
        case 'due_date':
          return (a.due_date || '').localeCompare(b.due_date || '');
        case 'assigned_to':
          return (a.assigned_profile?.full_name || '').localeCompare(b.assigned_profile?.full_name || '');
        case 'shift':
          return (a.shift?.name || '').localeCompare(b.shift?.name || '');
        case 'estimated_hours':
          return (a.estimated_hours || 0) - (b.estimated_hours || 0);
        default:
          return 0;
      }
    })();
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  if (loading || (listId === null && ctx.lists.length > 0)) {
    return <TableSkeleton rows={5} cols={6} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {focusedTask ? (
          editingFocusedTitle && canEditList ? (
            <Input
              autoFocus
              defaultValue={focusedTask.title}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingFocusedTitle(false);
              }}
              onBlur={(e) => {
                setEditingFocusedTitle(false);
                const v = e.target.value.trim();
                if (v && v !== focusedTask.title) void handleUpdateTask(focusedTask.id, { title: v });
              }}
              className="h-auto min-w-0 max-w-md border-0 bg-transparent px-1 -mx-1 text-2xl font-bold text-foreground focus-visible:ring-1"
            />
          ) : (
            <h1
              onClick={() => {
                if (canEditList) setEditingFocusedTitle(true);
              }}
              className={cn('text-2xl font-bold', canEditList && 'cursor-pointer hover:underline')}
              title={canEditList ? 'Click para editar el t�tulo' : focusedTask.title}
            >
              {focusedTask.title}
            </h1>
          )
        ) : (
          <h1 className="text-2xl font-bold">{selectedList?.name || 'Proyectos'}</h1>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {sortBy !== 'position' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortBy('position')}
              title="Volver al orden manual"
            >
              <RotateCcw className="size-4" />
              <span className="hidden text-xs ml-1 sm:inline">Orden manual</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = !showAddRows;
              setShowAddRows(next);
              localStorage.setItem('tasks-show-add-rows', String(next));
            }}
            title={showAddRows ? 'Ocultar filas de creaci�n' : 'Mostrar filas de creaci�n'}
          >
            {showAddRows ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            <span className="hidden text-xs ml-1 sm:inline">{showAddRows ? 'Ocultar' : 'Mostrar'} filas de creaci�n</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleDoneCancelled}
            title={showDoneCancelled ? 'Ocultar estados ocultos por defecto' : 'Mostrar estados ocultos por defecto'}
          >
            {showDoneCancelled ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            <span className="hidden text-xs ml-1 sm:inline">{showDoneCancelled ? 'Ocultar' : 'Mostrar'} ocultos por defecto</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setGroupBy((prev) => (prev === 'status' ? 'assignee' : 'status'))}
            title={groupBy === 'assignee' ? 'Agrupar por estado' : 'Agrupar por persona asignada'}
          >
            <Users className="size-4" />
            <span className="hidden text-xs ml-1 sm:inline">{groupBy === 'assignee' ? 'Agrupar por estado' : 'Agrupar por persona'}</span>
          </Button>
          {canEditList && selectedList && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfig(true)}
              title="Configurar estados y prioridades de la lista"
            >
              <Settings2 className="size-4" />
              <span className="hidden text-xs ml-1 sm:inline">Configurar estados y prioridades</span>
            </Button>
          )}
        </div>
        {ctx.isAdmin && selectedList && (
          <div className="ml-auto flex items-center gap-2">
            <ShareButton onClick={() => ctx.openShare('list', selectedList)} />
          </div>
        )}
      </div>

      {!selectedList && ctx.lists.length === 0 && (
        <EmptyState
          title="Sin listas"
          description="Crea un espacio de trabajo, una carpeta y una lista para empezar"
        />
      )}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
          <Input placeholder="Buscar tarea..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <FilterPopover
          label="Estado"
          options={statuses.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
          value={filterStatus}
          onSelect={setFilterStatus}
          allLabel="Todos los estados"
        />
        <FilterPopover
          label="Prioridad"
          options={priorities.map((p) => ({ key: p.key, label: p.label, color: p.color }))}
          value={filterPriority}
          onSelect={setFilterPriority}
          allLabel="Todas las prioridades"
        />
        {canEditList && (
          <FilterPopover
            label="Persona"
            options={collaborators.map((c) => {
              const av = avatarColor(c.id);
              return {
                key: c.id,
                label: c.full_name,
                avatar: { initials: getInitials(c.full_name), bg: av.bg, text: av.text },
              };
            })}
            value={filterAssignee}
            onSelect={setFilterAssignee}
            allLabel="Todos"
          />
        )}
      </div>

      <TaskList
        tasks={filteredRootTasks}
        childTasksByParent={childTasksByParent}
        notesCount={notesCount}
        collaborators={collaborators}
        expandedTasks={expandedTasks}
        toggleExpand={toggleExpand}
        showAddRows={showAddRows}
        onAddTask={handleQuickAdd}
        sortBy={sortBy}
        onSort={handleSort}
        listPath={ctx.listPath}
        showDoneCancelled={showDoneCancelled}
        groupBy={groupBy}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        statuses={statuses}
        priorities={priorities}
        isAdmin={ctx.isAdmin}
        canWrite={canEditList}
        canManageList={canManageList}
        currentUserId={ctx.currentUserId}
        organizationId={organizationId}
        listId={listId}
        onAssignRequested={handleAssignRequest}
        canReorder={sortBy === 'position' && canEditList}
        dragTaskId={dragTaskId}
        dragDrop={dragDrop}
        onTaskDragStart={handleTaskDragStart}
        onTaskDragOver={handleTaskDragOver}
        onTaskDragEnd={handleTaskDragEnd}
        onTaskFocus={(id) => {
          setFocusedTaskId(id);
          setEditingFocusedTitle(false);
        }}
      />
      {selectedList && canEditList && (
        <StatusConfigDialog
          open={showConfig}
          onOpenChange={setShowConfig}
          mode={{ type: 'list', listId: selectedList.id }}
          initialStatuses={statuses}
          initialPriorities={priorities}
          inUseStatuses={inUseStatuses}
          inUsePriorities={inUsePriorities}
          onSaved={() => ctx.refetch()}
        />
      )}
      {assignAccessDialog}
    </div>
  );
}

