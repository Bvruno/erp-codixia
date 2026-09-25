import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../app';

type Filtro = { col: string; op: 'eq' | 'is' | 'in'; val: unknown };

const estado = vi.hoisted(() => ({
  tablas: {} as Record<string, Record<string, unknown>[]>,
  inserts: [] as { tabla: string; filas: Record<string, unknown>[] }[],
  upserts: [] as { tabla: string; filas: Record<string, unknown>[] }[],
  deletes: [] as string[],
  conflicto: false,
  usuarioId: '33333333-3333-4333-8333-333333333333',
}));

vi.mock('../lib/supabase/usuario', () => ({
  clienteUsuarioMiddleware: async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>
  ) => {
    const cumplir = (fila: Record<string, unknown>, filtros: Filtro[]) =>
      filtros.every((f) => {
        if (f.op === 'eq') return fila[f.col] === f.val;
        if (f.op === 'is') return (fila[f.col] ?? null) === f.val;
        return (f.val as unknown[]).includes(fila[f.col]);
      });

    const crearQuery = (tabla: string, filtros: Filtro[] = []) => {
      const filas = () => (estado.tablas[tabla] ?? []).filter((f) => cumplir(f, filtros));
      const q = {
        eq: (col: string, val: unknown) => crearQuery(tabla, [...filtros, { col, op: 'eq', val }]),
        is: (col: string, val: unknown) => crearQuery(tabla, [...filtros, { col, op: 'is', val }]),
        in: (col: string, val: unknown[]) => crearQuery(tabla, [...filtros, { col, op: 'in', val }]),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
        single: async () => ({ data: filas()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: filas(), error: null }),
      };
      return q;
    };

    c.set('usuarioId', estado.usuarioId);
    c.set('supabase', {
      from: (tabla: string) => ({
        select: () => crearQuery(tabla),
        insert: (filas: Record<string, unknown> | Record<string, unknown>[]) => {
          const lista = Array.isArray(filas) ? filas : [filas];
          estado.inserts.push({ tabla, filas: lista });
          const error = estado.conflicto
            ? { code: '23505', message: 'duplicate key value' }
            : null;
          const promesa = Promise.resolve({ error });
          return Object.assign(promesa, {
            select: () => ({
              single: async () => ({ data: error ? null : { id: `nuevo-${tabla}` }, error }),
            }),
          });
        },
        upsert: (filas: Record<string, unknown>[]) => {
          estado.upserts.push({ tabla, filas });
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          eq: async () => {
            estado.deletes.push(tabla);
            return { error: null };
          },
        }),
      }),
    });
    await next();
  },
}));

const app = crearApp('http://web');

const LISTA = {
  id: 'lista-1',
  organization_id: 'org-1',
  workspace_id: 'ws-1',
  folder_id: null,
  name: 'Ventas',
  visibility: 'restricted',
  position: 0,
  statuses: [{ key: 'backlog', label: 'Backlog' }],
  priorities: [{ key: 'medium', label: 'Media' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  estado.tablas = {};
  estado.inserts = [];
  estado.upserts = [];
  estado.deletes = [];
  estado.conflicto = false;
});

describe('POST /entidades/:type/:id/clonar', () => {
  it('rechaza tipos no clonables', async () => {
    const res = await app.request('/entidades/folder/f-1/clonar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Copia' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 si el origen no existe o no es visible', async () => {
    const res = await app.request('/entidades/list/lista-9/clonar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Copia' }),
    });
    expect(res.status).toBe(404);
  });

  it('409 cuando el nombre ya existe en el contenedor', async () => {
    estado.tablas.task_lists = [LISTA];
    estado.conflicto = true;
    const res = await app.request('/entidades/list/lista-1/clonar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Copia de Ventas' }),
    });
    expect(res.status).toBe(409);
  });

  it('clona lista con estado, tareas (subárbol remapeado) y notas', async () => {
    estado.tablas.task_lists = [LISTA];
    estado.tablas.tasks = [
      {
        id: 't-1',
        organization_id: 'org-1',
        list_id: 'lista-1',
        parent_task_id: null,
        title: 'Raíz',
        description: null,
        status: 'backlog',
        priority: 'medium',
        assigned_to: null,
        created_by: 'otro',
        shift_id: null,
        due_date: null,
        due_time: null,
        start_date: null,
        estimated_hours: null,
        position: 0,
        status_position: 0,
        completed_at: null,
      },
      {
        id: 't-2',
        organization_id: 'org-1',
        list_id: 'lista-1',
        parent_task_id: 't-1',
        title: 'Subtarea',
        description: 'detalle',
        status: 'backlog',
        priority: 'medium',
        assigned_to: null,
        created_by: 'otro',
        shift_id: null,
        due_date: null,
        due_time: null,
        start_date: null,
        estimated_hours: null,
        position: 1,
        status_position: 0,
        completed_at: null,
      },
    ];
    estado.tablas.task_notes = [
      { id: 'n-1', task_id: 't-1', author_id: 'otro', content: 'nota', created_at: 'x' },
    ];
    estado.tablas.entity_visibility = [
      { entity_type: 'list', entity_id: 'lista-1', profile_id: 'colab-1', permission: 'read', inherit: true },
      { entity_type: 'list', entity_id: 'lista-1', profile_id: estado.usuarioId, permission: 'manage', inherit: false },
    ];

    const res = await app.request('/entidades/list/lista-1/clonar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Copia de Ventas' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string };
    // El id lo genera la API (el INSERT va sin RETURNING por RLS).
    expect(json.id).toMatch(/^[0-9a-f-]{36}$/);
    const idClon = json.id;

    const insercionLista = estado.inserts.find((i) => i.tabla === 'task_lists');
    expect(insercionLista?.filas[0]).toMatchObject({
      name: 'Copia de Ventas',
      workspace_id: 'ws-1',
      folder_id: null,
      visibility: 'restricted',
      position: 1,
      statuses: LISTA.statuses,
      priorities: LISTA.priorities,
    });

    const insercionTareas = estado.inserts.find((i) => i.tabla === 'tasks');
    expect(insercionTareas?.filas).toHaveLength(2);
    const raiz = insercionTareas?.filas.find((t) => t.title === 'Raíz');
    const sub = insercionTareas?.filas.find((t) => t.title === 'Subtarea');
    expect(raiz?.parent_task_id).toBeNull();
    expect(raiz?.created_by).toBe(estado.usuarioId);
    expect(sub?.parent_task_id).toBe(raiz?.id);
    expect(sub?.list_id).toBe(idClon);

    const insercionNotas = estado.inserts.find((i) => i.tabla === 'task_notes');
    expect(insercionNotas?.filas[0]).toMatchObject({ task_id: raiz?.id, content: 'nota' });

    const upsertGrants = estado.upserts.find((u) => u.tabla === 'entity_visibility');
    expect(upsertGrants?.filas).toHaveLength(1);
    expect(upsertGrants?.filas[0]).toMatchObject({
      entity_type: 'list',
      entity_id: idClon,
      profile_id: 'colab-1',
      permission: 'read',
    });
  });

  it('clona documento con todas sus páginas', async () => {
    estado.tablas.documents = [
      {
        id: 'doc-1',
        organization_id: 'org-1',
        workspace_id: 'ws-1',
        folder_id: 'folder-1',
        name: 'Manual',
        visibility: 'public',
        position: 0,
      },
    ];
    estado.tablas.document_pages = [
      { id: 'p-1', document_id: 'doc-1', title: 'Hoja principal', content: 'Hola', is_main: true, position: 0 },
      { id: 'p-2', document_id: 'doc-1', title: 'Anexo', content: 'Mundo', is_main: false, position: 1 },
    ];

    const res = await app.request('/entidades/document/doc-1/clonar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Copia de Manual' }),
    });
    expect(res.status).toBe(200);
    const clonDoc = (await res.json()) as { id: string };

    const insercionPaginas = estado.inserts.find((i) => i.tabla === 'document_pages');
    expect(insercionPaginas?.filas).toHaveLength(2);
    expect(insercionPaginas?.filas[0]).toMatchObject({
      document_id: clonDoc.id,
      content: 'Hola',
    });
  });

  it('clona TO-DO con sus items', async () => {
    estado.tablas.todos = [
      {
        id: 'todo-1',
        organization_id: 'org-1',
        workspace_id: 'ws-1',
        folder_id: null,
        name: 'Limpieza',
        visibility: 'public',
        position: 0,
      },
    ];
    estado.tablas.todo_items = [
      {
        id: 'i-1',
        todo_id: 'todo-1',
        name: 'Barrer',
        frequency: 'daily',
        interval_days: null,
        target_quantity: 1,
        active: true,
        week_days: null,
        due_time: null,
        position: 0,
      },
    ];

    const res = await app.request('/entidades/todo/todo-1/clonar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Copia de Limpieza' }),
    });
    expect(res.status).toBe(200);
    const clonTodo = (await res.json()) as { id: string };
    const insercionItems = estado.inserts.find((i) => i.tabla === 'todo_items');
    expect(insercionItems?.filas[0]).toMatchObject({
      todo_id: clonTodo.id,
      name: 'Barrer',
      created_by: estado.usuarioId,
    });
  });

  it('clona formulario como borrador sin token ni respuestas', async () => {
    estado.tablas.formularios = [
      {
        id: 'form-1',
        organization_id: 'org-1',
        workspace_id: 'ws-1',
        folder_id: null,
        name: 'Encuesta',
        description: 'Encuesta anual',
        visibility: 'public',
        estado: 'publicado',
        position: 0,
        esquema: { version: 1, secciones: [] },
        ajustes: { modo_acceso: 'publico' },
        token_publico_hash: 'hash-viejo',
        codigo_publico: 'abc123',
        publicado_at: '2026-01-01',
      },
    ];

    const res = await app.request('/entidades/formulario/form-1/clonar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Copia de Encuesta' }),
    });
    expect(res.status).toBe(200);
    const insercionForm = estado.inserts.find((i) => i.tabla === 'formularios');
    expect(insercionForm?.filas[0]).toMatchObject({
      name: 'Copia de Encuesta',
      estado: 'borrador',
      token_publico_hash: null,
      codigo_publico: null,
      publicado_at: null,
      description: 'Encuesta anual',
      created_by: estado.usuarioId,
    });
  });
});
