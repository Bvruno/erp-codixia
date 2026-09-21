import { describe, expect, it } from 'vitest';
import type { StatusDef, Task } from '@/types';
import {
  busquedaDesdeFiltros,
  calcularMovimientoPipeline,
  completarStatuses,
  contarFiltrosPipeline,
  filtrarTareasPipeline,
  filtrosDesdeBusqueda,
  FILTROS_PIPELINE_INICIALES,
  ordenarColumna,
  unirConfigPipeline,
  validarBusquedaPipeline,
  type PathLista,
} from './pipeline-filtros';

const HOY = new Date(2026, 8, 18); // 18/09/2026

function tarea(parcial: Partial<Task>): Task {
  return {
    id: parcial.id ?? crypto.randomUUID(),
    title: parcial.title ?? 'Tarea',
    status: parcial.status ?? 'todo',
    priority: parcial.priority ?? 'medium',
    assigned_to: parcial.assigned_to ?? null,
    due_date: parcial.due_date ?? null,
    list_id: parcial.list_id ?? 'l1',
    position: parcial.position ?? 0,
    status_position: parcial.status_position ?? 0,
    ...parcial,
  } as unknown as Task;
}

const PATH: PathLista = new Map([
  ['l1', { wsId: 'ws1', folderId: null }],
  ['l2', { wsId: 'ws2', folderId: 'f1' }],
]);

describe('filtrarTareasPipeline', () => {
  it('sin filtros devuelve todo', () => {
    const tareas = [tarea({}), tarea({ list_id: 'l2' })];
    expect(filtrarTareasPipeline(tareas, FILTROS_PIPELINE_INICIALES, PATH, HOY)).toHaveLength(2);
  });

  it('filtra por espacio de trabajo a través de la lista', () => {
    const tareas = [tarea({ id: 'a', list_id: 'l1' }), tarea({ id: 'b', list_id: 'l2' })];
    const res = filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, ws: 'ws2' }, PATH, HOY);
    expect(res.map((t) => t.id)).toEqual(['b']);
  });

  it('filtra por asignado, estado y prioridad', () => {
    const tareas = [
      tarea({ id: 'a', assigned_to: 'u1', status: 'todo', priority: 'high' }),
      tarea({ id: 'b', assigned_to: 'u2', status: 'done', priority: 'low' }),
    ];
    expect(
      filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, asignado: 'u1' }, PATH, HOY).map((t) => t.id)
    ).toEqual(['a']);
    expect(
      filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, estado: 'done' }, PATH, HOY).map((t) => t.id)
    ).toEqual(['b']);
    expect(
      filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, prioridad: 'high' }, PATH, HOY).map((t) => t.id)
    ).toEqual(['a']);
  });

  it('filtra por tipo raíz/subtarea', () => {
    const tareas = [
      tarea({ id: 'raiz', parent_task_id: null }),
      tarea({ id: 'sub', parent_task_id: 'raiz' }),
    ];
    expect(
      filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, tipo: 'root' }, PATH, HOY).map((t) => t.id)
    ).toEqual(['raiz']);
    expect(
      filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, tipo: 'sub' }, PATH, HOY).map((t) => t.id)
    ).toEqual(['sub']);
  });

  it('filtra por fecha: vencidas, próximos 7 días y sin fecha', () => {
    const tareas = [
      tarea({ id: 'vencida', due_date: '2026-09-10' }),
      tarea({ id: 'semana', due_date: '2026-09-21' }),
      tarea({ id: 'lejana', due_date: '2026-10-30' }),
      tarea({ id: 'sin', due_date: null }),
    ];
    expect(
      filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, fecha: 'overdue' }, PATH, HOY).map((t) => t.id)
    ).toEqual(['vencida']);
    expect(
      filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, fecha: 'week' }, PATH, HOY).map((t) => t.id)
    ).toEqual(['semana']);
    expect(
      filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, fecha: 'none' }, PATH, HOY).map((t) => t.id)
    ).toEqual(['sin']);
  });

  it('vencidas excluye tareas cerradas', () => {
    const tareas = [
      tarea({ id: 'abierta', due_date: '2026-09-10' }),
      tarea({ id: 'cerrada', due_date: '2026-09-01', status: 'done' }),
      tarea({ id: 'cancelada', due_date: '2026-09-01', status: 'cancelled' }),
    ];
    expect(
      filtrarTareasPipeline(tareas, { ...FILTROS_PIPELINE_INICIALES, fecha: 'overdue' }, PATH, HOY).map((t) => t.id)
    ).toEqual(['abierta']);
  });

  it('combina filtros', () => {
    const tareas = [
      tarea({ id: 'match', list_id: 'l1', assigned_to: 'u1', status: 'todo', due_date: '2026-09-01' }),
      tarea({ id: 'otro-espacio', list_id: 'l2', assigned_to: 'u1', status: 'todo', due_date: '2026-09-01' }),
    ];
    const res = filtrarTareasPipeline(
      tareas,
      { ws: 'ws1', asignado: 'u1', estado: 'todo', prioridad: 'all', fecha: 'overdue', tipo: 'all' },
      PATH,
      HOY
    );
    expect(res.map((t) => t.id)).toEqual(['match']);
  });
});

describe('contarFiltrosPipeline', () => {
  it('cuenta solo los filtros activos', () => {
    expect(contarFiltrosPipeline(FILTROS_PIPELINE_INICIALES)).toBe(0);
    expect(
      contarFiltrosPipeline({ ws: 'ws1', asignado: 'all', estado: 'todo', prioridad: 'all', fecha: 'week', tipo: 'sub' })
    ).toBe(4);
  });
});

describe('URL <-> filtros', () => {
  it('valida y descarta valores desconocidos', () => {
    expect(
      validarBusquedaPipeline({
        ws: 'ws1',
        fecha: 'ayer',
        tipo: 'otro',
        prioridad: '',
        asignado: 42,
      })
    ).toEqual({ ws: 'ws1', asignado: undefined, estado: undefined, prioridad: undefined, fecha: undefined, tipo: undefined });
  });

  it('hace round-trip omitiendo los filtros por defecto', () => {
    const filtros = {
      ws: 'ws1',
      asignado: 'all',
      estado: 'todo',
      prioridad: 'all',
      fecha: 'week' as const,
      tipo: 'root' as const,
    };
    const busqueda = busquedaDesdeFiltros(filtros);
    expect(busqueda).toEqual({ ws: 'ws1', estado: 'todo', fecha: 'week', tipo: 'root' });
    expect(filtrosDesdeBusqueda(busqueda)).toEqual(filtros);
  });
});

describe('unirConfigPipeline', () => {
  const wsDefaults: StatusDef[] = [
    { key: 'backlog', label: 'Backlog', color: '#111' },
    { key: 'haciendo', label: 'Haciendo', color: '#222' },
    { key: 'listo', label: 'Listo', color: '#333', hidden_by_default: true },
  ];

  it('ordena según los defaults del espacio y agrega lo extra de listas', () => {
    const { statuses } = unirConfigPipeline(
      [{ statuses: [{ key: 'extra', label: 'Extra', color: '#444' }] }],
      [{ default_statuses: wsDefaults }]
    );
    expect(statuses.map((s) => s.key)).toEqual(['backlog', 'haciendo', 'listo', 'extra']);
  });

  it('sin defaults mantiene la config de listas', () => {
    const { statuses } = unirConfigPipeline(
      [{ statuses: [{ key: 'solo', label: 'Solo', color: '#555' }] }],
      [{ default_statuses: null }]
    );
    expect(statuses.map((s) => s.key)).toEqual(['solo']);
  });
});

describe('completarStatuses', () => {
  it('agrega columnas para estados usados y no configurados', () => {
    const res = completarStatuses(
      [{ key: 'todo', label: 'Pendiente', color: '#111' }],
      [tarea({ status: 'todo' }), tarea({ status: 'raro' })]
    );
    expect(res.map((s) => s.key)).toEqual(['todo', 'raro']);
    expect(res[1].label).toBe('raro');
  });
});

describe('calcularMovimientoPipeline', () => {
  const tasks = [
    tarea({ id: 'a', status: 'todo', status_position: 0 }),
    tarea({ id: 'b', status: 'todo', status_position: 1 }),
    tarea({ id: 'c', status: 'todo', status_position: 2 }),
    tarea({ id: 'd', status: 'done', status_position: 0 }),
  ];

  it('reordena dentro de la misma columna y solo reporta filas cambiadas', () => {
    const res = calcularMovimientoPipeline(tasks, 'c', 'todo', 0);
    expect(res).not.toBeNull();
    expect(res!.items).toEqual([
      { id: 'c', status: 'todo', status_position: 0 },
      { id: 'a', status: 'todo', status_position: 1 },
      { id: 'b', status: 'todo', status_position: 2 },
    ]);
    expect(res!.lista.find((t) => t.id === 'c')!.status_position).toBe(0);
    expect(res!.lista.find((t) => t.id === 'd')!.status_position).toBe(0);
  });

  it('mueve entre columnas renumerando origen y destino, sin tocar otras', () => {
    const res = calcularMovimientoPipeline(tasks, 'b', 'done', 1);
    expect(res).not.toBeNull();
    const items = res!.items;
    expect(items).toEqual([
      { id: 'b', status: 'done', status_position: 1 },
      { id: 'c', status: 'todo', status_position: 1 },
    ]);
    // `a` y `d` conservan posición.
    expect(items.some((i) => i.id === 'a' || i.id === 'd')).toBe(false);
    expect(res!.lista.find((t) => t.id === 'b')!.status).toBe('done');
  });

  it('append al final con targetIndex null', () => {
    const res = calcularMovimientoPipeline(tasks, 'a', 'done', null);
    expect(res!.lista.find((t) => t.id === 'a')!.status_position).toBe(1);
    expect(res!.lista.find((t) => t.id === 'd')!.status_position).toBe(0);
  });

  it('devuelve null si la tarea no existe', () => {
    expect(calcularMovimientoPipeline(tasks, 'nope', 'todo', 0)).toBeNull();
  });
});

describe('ordenarColumna', () => {
  it('ordena por status_position y desempata por prioridad y fecha', () => {
    const res = ordenarColumna(
      [
        tarea({ id: 'x', status_position: 1, priority: 'low', due_date: '2026-01-01' }),
        tarea({ id: 'y', status_position: 0, priority: 'low' }),
        tarea({ id: 'z', status_position: 1, priority: 'high' }),
      ],
      { low: 0, high: 1 }
    );
    expect(res.map((t) => t.id)).toEqual(['y', 'z', 'x']);
  });
});
