'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { sesionActual } from '@/lib/auth/sesion';
import { api, apiFetch } from '@/lib/api/cliente';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, ListTodo, StickyNote, LayoutGrid } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { format, getDay } from 'date-fns';
import { shortUid } from '@/lib/slugs';
import type { Task, Profile, TaskList, Workspace, WorkspaceFolder, TaskDocument, MindMap, Todo, TaskStatus } from '@/types';
import type { AccessTree } from '@/lib/access';
import { NoteModal, type Note } from '@/components/calendar/note-modal';
import { TaskModal } from '@/components/calendar/task-modal';
import { TaskDetailModal } from '@/components/calendar/task-detail-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cacheDel, notificarCambioCache } from '@/lib/cache';
import { INDICE_CALENDARIO, claveCalendario, TTL_CACHE } from '@/lib/cache-claves';
import { useClaveConIndice } from '@/lib/use-cache-hidratacion';
import { usePerfil } from '@/lib/use-perfil';
import { usePreferenciasTrabajo } from '@/lib/use-preferencias-trabajo';
import { DEFAULT_PREFERENCES } from '@/types';
import { aplicarEventoLista, leerEvento, parchearQuery } from '@/lib/realtime-cache';

export type ViewMode = 'day' | 'week' | 'month' | 'year';

export type FiltrosCalendario = {
  ws: string;
  asignado: string;
  tipo: 'todas' | 'tareas' | 'notas';
  estado: string;
};

type CalendarioPayload = {
  profile: { organization_id: string; role: string; is_owner: boolean };
  tasks: Task[];
  notes: Note[];
  lists: TaskList[];
  folders: WorkspaceFolder[];
  workspaces: Workspace[];
  documents: TaskDocument[];
  mindmaps: MindMap[];
  todos: Todo[];
  collaborators: Profile[];
  writable_list_ids: string[] | null;
};

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#3b82f6', urgent: '#8b5cf6',
};
const STATUS_LABEL: Record<string, string> = {
  todo: 'Por hacer', in_progress: 'En curso', done: 'Completada', cancelled: 'Cancelada', backlog: 'Backlog',
};

export default function CalendarioView({ initialView: _initialView, initialFilters }: { initialView?: ViewMode; initialFilters?: FiltrosCalendario }) {
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();
  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [range, setRange] = useState<{ a: number; b: number } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [listPathMap, setListPathMap] = useState<Map<string, { wsId: string; folderId: string | null }>>(new Map());
  const [collaborators, setCollaborators] = useState<Profile[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [allLists, setAllLists] = useState<TaskList[]>([]);
  const [writableLists, setWritableLists] = useState<TaskList[]>([]);
  const [writableListIds, setWritableListIds] = useState<string[] | null>(null);
  const [documents, setDocuments] = useState<TaskDocument[]>([]);
  const [mindmaps, setMindmaps] = useState<MindMap[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [filters, setFilters] = useState<FiltrosCalendario>(initialFilters ?? { ws: 'all', asignado: 'all', tipo: 'todas', estado: 'all' });
  const [taskModal, setTaskModal] = useState<'new' | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [modal, setModal] = useState<Note | 'new' | null>(null);
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ start: number | null; toggling: boolean; moved: boolean }>({ start: null, toggling: false, moved: false });

  const queryClient = useQueryClient();
  const perfilQuery = usePerfil({ enabled: false });
  const { esLaborable } = usePreferenciasTrabajo();
  const { clave: claveCacheCalendar, fijar: fijarOrgCache } = useClaveConIndice(
    INDICE_CALENDARIO,
    claveCalendario
  );
  const calendarioQuery = useQuery({
    // Key estable: el orgId llega dentro del payload; incluirlo provocaba
    // un segundo GET en frío ('anon' → org real).
    queryKey: ['calendario', 'datos'],
    queryFn: async (): Promise<CalendarioPayload | null> => {
      const sesion = await sesionActual();
      if (!sesion) return null;
      const res = await apiFetch<CalendarioPayload>('/calendario/datos').catch(() => null);
      return res;
    },
    // La copia de IndexedDB se hidrata en el loader de `_aplicacion`; con
    // este TTL no se refetchea al navegar y el realtime sigue invalidando.
    staleTime: TTL_CACHE.calendario,
    refetchOnWindowFocus: false,
  });
  // (persistencia central en main.tsx)
  const invalidarCalendario = useCallback(() => {
    if (claveCacheCalendar) {
      void cacheDel(claveCacheCalendar);
      notificarCambioCache([claveCacheCalendar]);
    }
    void queryClient.invalidateQueries({ queryKey: ['calendario', 'datos'] });
  }, [claveCacheCalendar, queryClient]);

  // Aplica el evento a la caché (upsert/remove) para que la UI cambie al
  // instante; solo cae a invalidación si el evento no es reconocible.
  const aplicarEventoCalendario = useCallback(
    (payload: unknown) => {
      const evt = leerEvento<Record<string, unknown>>(payload);
      if (!evt || (evt.table !== 'tasks' && evt.table !== 'notes')) {
        invalidarCalendario();
        return;
      }
      let aplicado = false;
      parchearQuery<CalendarioPayload>(queryClient, ['calendario', 'datos'], (data) => {
        if (evt.table === 'tasks') {
          const r = aplicarEventoLista<Task>(data.tasks, evt);
          if (!r.aplicado || !r.lista) return data;
          aplicado = true;
          return { ...data, tasks: r.lista };
        }
        const r = aplicarEventoLista<Note>(data.notes, evt);
        if (!r.aplicado || !r.lista) return data;
        aplicado = true;
        return { ...data, notes: r.lista };
      });
      // Un INSERT puede no traer los embeds de la API (assigned_profile):
      // revalida de fondo sin bloquear la pintura.
      if (aplicado && evt.eventType === 'INSERT') {
        void queryClient.invalidateQueries({ queryKey: ['calendario', 'datos'] });
      }
      if (!aplicado) invalidarCalendario();
    },
    [queryClient, invalidarCalendario]
  );

  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    const res = calendarioQuery.data;
    if (!res) return;
    setOrgId(res.profile.organization_id);
    setIsAdmin(res.profile.role === 'admin');
    setIsOwner(res.profile.is_owner === true);
    if (res.profile.role !== 'admin' && res.profile.is_owner !== true) {
      setFilters((f) => (f.asignado === 'all' ? f : { ...f, asignado: 'all' }));
    }
    const wsRows = res.workspaces;
    const wsIds = new Set(wsRows.map((w) => w.id));
    const folderRows = res.folders;
    const lists = res.lists;
    const pathMap = new Map<string, { wsId: string; folderId: string | null }>();
    lists.forEach((l) => {
      const folder = l.folder_id ? folderRows.find((f) => f.id === l.folder_id) : null;
      const wsId = folder ? folder.workspace_id : l.workspace_id;
      if (wsId && wsIds.has(wsId)) {
        pathMap.set(l.id, { wsId, folderId: l.folder_id ?? null });
      }
    });
    const writable =
      res.writable_list_ids === null
        ? lists
        : lists.filter((l) => res.writable_list_ids!.includes(l.id));
    setWritableListIds(res.writable_list_ids);
    setTasks(res.tasks);
    setNotes(res.notes);
    setListPathMap(pathMap);
    setCollaborators(res.collaborators);
    setWorkspaces(wsRows);
    setFolders(folderRows);
    setAllLists(lists);
    setWritableLists(writable);
    setDocuments(res.documents as unknown as TaskDocument[]);
    setMindmaps(res.mindmaps as unknown as MindMap[]);
    setTodos(res.todos as unknown as Todo[]);
    setLoading(false);
    // Deja lista la clave de cache para la próxima recarga (hidratación).
    fijarOrgCache(res.profile.organization_id);
  }, [calendarioQuery.data, fijarOrgCache]);

  useEffect(() => {
    const channel = canalRealtime('calendario-rediseno')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, aplicarEventoCalendario)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, aplicarEventoCalendario)
      .subscribe();
    return () => {
      removerCanal(channel);
    };
  }, [aplicarEventoCalendario]);

  const canVerAsignado = isAdmin || isOwner;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const set = (k: string, v: string) => (v === 'all' ? p.delete(k) : p.set(k, v));
    set('ws', filters.ws);
    set('asignado', canVerAsignado ? filters.asignado : 'all');
    set('tipo', filters.tipo === 'todas' ? 'all' : filters.tipo);
    set('estado', filters.estado);
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [filters, canVerAsignado]);

  const activeFilterCount =
    (filters.ws !== 'all' ? 1 : 0) +
    (filters.asignado !== 'all' && canVerAsignado ? 1 : 0) +
    (filters.tipo !== 'todas' ? 1 : 0) +
    (filters.estado !== 'all' ? 1 : 0);

  const limpiarFiltros = () => setFilters({ ws: 'all', asignado: 'all', tipo: 'todas', estado: 'all' });

  const setFiltro = <K extends keyof FiltrosCalendario>(key: K, value: FiltrosCalendario[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekStartsOn =
    (perfilQuery.data?.profile?.preferences?.week_start ??
      DEFAULT_PREFERENCES.week_start) === 'sunday'
      ? 0
      : 1;
  const startCol = (getDay(new Date(year, month, 1)) - weekStartsOn + 7) % 7;
  const weekdays =
    weekStartsOn === 1 ? WEEKDAYS : [WEEKDAYS[6], ...WEEKDAYS.slice(0, 6)];
  const todayKey = format(new Date(todayYear, todayMonth, todayDate), 'yyyy-MM-dd');

  const monthTasks = useMemo(
    () =>
      tasks.filter((t) => {
        const d = t.due_date;
        if (!d) return false;
        if (Number(d.slice(0, 4)) !== year || Number(d.slice(5, 7)) !== month + 1) return false;
        if (filters.tipo === 'notas') return false;
        if (filters.ws !== 'all' && listPathMap.get(t.list_id ?? '')?.wsId !== filters.ws) return false;
        if (filters.asignado !== 'all' && t.assigned_to !== filters.asignado) return false;
        if (filters.estado !== 'all' && t.status !== filters.estado) return false;
        return true;
      }),
    [tasks, year, month, filters, listPathMap],
  );
  const tasksByDay = useMemo(() => {
    const m: Record<number, Task[]> = {};
    monthTasks.forEach((t) => {
      if (!t.due_date) return;
      const day = Number(t.due_date.slice(8, 10));
      if (!m[day]) m[day] = [];
      m[day].push(t);
    });
    return m;
  }, [monthTasks]);

  const monthNotes = useMemo(
    () =>
      notes.filter((n) => {
        const d = n.note_date;
        if (Number(d.slice(0, 4)) !== year || Number(d.slice(5, 7)) !== month + 1) return false;
        if (filters.tipo === 'tareas') return false;
        if (filters.asignado !== 'all' && n.created_by !== filters.asignado) return false;
        return true;
      }),
    [notes, year, month, filters],
  );

  const notesByDay = useMemo(() => {
    const m: Record<number, Note[]> = {};
    monthNotes.forEach((n) => {
      const day = Number(n.note_date.slice(8, 10));
      if (!m[day]) m[day] = [];
      m[day].push(n);
    });
    return m;
  }, [monthNotes]);

  const visibleNotes = useMemo(() => {
    if (range) {
      const days: number[] = [];
      for (let d = range.a; d <= range.b; d++) days.push(d);
      return days
        .map((day) => ({
          day,
          notes: monthNotes.filter((n) => Number(n.note_date.slice(8, 10)) === day),
        }))
        .filter((g) => g.notes.length > 0);
    }
    return monthNotes.map((n) => ({ day: Number(n.note_date.slice(8, 10)), notes: [n] }));
  }, [monthNotes, range]);

  const visibleTasks = useMemo(() => {
    if (range) {
      const days: number[] = [];
      for (let d = range.a; d <= range.b; d++) days.push(d);
      return days
        .map((day) => ({
          day,
          tasks: tasksByDay[day] || [],
        }))
        .filter((g) => g.tasks.length > 0);
    }
    return monthTasks.map((t) => ({
      day: Number(t.due_date!.slice(8, 10)),
      tasks: [t],
    }));
  }, [monthTasks, tasksByDay, range]);

  const taskPath = (t: Task): string | null => {
    if (!t.list_id) return null;
    const p = listPathMap.get(t.list_id);
    if (!p) return null;
    const folderSeg = p.folderId ? shortUid(p.folderId) : 'raiz';
    return `/proyectos/${shortUid(p.wsId)}/${folderSeg}/${shortUid(t.list_id)}/tarea/${shortUid(t.id)}`;
  };

  const tareaDetalle = taskDetailId
    ? tasks.find((t) => t.id === taskDetailId) ?? null
    : null;
  const rutaDetalle = tareaDetalle ? taskPath(tareaDetalle) : null;

  const tree: AccessTree = useMemo(
    () => ({
      workspaces,
      folders,
      lists: allLists,
      documents,
      mindmaps,
      todos,
      formularios: [],
    }),
    [workspaces, folders, allLists, documents, mindmaps, todos]
  );

  const scrollStripToActive = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector('[data-active-month]') as HTMLElement | null;
    if (!active) return;
    const off = active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2;
    strip.scrollTo({ left: Math.max(0, off), behavior: 'smooth' });
  }, []);

  const selectMonth = (m: number) => {
    setMonth(m);
    setRange(null);
    setSelectedNoteId(null);
    requestAnimationFrame(scrollStripToActive);
  };

  const dayAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest?.('[data-day]') as HTMLElement | null;
    if (!cell) return null;
    return Number(cell.dataset.day);
  };

  const onCellPointerDown = (e: React.PointerEvent<HTMLDivElement>, d: number) => {
    dragRef.current = {
      start: d,
      toggling: !!range && range.a === range.b && range.a === d,
      moved: false,
    };
    setRange({ a: d, b: d });
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const dr = dragRef.current;
      if (dr.start == null) return;
      const d = dayAt(e);
      if (d == null) return;
      if (d !== dr.start) {
        dr.moved = true;
        dr.toggling = false;
      }
      setRange({ a: Math.min(dr.start, d), b: Math.max(dr.start, d) });
    };
    const up = () => {
      const dr = dragRef.current;
      if (dr.start == null) return;
      if (dr.toggling && !dr.moved) setRange(null);
      dragRef.current = { start: null, toggling: false, moved: false };
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
  }, []);

  const saveNote = async (payload: {
    id?: string;
    note_date: string;
    title: string;
    content: string | null;
    drawing: unknown[] | null;
    image: string | null;
  }) => {
    try {
      if (payload.id) {
        await api.put(`/calendario/notas/${payload.id}`, {
          note_date: payload.note_date,
          title: payload.title,
          content: payload.content,
          drawing: payload.drawing,
          image: payload.image,
        });
      } else {
        await api.post('/calendario/notas', {
          note_date: payload.note_date,
          title: payload.title,
          content: payload.content,
          drawing: payload.drawing,
          image: payload.image,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la nota');
      return;
    }
    setModal(null);
    invalidarCalendario();
  };

  // Día seleccionado (rango) o hoy. El fallback usa el mes actual real
  // para no rodar de mes cuando se navega a un mes corto.
  const defaultDate = range
    ? new Date(year, month, range.a)
    : new Date(todayYear, todayMonth, todayDate);

  const deleteNote = async (note: Note) => {
    try {
      await api.delete(`/calendario/notas/${note.id}`);
      toast.success('Nota eliminada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar la nota');
    }
    setDeleteOpen(false);
    setModal(null);
    invalidarCalendario();
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Cargando calendario…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Calendario</h1>
          <p className="text-xs text-muted-foreground">Tareas, notas y planificación del mes</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y - 1)} aria-label="Año anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-11 text-center text-sm font-semibold">{year}</span>
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y + 1)} aria-label="Año siguiente">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="h-5 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={() => { setYear(todayYear); setMonth(todayMonth); setRange(null); }}>
            Hoy
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarDays className="size-3.5" />
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
                    <Select value={filters.ws} onValueChange={(v) => setFiltro('ws', v)}>
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
                    <Select value={filters.asignado} onValueChange={(v) => setFiltro('asignado', v)}>
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
                    Contenido
                  </span>
                  <Select value={filters.tipo} onValueChange={(v) => setFiltro('tipo', v as FiltrosCalendario['tipo'])}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Tareas y notas</SelectItem>
                      <SelectItem value="tareas">Solo tareas</SelectItem>
                      <SelectItem value="notas">Solo notas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Estado
                  </span>
                  <Select value={filters.estado} onValueChange={(v) => setFiltro('estado', v)}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="w-full text-muted-foreground">
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* 2-pane layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border shadow-card lg:grid-cols-[minmax(0,1fr)_300px_300px]">
        {/* Month pane */}
        <section className="flex min-h-0 flex-col bg-background">
          {/* Months strip in pane-header */}
          <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
            <div ref={stripRef} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {MONTHS.map((name, i) => {
                const active = i === month;
                const count = monthTasks.filter((t) => t.due_date && Number(t.due_date.slice(5, 7)) === i + 1).length;
                return (
                  <button
                    key={i}
                    onClick={() => selectMonth(i)}
                    data-active-month={active ? '1' : undefined}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                      active
                        ? 'bg-primary-soft font-semibold text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {name}
                    {count > 0 && (
                      <span className={cn('rounded-full px-1.5 text-[10px] font-semibold', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => stripRef.current?.scrollBy({ left: -160, behavior: 'smooth' })} aria-label="Meses anteriores">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => stripRef.current?.scrollBy({ left: 160, behavior: 'smooth' })} aria-label="Meses siguientes">
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Weekdays */}
          <div className="grid shrink-0 grid-cols-7 border-b">
            {weekdays.map((d) => (
              <div key={d} className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Month grid */}
          <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
            {cells.map((d, i) => {
              if (d == null) {
                return <div key={`e${i}`} className="border-b border-r border-border" />;
              }
              const dateStr = format(new Date(year, month, d), 'yyyy-MM-dd');
              const isToday = dateStr === todayKey;
              const inRange = !!range && d >= range.a && d <= range.b;
              const laborable = esLaborable(new Date(year, month, d).getDay());
              const dayTasks = tasksByDay[d] || [];
              const dayNotes = notesByDay[d] || [];
              const shownItems = Math.min(dayTasks.length, 3) + Math.min(dayNotes.length, 2);
              const totalItems = dayTasks.length + dayNotes.length;
              return (
                <div
                  key={d}
                  data-day={d}
                  onPointerDown={(e) => onCellPointerDown(e, d)}
                  className={cn(
                    'flex min-h-[76px] cursor-pointer flex-col gap-0.5 border-b border-r border-border p-1.5 transition-colors hover:bg-accent/60',
                    !laborable && !inRange && 'bg-muted/30',
                    inRange && 'bg-primary-soft',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-md text-xs font-semibold',
                      isToday ? 'bg-primary text-primary-foreground' : inRange ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {d}
                  </span>
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTaskDetailId(t.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={cn(
                        'truncate rounded border border-border bg-card px-1.5 py-0.5 text-left text-[10px] leading-tight transition-colors hover:bg-accent',
                        t.status === 'done' && 'opacity-55 line-through',
                      )}
                      style={{ borderLeftWidth: 2, borderLeftColor: PRIORITY_COLOR[t.priority] || '#6b7280' }}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayNotes.slice(0, 2).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNoteId(n.id);
                        setModal(n);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 truncate rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-left text-[10px] leading-tight transition-colors hover:bg-primary/10"
                      title={n.title}
                    >
                      <StickyNote className="size-3 shrink-0 text-primary" />
                      <span className="truncate">{n.title}</span>
                    </button>
                  ))}
                  {totalItems > shownItems && (
                    <span className="px-1 text-[9px] text-muted-foreground">+{totalItems - shownItems} más</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Tasks pane */}
        <section className="flex min-h-0 flex-col bg-background border-l">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
            <h2 className="font-display text-sm font-semibold tracking-tight">Tareas</h2>
            <div className="flex items-center gap-2">
              {visibleTasks.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {visibleTasks.reduce((acc, g) => acc + g.tasks.length, 0)}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={() => setTaskModal('new')} className="px-2">
                <Plus className="size-3.5" />
                Nueva tarea
              </Button>
            </div>
          </div>
          <div className="shrink-0 border-b px-3 py-1.5">
            <span className="text-[11px] text-muted-foreground">
              {range
                ? `${MONTHS_SHORT[month]} ${range.a}${range.b !== range.a ? `–${range.b}` : ''} — tareas`
                : `Tareas de ${MONTHS[month].toLowerCase()}`}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
            {visibleTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-10 text-center text-xs text-muted-foreground">
                <ListTodo className="size-6 opacity-40" />
                {range ? 'Sin tareas en este rango' : 'Sin tareas este mes'}
              </div>
            ) : (
              visibleTasks.map((group, gi) => (
                <div key={gi} className="flex flex-col gap-1.5">
                  <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {MONTHS_SHORT[month]} {group.day}
                  </div>
                  {group.tasks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTaskDetailId(t.id)}
                        title={t.title}
                        className="rounded-xl border bg-card p-2.5 text-left transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: PRIORITY_COLOR[t.priority] || '#6b7280' }}
                          />
                          <span className="ml-auto text-[10px] font-medium text-muted-foreground">
                            {MONTHS_SHORT[month]} {group.day}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[13px] font-semibold">{t.title}</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                          {t.assigned_profile && (
                            <span className="truncate text-[10px] text-muted-foreground">
                              {t.assigned_profile.full_name}
                            </span>
                          )}
                        </div>
                      </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Notes pane */}
        <section className="flex min-h-0 flex-col bg-background border-l">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
            <h2 className="font-display text-sm font-semibold tracking-tight">Notas</h2>
            <Button variant="ghost" size="sm" onClick={() => setModal('new')} className="px-2">
              <Plus className="size-3.5" />
              Nueva nota
            </Button>
          </div>
          <div className="shrink-0 border-b px-3 py-1.5">
            <span className="text-[11px] text-muted-foreground">
              {range
                ? `${MONTHS_SHORT[month]} ${range.a}${range.b !== range.a ? `–${range.b}` : ''} — notas`
                : `Notas de ${MONTHS[month].toLowerCase()}`}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
            {visibleNotes.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-10 text-center text-xs text-muted-foreground">
                <CalendarDays className="size-6 opacity-40" />
                {range ? 'Sin notas en este rango' : 'Sin notas este mes'}
              </div>
            ) : (
              visibleNotes.map((group, gi) => (
                <div key={gi} className="flex flex-col gap-1.5">
                  <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {MONTHS_SHORT[month]} {group.day}
                  </div>
                  {group.notes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setSelectedNoteId(n.id);
                        setModal(n);
                      }}
                      className={cn(
                        'rounded-xl border bg-card p-2.5 text-left transition-shadow hover:shadow-md',
                        selectedNoteId === n.id && 'border-primary shadow-[0_0_0_2px_var(--primary-soft)]',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-primary" />
                        <span className="ml-auto text-[10px] font-medium text-muted-foreground">
                          {MONTHS_SHORT[month]} {group.day}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[13px] font-semibold">{n.title}</div>
                      {n.image ? (
                        <img src={n.image} alt={n.title} className="mt-1.5 w-full rounded-lg border bg-white" />
                      ) : (
                        <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{n.content}</div>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <NoteModal
        open={modal !== null}
        note={modal === 'new' ? null : modal}
        defaultDate={defaultDate}
        onClose={() => setModal(null)}
        onSave={saveNote}
        onDelete={() => setDeleteOpen(true)}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="¿Eliminar nota?"
        description="La nota se eliminará definitivamente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => modal !== 'new' && modal !== null && deleteNote(modal)}
      />
      <TaskModal
        // Remonta al abrir con la selección vigente: el estado interno
        // (fecha límite incluida) se inicializa con `defaultDate`.
        key={range ? `${year}-${month}-${range.a}` : 'hoy'}
        open={taskModal === 'new'}
        onClose={() => setTaskModal(null)}
        onSaved={() => {
          invalidarCalendario();
        }}
        organizationId={orgId}
        lists={writableLists}
        collaborators={collaborators}
        isAdmin={isAdmin}
        defaultDate={defaultDate}
        tree={tree}
      />
      <TaskDetailModal
        taskId={taskDetailId}
        open={!!taskDetailId}
        onClose={() => setTaskDetailId(null)}
        rutaCompleta={rutaDetalle}
        arbol={tree}
        colaboradores={collaborators}
        esAdmin={isAdmin}
        listasEscribibles={writableListIds}
        onChanged={invalidarCalendario}
      />
    </div>
  );
}



