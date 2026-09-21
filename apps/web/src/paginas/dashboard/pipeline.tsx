import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { api, apiFetch } from '@/lib/api/cliente';
import { usePerfil } from '@/lib/use-perfil';
import { aplicarEventoLista, leerEvento, parchearQuery } from '@/lib/realtime-cache';
import { Card, CardContent } from '@/components/ui/card';
import { KanbanSkeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  Layers,
  LayoutGrid,
  ListFilter,
  ListTree,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isBefore, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  Task,
  Profile,
  ProfilePreferences,
  StatusDef,
  PriorityDef,
} from '@/types';
import Link from 'next/link';
import { statusLabel, priorityLabel } from '@/lib/task-config';
import { PageHeader } from '@/components/layout/page-header';
import {
  contarFiltrosPipeline,
  filtrarTareasPipeline,
  FILTROS_PIPELINE_INICIALES,
  ESTADOS_TERMINALES_POR_DEFECTO,
  calcularMovimientoPipeline,
  ordenarColumna,
  estadosOcultos,
  completarStatuses,
  unirConfigPipeline,
  busquedaDesdeFiltros,
  filtrosDesdeBusqueda,
  type FiltrosPipeline,
  type PathLista,
} from '@/lib/pipeline-filtros';
import { rutaTarea, type ArbolTareas } from '@/lib/rutas-tareas';

type ListaContexto = {
  id: string;
  name: string;
  workspace_id: string;
  folder_id: string | null;
  statuses: StatusDef[] | null;
  priorities: PriorityDef[] | null;
};

type WorkspaceContexto = {
  id: string;
  name: string;
  default_statuses?: StatusDef[] | null;
  default_priorities?: PriorityDef[] | null;
};

type FolderContexto = { id: string; name: string; workspace_id: string };

type ContextoPipeline = {
  collaborators: Profile[];
  lists: ListaContexto[];
  workspaces: WorkspaceContexto[];
  folders: FolderContexto[];
};

type PipelineData = {
  tasks: Task[];
  collaborators: Profile[];
  lists: ListaContexto[];
  workspaces: WorkspaceContexto[];
  folders: FolderContexto[];
  statuses: StatusDef[];
  priorities: PriorityDef[];
};

export default function PipelinePage() {
  const perfilQuery = usePerfil();
  const profile = perfilQuery.data?.profile ?? null;
  const orgId = profile?.organization_id ?? null;
  const userId = profile?.id ?? null;
  const perfilSinDatos = !perfilQuery.isLoading && !profile;

  const pipelineKey = useMemo(
    () => ['pipeline', 'datos', orgId, userId],
    [orgId, userId]
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const busqueda = useSearch({ from: '/_aplicacion/pipeline' });
  const filtros = useMemo(() => filtrosDesdeBusqueda(busqueda), [busqueda]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [collaborators, setCollaborators] = useState<Profile[]>([]);
  const [lists, setLists] = useState<ListaContexto[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceContexto[]>([]);
  const [folders, setFolders] = useState<FolderContexto[]>([]);
  const [statuses, setStatuses] = useState<StatusDef[]>([]);
  const [priorities, setPriorities] = useState<PriorityDef[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickListId, setQuickListId] = useState('');
  const [quickPriority, setQuickPriority] = useState('');
  const [loading, setLoading] = useState(true);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounterRef = useRef(0);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canVerAsignado = profile?.role === 'admin' || profile?.is_owner === true;

  const pipelineQuery = useQuery({
    queryKey: pipelineKey,
    queryFn: async (): Promise<PipelineData> => {
      if (!profile?.organization_id) throw new Error('Perfil no encontrado.');

      const params = new URLSearchParams({
        organization_id: profile.organization_id,
      });
      if (profile.role === 'collaborator' && profile.id) {
        params.set('user_id', profile.id);
      }

      const [tasksRes, ctxRes] = await Promise.all([
        apiFetch<{ tasks: Task[] }>(
          `/tareas?${params.toString()}&role=${encodeURIComponent(profile.role)}`
        ),
        apiFetch<ContextoPipeline>(
          `/tareas/contexto?organization_id=${encodeURIComponent(
            profile.organization_id
          )}`
        ),
      ]);

      const { statuses: s, priorities: pr } = unirConfigPipeline(
        ctxRes.lists,
        ctxRes.workspaces
      );
      return {
        tasks: tasksRes.tasks,
        collaborators: ctxRes.collaborators,
        lists: ctxRes.lists,
        workspaces: ctxRes.workspaces,
        folders: ctxRes.folders,
        statuses: s,
        priorities: pr,
      };
    },
    enabled: !!orgId,
    staleTime: 30_000,
    // Red de seguridad si el realtime falla: datos frescos al entrar.
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
  });
  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    const data = pipelineQuery.data;
    if (!data) return;
    setTasks(data.tasks);
    setCollaborators(data.collaborators);
    setLists(data.lists);
    setWorkspaces(data.workspaces);
    setFolders(data.folders);
    setStatuses(data.statuses);
    setPriorities(data.priorities);
    setError(null);
    setLoading(false);
  }, [pipelineQuery.data]);
  useEffect(() => {
    if (!pipelineQuery.isError) return;
    setError(
      pipelineQuery.error instanceof Error
        ? pipelineQuery.error.message
        : 'No se pudieron cargar las tareas.'
    );
    setLoading(false);
  }, [pipelineQuery.isError, pipelineQuery.error]);
  useEffect(() => {
    const prefs = profile?.preferences;
    if (prefs) setMostrarOcultos(Boolean(prefs.show_done_cancelled));
  }, [profile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidarPipeline = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: pipelineKey });
  }, [queryClient, pipelineKey]);

  const invalidarPipelineDebounced = useCallback(() => {
    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = setTimeout(invalidarPipeline, 300);
  }, [invalidarPipeline]);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Aplica el evento a la caché (la UI cambia al instante); eventos de
  // configuración de listas o desconocidos caen a invalidación clásica.
  const aplicarEvento = useCallback(
    (payload: unknown) => {
      const evt = leerEvento<Record<string, unknown>>(payload);
      if (!evt || evt.table !== 'tasks') {
        invalidarPipelineDebounced();
        return;
      }
      let aplicado = false;
      parchearQuery<PipelineData>(queryClient, pipelineKey, (data) => {
        const r = aplicarEventoLista<Task>(data.tasks, evt, (previo, nuevo) => ({
          ...previo,
          ...nuevo,
          assigned_profile: nuevo.assigned_profile ?? previo.assigned_profile,
          shift: nuevo.shift ?? previo.shift,
        }));
        if (!r.aplicado || !r.lista) return data;
        aplicado = true;
        return { ...data, tasks: r.lista };
      });
      if (aplicado && evt.eventType === 'INSERT') invalidarPipelineDebounced();
      if (!aplicado) invalidarPipelineDebounced();
    },
    [queryClient, pipelineKey, invalidarPipelineDebounced]
  );

  useEffect(() => {
    if (!orgId) return;

    const channel = canalRealtime(`pipeline-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        aplicarEvento
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_lists' },
        aplicarEvento
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      removerCanal(channel);
    };
  }, [orgId, aplicarEvento]);

  const aplicarFiltros = useCallback(
    (next: FiltrosPipeline) => {
      void navigate({
        to: '/pipeline',
        search: busquedaDesdeFiltros(next),
        replace: true,
      });
    },
    [navigate]
  );

  const setFiltro = <K extends keyof FiltrosPipeline>(
    key: K,
    value: FiltrosPipeline[K]
  ) => aplicarFiltros({ ...filtros, [key]: value });

  const limpiarFiltros = () => {
    setSearch('');
    setDebouncedSearch('');
    aplicarFiltros(FILTROS_PIPELINE_INICIALES);
  };

  const alternarOcultos = async () => {
    const siguiente = !mostrarOcultos;
    setMostrarOcultos(siguiente);
    try {
      const res = await apiFetch<{ preferences: ProfilePreferences | null }>(
        '/perfil/preferencias'
      );
      const prefs = {
        ...(res.preferences || {}),
        show_done_cancelled: siguiente,
      } as ProfilePreferences;
      await api.put('/perfil/preferencias', { preferences: prefs });
    } catch {
      // best-effort: la preferencia no bloquea la vista
    }
  };

  const statusesBase = useMemo(
    () => completarStatuses(statuses, tasks),
    [statuses, tasks]
  );
  const ocultos = useMemo(() => estadosOcultos(statusesBase), [statusesBase]);
  const terminales = useMemo(() => {
    const set = new Set<string>(ESTADOS_TERMINALES_POR_DEFECTO);
    statusesBase.forEach((s) => {
      if (s.hidden_by_default) set.add(s.key);
    });
    return set;
  }, [statusesBase]);

  const columnas = useMemo(() => {
    if (filtros.estado !== 'all') {
      return statusesBase.filter((s) => s.key === filtros.estado);
    }
    return mostrarOcultos
      ? statusesBase
      : statusesBase.filter((s) => !ocultos.has(s.key));
  }, [statusesBase, filtros.estado, mostrarOcultos, ocultos]);

  const subtaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => {
      if (t.parent_task_id) {
        counts[t.parent_task_id] = (counts[t.parent_task_id] || 0) + 1;
      }
    });
    return counts;
  }, [tasks]);

  const pathListas: PathLista = useMemo(() => {
    const map: PathLista = new Map();
    const wsIds = new Set(workspaces.map((w) => w.id));
    lists.forEach((l) => {
      const folder = l.folder_id
        ? folders.find((f) => f.id === l.folder_id)
        : null;
      const wsId = folder ? folder.workspace_id : l.workspace_id;
      if (wsIds.has(wsId)) map.set(l.id, { wsId, folderId: l.folder_id ?? null });
    });
    return map;
  }, [lists, folders, workspaces]);

  const arbolTareas: ArbolTareas = useMemo(
    () => ({
      workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        workspace_id: f.workspace_id,
      })),
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        workspace_id: l.workspace_id,
        folder_id: l.folder_id,
      })),
    }),
    [workspaces, folders, lists]
  );

  const listaPorId = useMemo(
    () => new Map(lists.map((l) => [l.id, l])),
    [lists]
  );

  const filteredTasks = useMemo(() => {
    const porFiltros = filtrarTareasPipeline(
      tasks,
      filtros,
      pathListas,
      undefined,
      terminales
    );
    if (!debouncedSearch) return porFiltros;
    const q = debouncedSearch.toLowerCase();
    return porFiltros.filter((t) => t.title.toLowerCase().includes(q));
  }, [tasks, filtros, pathListas, terminales, debouncedSearch]);

  const today = startOfDay(new Date());

  const activeFilterCount = contarFiltrosPipeline(filtros);

  const priorityWeight = useMemo(() => {
    const weight: Record<string, number> = {};
    priorities.forEach((p, i) => {
      weight[p.key] = i;
    });
    return weight;
  }, [priorities]);

  const tareasPorStatus = useMemo(() => {
    const acc: Record<string, Task[]> = {};
    columnas.forEach((statusDef) => {
      acc[statusDef.key] = ordenarColumna(
        filteredTasks.filter((t) => t.status === statusDef.key),
        priorityWeight
      );
    });
    return acc;
  }, [columnas, filteredTasks, priorityWeight]);

  const listasDisponibles = useMemo(() => {
    if (filtros.ws === 'all') return lists;
    return lists.filter((l) => pathListas.get(l.id)?.wsId === filtros.ws);
  }, [lists, filtros.ws, pathListas]);

  const moveTask = async (
    taskId: string,
    targetStatus: string,
    targetIndex: number | null
  ) => {
    const previo = tasks;
    const movimiento = calcularMovimientoPipeline(
      tasks,
      taskId,
      targetStatus,
      targetIndex,
      priorityWeight
    );
    if (!movimiento || movimiento.items.length === 0) return;

    setTasks(movimiento.lista);
    queryClient.setQueryData<PipelineData>(pipelineKey, (data) =>
      data ? { ...data, tasks: movimiento.lista } : data
    );

    try {
      await api.post('/tareas/pipeline/reordenar', {
        items: movimiento.items,
      });
    } catch {
      setTasks(previo);
      queryClient.setQueryData<PipelineData>(pipelineKey, (data) =>
        data ? { ...data, tasks: previo } : data
      );
      toast.error('Error al mover la tarea');
    }
  };

  const crearTareaRapida = async (status: string) => {
    const title = quickTitle.trim();
    const listId = quickListId || listasDisponibles[0]?.id || '';
    if (!title || !listId || !orgId || !userId) return;
    const priority = quickPriority || priorities[0]?.key || 'medium';

    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const maxPosicionLista = tasks.reduce(
      (m, t) => (t.list_id === listId ? Math.max(m, t.position ?? 0) : m),
      0
    );
    const maxPosicionStatus = tasks.reduce(
      (m, t) => (t.status === status ? Math.max(m, t.status_position ?? 0) : m),
      0
    );
    const optimista: Task = {
      id: tempId,
      organization_id: orgId,
      parent_task_id: null,
      list_id: listId,
      title,
      description: null,
      status,
      priority,
      assigned_to: null,
      created_by: userId,
      shift_id: null,
      due_date: null,
      due_time: null,
      start_date: null,
      estimated_hours: null,
      position: maxPosicionLista + 1,
      status_position: maxPosicionStatus + 1,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };

    setTasks((prev) => [...prev, optimista]);
    queryClient.setQueryData<PipelineData>(pipelineKey, (data) =>
      data ? { ...data, tasks: [...data.tasks, optimista] } : data
    );
    setQuickTitle('');

    try {
      const res = await api.post<{ tarea: Task }>('/tareas', {
        title,
        status,
        priority,
        list_id: listId,
        organization_id: orgId,
        created_by: userId,
        position: optimista.position,
        status_position: optimista.status_position,
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === tempId ? res.tarea : t))
      );
      queryClient.setQueryData<PipelineData>(pipelineKey, (data) =>
        data
          ? {
              ...data,
              tasks: data.tasks.map((t) => (t.id === tempId ? res.tarea : t)),
            }
          : data
      );
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      queryClient.setQueryData<PipelineData>(pipelineKey, (data) =>
        data
          ? { ...data, tasks: data.tasks.filter((t) => t.id !== tempId) }
          : data
      );
      toast.error('No se pudo crear la tarea');
    }
  };

  const handleDragEnter = (_e: React.DragEvent, status: string) => {
    dragCounterRef.current++;
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOverColumn(null);
      setDragOverIndex(null);
    }
  };

  const resetDrag = () => {
    dragCounterRef.current = 0;
    setDragOverColumn(null);
    setDragOverIndex(null);
  };

  const handleColumnDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    resetDrag();
    if (taskId) await moveTask(taskId, status, null);
  };

  const handleCardDragOver = (
    e: React.DragEvent,
    status: string,
    index: number
  ) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDragOverColumn(status);
    setDragOverIndex(before ? index : index + 1);
  };

  const handleCardDrop = async (
    e: React.DragEvent,
    status: string,
    index: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const taskId = e.dataTransfer.getData('taskId');
    resetDrag();
    if (taskId) await moveTask(taskId, status, before ? index : index + 1);
  };

  // Métricas: WIP por estado "en curso" y completadas por semana.
  const wipKeys = useMemo(() => {
    const noTerminales = statusesBase.filter((s) => !terminales.has(s.key));
    const enProgreso = noTerminales.find((s) => s.key === 'in_progress');
    if (enProgreso) return new Set([enProgreso.key]);
    return new Set(noTerminales.slice(1, 2).map((s) => s.key));
  }, [statusesBase, terminales]);
  const doneKeys = useMemo(() => {
    if (statusesBase.some((s) => s.key === 'done')) return new Set(['done']);
    return new Set(
      statusesBase
        .filter((s) => s.hidden_by_default && s.key !== 'cancelled')
        .map((s) => s.key)
    );
  }, [statusesBase]);

  const wipCounts = new Map<string, number>();
  filteredTasks.forEach((t) => {
    if (wipKeys.has(t.status) && t.assigned_to) {
      wipCounts.set(t.assigned_to, (wipCounts.get(t.assigned_to) || 0) + 1);
    }
  });
  const wipTop = [...wipCounts.entries()]
    .map(([id, count]) => ({
      id,
      count,
      name: collaborators.find((c) => c.id === id)?.full_name || null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const weekMs = 7 * 86400000;
  const weeklyDone = new Array(8).fill(0) as number[];
  filteredTasks.forEach((t) => {
    if (!doneKeys.has(t.status)) return;
    const completedAt = t.completed_at
      ? new Date(t.completed_at).getTime()
      : new Date(t.updated_at).getTime();
    const weeksAgo = Math.floor((nowTs - completedAt) / weekMs);
    if (weeksAgo >= 0 && weeksAgo < 8) weeklyDone[weeksAgo]++;
  });
  const weeklyMax = Math.max(1, ...weeklyDone);
  const weeklyLabels = weeklyDone.map((_, i) => {
    const d = new Date(nowTs - (7 - i) * weekMs);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  });

  const placeholder = () => (
    <div
      className="border-2 border-dashed border-primary/50 rounded-lg h-14 transition-colors"
      aria-hidden
    />
  );

  if (perfilSinDatos) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No se pudo cargar tu perfil"
        description="Revisa la conexión e inténtalo de nuevo."
        action={{ label: 'Reintentar', onClick: () => void perfilQuery.refetch() }}
      />
    );
  }

  if (loading) {
    return <KanbanSkeleton />;
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No se pudo cargar el pipeline"
        description={error}
        action={{ label: 'Reintentar', onClick: () => invalidarPipeline() }}
      />
    );
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="Sin tareas aún"
        description="Crea tareas desde la vista de tareas para verlas aquí."
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <PageHeader title="Pipeline" />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
            <Input
              placeholder="Buscar tarea..."
              className="w-44 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar tarea"
            />
          </div>
          <Button
            variant={mostrarOcultos ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => void alternarOcultos()}
            title={
              mostrarOcultos
                ? 'Ocultar estados ocultos por defecto'
                : 'Mostrar estados ocultos por defecto'
            }
          >
            {mostrarOcultos ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {mostrarOcultos ? 'Ocultar cerrados' : 'Mostrar cerrados'}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <ListFilter className="size-3.5" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Espacio de trabajo
                  </span>
                  {workspaces.length > 1 ? (
                    <Select value={filtros.ws} onValueChange={(v) => setFiltro('ws', v)}>
                      <SelectTrigger className="h-8 w-full">
                        <LayoutGrid className="size-3.5" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los espacios</SelectItem>
                        {workspaces.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="px-1 text-xs text-muted-foreground">Sin filtros disponibles</p>
                  )}
                </div>
                {canVerAsignado && (
                  <div className="flex flex-col gap-1.5">
                    <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Asignado a
                    </span>
                    <Select
                      value={filtros.asignado}
                      onValueChange={(v) => setFiltro('asignado', v)}
                    >
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {collaborators.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Prioridad
                  </span>
                  <Select
                    value={filtros.prioridad}
                    onValueChange={(v) => setFiltro('prioridad', v)}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {priorities.map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fecha límite
                  </span>
                  <Select
                    value={filtros.fecha}
                    onValueChange={(v) => setFiltro('fecha', v as FiltrosPipeline['fecha'])}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las fechas</SelectItem>
                      <SelectItem value="overdue">Vencidas</SelectItem>
                      <SelectItem value="week">Próximos 7 días</SelectItem>
                      <SelectItem value="none">Sin fecha</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Tipo
                  </span>
                  <Select
                    value={filtros.tipo}
                    onValueChange={(v) => setFiltro('tipo', v as FiltrosPipeline['tipo'])}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="root">Solo tareas raíz</SelectItem>
                      <SelectItem value="sub">Solo subtareas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Estado
                  </span>
                  <Select value={filtros.estado} onValueChange={(v) => setFiltro('estado', v)}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {statusesBase.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={limpiarFiltros}
                    className="w-full text-muted-foreground"
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Card>
          <CardContent className="p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              En progreso por persona (WIP)
            </p>
            {wipTop.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin tareas en progreso</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {wipTop.map((w) => (
                  <span
                    key={w.id}
                    className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                  >
                    <span className="font-medium tabular-nums">{w.count}</span>
                    <span className="text-muted-foreground">{w.name || 'Sin asignar'}</span>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Completadas por semana
            </p>
            <div className="flex h-16 items-end gap-1.5">
              {[...weeklyDone].reverse().map((count, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                  <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
                  <div
                    className="w-full rounded-sm bg-emerald-500/80"
                    style={{ height: `${Math.max(3, (count / weeklyMax) * 48)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
              {weeklyLabels.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description="Ajusta la búsqueda o limpia los filtros para ver tareas."
          action={{ label: 'Limpiar filtros', onClick: limpiarFiltros }}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-x-auto pb-4">
          <div className="flex h-full min-w-0 flex-col gap-4 lg:flex-row lg:min-w-0">
            {columnas.map((statusDef) => {
              const status = statusDef.key;
              const columnTasks = tareasPorStatus[status] || [];
              const listasColumna = listasDisponibles;
              return (
                <div
                  key={status}
                  className={`w-full lg:w-auto lg:flex-1 flex flex-col min-h-0 space-y-2 rounded-lg p-2 transition-colors ${
                    dragOverColumn === status ? 'ring-2 ring-primary/50' : ''
                  }`}
                  style={{ backgroundColor: `${statusDef.color}14` }}
                  onDragEnter={(e) => handleDragEnter(e, status)}
                  onDragLeave={handleDragLeave}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleColumnDrop(e, status)}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{statusDef.label}</h3>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {columnTasks.length}
                      </Badge>
                      <Popover
                        open={quickAddStatus === status}
                        onOpenChange={(abierto) => {
                          setQuickAddStatus(abierto ? status : null);
                          if (abierto) {
                            setQuickTitle('');
                            setQuickListId(listasColumna[0]?.id ?? '');
                            setQuickPriority(priorities[0]?.key ?? '');
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-label={`Agregar tarea en ${statusDef.label}`}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" align="start">
                          <form
                            className="flex flex-col gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void crearTareaRapida(status);
                            }}
                          >
                            <Input
                              autoFocus
                              placeholder="Título de la tarea"
                              value={quickTitle}
                              onChange={(e) => setQuickTitle(e.target.value)}
                              aria-label="Título de la tarea"
                            />
                            {listasColumna.length > 1 && (
                              <Select
                                value={quickListId || listasColumna[0]?.id || ''}
                                onValueChange={setQuickListId}
                              >
                                <SelectTrigger className="h-8 w-full">
                                  <SelectValue placeholder="Lista" />
                                </SelectTrigger>
                                <SelectContent>
                                  {listasColumna.map((l) => (
                                    <SelectItem key={l.id} value={l.id}>
                                      {l.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <Select
                              value={quickPriority || priorities[0]?.key || ''}
                              onValueChange={setQuickPriority}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Prioridad" />
                              </SelectTrigger>
                              <SelectContent>
                                {priorities.map((p) => (
                                  <SelectItem key={p.key} value={p.key}>
                                    {p.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={!quickTitle.trim() || listasColumna.length === 0}
                            >
                              Crear tarea
                            </Button>
                          </form>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <ScrollArea className="max-h-96 min-h-0 rounded-md lg:max-h-none lg:flex-1">
                    <div className="space-y-2 pr-1">
                      {columnTasks.map((task, index) => {
                        const isOverdue =
                          !terminales.has(task.status) &&
                          !!task.due_date &&
                          isBefore(parseISO(task.due_date), today);
                        const subCount = subtaskCounts[task.id] || 0;
                        const lista = task.list_id ? listaPorId.get(task.list_id) : null;
                        const prioridad = priorities.find((p) => p.key === task.priority);
                        return (
                          <Fragment key={task.id}>
                            {dragOverColumn === status && dragOverIndex === index && placeholder()}
                            <Card
                              className="cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md"
                              style={{
                                borderColor: `${statusDef.color}80`,
                                backgroundColor: `${statusDef.color}14`,
                              }}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('taskId', task.id);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragOver={(e) => handleCardDragOver(e, status, index)}
                              onDragLeave={() => setDragOverIndex(null)}
                              onDrop={(e) => handleCardDrop(e, status, index)}
                              onDragEnd={resetDrag}
                              role="group"
                              aria-label={`${task.title} - ${statusLabel(statusesBase, status)}`}
                            >
                              <CardContent className="p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <Link
                                    href={rutaTarea(task, arbolTareas)}
                                    className="font-medium text-sm hover:underline line-clamp-2"
                                  >
                                    {task.title}
                                  </Link>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        className="text-muted-foreground hover:text-foreground rounded-md p-2 -mt-1 -mr-1 size-8"
                                        aria-label={`Mover tarea ${task.title}`}
                                      >
                                        <MoreHorizontal className="size-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        disabled={index === 0}
                                        onSelect={() => moveTask(task.id, status, index - 1)}
                                      >
                                        <ArrowUp className="size-3.5" />
                                        Subir
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        disabled={index >= columnTasks.length - 1}
                                        onSelect={() => moveTask(task.id, status, index + 1)}
                                      >
                                        <ArrowDown className="size-3.5" />
                                        Bajar
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      {statusesBase.map((s) => (
                                        <DropdownMenuItem
                                          key={s.key}
                                          disabled={s.key === task.status}
                                          onSelect={() => moveTask(task.id, s.key, null)}
                                        >
                                          Mover a {s.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                {(task.parent_task_id ||
                                  lista ||
                                  task.due_date ||
                                  task.estimated_hours != null ||
                                  subCount > 0) && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    {task.parent_task_id && (
                                      <Badge variant="outline" className="text-[10px] py-0">
                                        Subtarea
                                      </Badge>
                                    )}
                                    {lista && (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Layers className="size-3" />
                                        {lista.name}
                                      </span>
                                    )}
                                    {task.due_date && (
                                      <span
                                        className={`inline-flex items-center gap-1 text-xs ${
                                          isOverdue
                                            ? 'text-red-500 font-medium'
                                            : 'text-muted-foreground'
                                        }`}
                                      >
                                        <Calendar className="size-3" />
                                        {format(parseISO(task.due_date), 'd MMM', { locale: es })}
                                        {task.due_time ? ` ${task.due_time.slice(0, 5)}` : ''}
                                        {isOverdue && ' · vencida'}
                                      </span>
                                    )}
                                    {task.estimated_hours != null && (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="size-3" />
                                        {task.estimated_hours} h
                                      </span>
                                    )}
                                    {subCount > 0 && (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <ListTree className="size-3" />
                                        {subCount}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center justify-between">
                                  {task.assigned_profile ? (
                                    <div className="flex items-center gap-1.5">
                                      <Avatar className="size-5">
                                        <AvatarFallback className="text-[8px]">
                                          {task.assigned_profile.full_name
                                            ?.split(' ')
                                            .map((n) => n[0])
                                            .join('')
                                            .toUpperCase()
                                            .slice(0, 2) || '--'}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="text-muted-foreground text-xs truncate max-w-[80px]">
                                        {task.assigned_profile.full_name}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">
                                      Sin asignar
                                    </span>
                                  )}
                                  <Badge
                                    className="text-[10px] py-0"
                                    style={
                                      prioridad
                                        ? {
                                            backgroundColor: `${prioridad.color}1A`,
                                            color: prioridad.color,
                                            borderColor: `${prioridad.color}40`,
                                          }
                                        : undefined
                                    }
                                  >
                                    {priorityLabel(priorities, task.priority)}
                                  </Badge>
                                </div>
                              </CardContent>
                            </Card>
                          </Fragment>
                        );
                      })}
                      {dragOverColumn === status && dragOverIndex === columnTasks.length && (
                        <Fragment>{placeholder()}</Fragment>
                      )}
                      {dragOverColumn === status && dragOverIndex === null && (
                        <div className="border-2 border-dashed border-primary/50 rounded-lg h-20 my-1 animate-pulse" />
                      )}
                      {columnTasks.length === 0 && dragOverColumn !== status && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Sin tareas
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
