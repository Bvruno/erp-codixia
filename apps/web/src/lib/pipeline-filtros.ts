import { addDays, isBefore, parseISO, startOfDay } from 'date-fns';
import type { PriorityDef, StatusDef, Task } from '@/types';
import { unionConfig } from '@/lib/task-config';

export type FiltroTipo = 'all' | 'root' | 'sub';

export type FiltrosPipeline = {
  ws: string;
  asignado: string;
  estado: string;
  prioridad: string;
  fecha: 'all' | 'overdue' | 'week' | 'none';
  tipo: FiltroTipo;
};

export const FILTROS_PIPELINE_INICIALES: FiltrosPipeline = {
  ws: 'all',
  asignado: 'all',
  estado: 'all',
  prioridad: 'all',
  fecha: 'all',
  tipo: 'all',
};

export type PathLista = Map<string, { wsId: string; folderId: string | null }>;

// Estados que se consideran cerrados; no cuentan como "vencidos" ni WIP.
export const ESTADOS_TERMINALES_POR_DEFECTO: ReadonlySet<string> = new Set([
  'done',
  'cancelled',
]);

// ---------------------------------------------------------------------------
// URL <-> filtros
// ---------------------------------------------------------------------------

export type BusquedaPipeline = {
  ws?: string;
  asignado?: string;
  estado?: string;
  prioridad?: string;
  fecha?: FiltrosPipeline['fecha'];
  tipo?: Exclude<FiltroTipo, 'all'>;
};

function texto(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Normaliza los search params del router (usado en `validateSearch`). */
export function validarBusquedaPipeline(
  search: Record<string, unknown>
): BusquedaPipeline {
  const fecha = texto(search.fecha);
  const tipo = texto(search.tipo);
  return {
    ws: texto(search.ws),
    asignado: texto(search.asignado),
    estado: texto(search.estado),
    prioridad: texto(search.prioridad),
    fecha:
      fecha === 'overdue' || fecha === 'week' || fecha === 'none'
        ? fecha
        : undefined,
    tipo: tipo === 'root' || tipo === 'sub' ? tipo : undefined,
  };
}

export function filtrosDesdeBusqueda(b: BusquedaPipeline): FiltrosPipeline {
  return {
    ws: b.ws ?? 'all',
    asignado: b.asignado ?? 'all',
    estado: b.estado ?? 'all',
    prioridad: b.prioridad ?? 'all',
    fecha: b.fecha ?? 'all',
    tipo: b.tipo ?? 'all',
  };
}

/** Solo los filtros activos (los `all` se omiten de la URL). */
export function busquedaDesdeFiltros(f: FiltrosPipeline): BusquedaPipeline {
  const b: BusquedaPipeline = {};
  if (f.ws !== 'all') b.ws = f.ws;
  if (f.asignado !== 'all') b.asignado = f.asignado;
  if (f.estado !== 'all') b.estado = f.estado;
  if (f.prioridad !== 'all') b.prioridad = f.prioridad;
  if (f.fecha !== 'all') b.fecha = f.fecha;
  if (f.tipo !== 'all') b.tipo = f.tipo;
  return b;
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export function contarFiltrosPipeline(filtros: FiltrosPipeline): number {
  return (
    (filtros.ws !== 'all' ? 1 : 0) +
    (filtros.asignado !== 'all' ? 1 : 0) +
    (filtros.estado !== 'all' ? 1 : 0) +
    (filtros.prioridad !== 'all' ? 1 : 0) +
    (filtros.fecha !== 'all' ? 1 : 0) +
    (filtros.tipo !== 'all' ? 1 : 0)
  );
}

export function filtrarTareasPipeline(
  tasks: Task[],
  filtros: FiltrosPipeline,
  pathListas: PathLista,
  hoy: Date = startOfDay(new Date()),
  terminales: ReadonlySet<string> = ESTADOS_TERMINALES_POR_DEFECTO
): Task[] {
  return tasks.filter((t) => {
    if (filtros.tipo === 'root' && t.parent_task_id) return false;
    if (filtros.tipo === 'sub' && !t.parent_task_id) return false;

    if (filtros.ws !== 'all') {
      const path = t.list_id ? pathListas.get(t.list_id) : undefined;
      if (path?.wsId !== filtros.ws) return false;
    }
    if (filtros.asignado !== 'all' && t.assigned_to !== filtros.asignado) return false;
    if (filtros.estado !== 'all' && t.status !== filtros.estado) return false;
    if (filtros.prioridad !== 'all' && t.priority !== filtros.prioridad) return false;

    if (filtros.fecha === 'none') return !t.due_date;
    if (filtros.fecha === 'overdue') {
      // Una tarea cerrada con fecha pasada no está vencida.
      if (!t.due_date || terminales.has(t.status)) return false;
      return isBefore(parseISO(t.due_date), hoy);
    }
    if (filtros.fecha === 'week') {
      if (!t.due_date || terminales.has(t.status)) return false;
      const due = parseISO(t.due_date);
      return !isBefore(due, hoy) && isBefore(due, addDays(hoy, 7));
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Configuración de columnas
// ---------------------------------------------------------------------------

export type ListaConfig = {
  statuses?: StatusDef[] | null;
  priorities?: PriorityDef[] | null;
};

export type WorkspaceDefaults = {
  default_statuses?: StatusDef[] | null;
  default_priorities?: PriorityDef[] | null;
};

function defsExplicitas<T>(defs: T[] | null | undefined): T[] {
  return Array.isArray(defs) && defs.length > 0 ? defs : [];
}

/**
 * Une la config de todas las listas, pero ordena primero según los
 * defaults del espacio de trabajo (si están definidos). Antes el orden
 * dependía de la primera lista que declarara cada estado.
 */
export function unirConfigPipeline(
  lists: ListaConfig[],
  workspaces: WorkspaceDefaults[]
): { statuses: StatusDef[]; priorities: PriorityDef[] } {
  const base = unionConfig(lists);
  const statuses: StatusDef[] = [];
  const statusSeen = new Set<string>();
  workspaces.forEach((w) => {
    defsExplicitas(w.default_statuses).forEach((s) => {
      if (statusSeen.has(s.key)) return;
      statusSeen.add(s.key);
      statuses.push(s);
    });
  });
  base.statuses.forEach((s) => {
    if (statusSeen.has(s.key)) return;
    statusSeen.add(s.key);
    statuses.push(s);
  });

  const priorities: PriorityDef[] = [];
  const prioritySeen = new Set<string>();
  workspaces.forEach((w) => {
    defsExplicitas(w.default_priorities).forEach((p) => {
      if (prioritySeen.has(p.key)) return;
      prioritySeen.add(p.key);
      priorities.push(p);
    });
  });
  base.priorities.forEach((p) => {
    if (prioritySeen.has(p.key)) return;
    prioritySeen.add(p.key);
    priorities.push(p);
  });

  return { statuses, priorities };
}

/** Estados marcados como ocultos por defecto en la config vigente. */
export function estadosOcultos(statuses: StatusDef[]): Set<string> {
  return new Set(statuses.filter((s) => s.hidden_by_default).map((s) => s.key));
}

/**
 * Añade columnas para estados usados por tareas pero ausentes de la
 * config (p. ej. la lista cambió sus estados). Evita que desaparezcan.
 */
export function completarStatuses(statuses: StatusDef[], tasks: Task[]): StatusDef[] {
  const seen = new Set(statuses.map((s) => s.key));
  const extra: StatusDef[] = [];
  tasks.forEach((t) => {
    if (seen.has(t.status)) return;
    seen.add(t.status);
    extra.push({ key: t.status, label: t.status, color: '#6b7280' });
  });
  return extra.length > 0 ? [...statuses, ...extra] : statuses;
}

// ---------------------------------------------------------------------------
// Orden y movimiento de columnas
// ---------------------------------------------------------------------------

export function ordenarColumna(
  tasks: Task[],
  priorityWeight: Record<string, number> = {}
): Task[] {
  return [...tasks].sort(
    (a, b) =>
      (a.status_position ?? 0) - (b.status_position ?? 0) ||
      (priorityWeight[b.priority] ?? 99) - (priorityWeight[a.priority] ?? 99) ||
      (a.due_date || '99').localeCompare(b.due_date || '99')
  );
}

export type MovimientoPipeline = {
  /** Todas las tareas con status/status_position ya aplicados (optimista). */
  lista: Task[];
  /** Solo las filas que cambian; se envían al endpoint en un batch. */
  items: { id: string; status: string; status_position: number }[];
};

/**
 * Calcula el resultado de soltar una tarjeta en `targetStatus`/`targetIndex`
 * sin tocar `position` (orden del board). Solo renumera las columnas de
 * origen y destino y devuelve únicamente las filas modificadas.
 */
export function calcularMovimientoPipeline(
  tasks: Task[],
  taskId: string,
  targetStatus: string,
  targetIndex: number | null,
  priorityWeight: Record<string, number> = {}
): MovimientoPipeline | null {
  const tarea = tasks.find((t) => t.id === taskId);
  if (!tarea) return null;

  const enColumna = (status: string) =>
    ordenarColumna(
      tasks.filter((t) => t.id !== taskId && t.status === status),
      priorityWeight
    );

  const destino = enColumna(targetStatus);
  const idx =
    targetIndex == null
      ? destino.length
      : Math.max(0, Math.min(targetIndex, destino.length));
  const movida: Task = { ...tarea, status: targetStatus, status_position: idx };
  const destinoOrden = [...destino.slice(0, idx), movida, ...destino.slice(idx)];

  const items = new Map<
    string,
    { id: string; status: string; status_position: number }
  >();
  const originales = new Map(tasks.map((t) => [t.id, t]));
  destinoOrden.forEach((t, i) => {
    const original = originales.get(t.id);
    if (!original) return;
    if (original.status_position !== i || original.status !== targetStatus) {
      items.set(t.id, { id: t.id, status: targetStatus, status_position: i });
    }
  });

  if (tarea.status !== targetStatus) {
    enColumna(tarea.status).forEach((t, i) => {
      if (t.status_position !== i) {
        items.set(t.id, {
          id: t.id,
          status: tarea.status,
          status_position: i,
        });
      }
    });
  }

  const lista = tasks.map((t) => {
    const it = items.get(t.id);
    return it ? { ...t, status: it.status, status_position: it.status_position } : t;
  });

  return { lista, items: [...items.values()] };
}
