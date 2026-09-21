import type { SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import { isFullUuid, matchParam } from '@erp/shared';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { crearNotificaciones } from '../lib/notificaciones';
import { mapearError } from './entidades';

export const rutasTareas = new Hono<{ Variables: VariablesDatos }>();

rutasTareas.use('/*', clienteUsuarioMiddleware);

const TAREA_SELECT = '*, assigned_profile:profiles!tasks_assigned_to_fkey(id, full_name), shift:shifts(name)';

// Listados (board, pipeline, calendario, subtareas): sin `description`,
// que solo consume el detalle de tarea y suele ser el campo más pesado.
const COLUMNAS_TAREA_LISTA =
  'id, organization_id, parent_task_id, list_id, title, status, priority, assigned_to, created_by, shift_id, due_date, due_time, start_date, estimated_hours, position, status_position, created_at, updated_at, completed_at';
const TAREA_SELECT_LISTA = `${COLUMNAS_TAREA_LISTA}, assigned_profile:profiles!tasks_assigned_to_fkey(id, full_name), shift:shifts(name)`;

export { TAREA_SELECT_LISTA };

// Resuelve el param de ruta (UUID completo, prefijo corto sin guiones o
// slug del título) al id real de la tarea visible para el usuario. El
// SPA navega con prefijos cortos; si su contexto de lista está en
// vuelo, el detalle cae aquí sin depender del cliente.
async function resolverTareaId(
  supabase: SupabaseClient,
  param: string
): Promise<string> {
  if (isFullUuid(param)) return param;
  const compact = param.replace(/-/g, '');
  const { data } = await supabase
    .from('tasks')
    .select('id, title')
    .limit(1000);
  const hit = (data ?? []).find(
    (t) =>
      t.id.replace(/-/g, '').startsWith(compact) ||
      matchParam(param, t.id, t.title)
  );
  return hit?.id ?? param;
}

// GET /tareas — board/pipeline/calendario/dashboard según query.
//  - list_id=          → tareas de la lista (board)
//  - organization_id=  → tareas de la org (pipeline: role/user_id filtran asignados;
//                        due_not_null=true para calendario; limit=500 para dashboard)
//  - solo_ids=true     → solo {id} (resolver prefijo corto)
//  - q=                → filtra por título (ilike, menciones del editor)
rutasTareas.get('/', async (c) => {
  const supabase = c.get('supabase');
  const listId = c.req.query('list_id');
  const orgId = c.req.query('organization_id');
  const role = c.req.query('role');
  const userId = c.req.query('user_id');
  const dueNotNull = c.req.query('due_not_null') === 'true';
  const soloIds = c.req.query('solo_ids') === 'true';
  const busqueda = c.req.query('q')?.trim();
  const limitRaw = c.req.query('limit');

  let query = supabase.from('tasks').select(soloIds ? 'id' : TAREA_SELECT_LISTA);
  if (listId) query = query.eq('list_id', listId);
  if (busqueda) {
    // Escapa comodines de `ilike` para que la búsqueda sea literal.
    const patron = `%${busqueda.replace(/[%_\\]/g, '\\$&')}%`;
    query = query.ilike('title', patron);
  }
  if (orgId) {
    query = query.eq('organization_id', orgId);
    if (dueNotNull) query = query.not('due_date', 'is', null);
  }
  if (role === 'collaborator' && userId) query = query.eq('assigned_to', userId);
  query = query.order('position', { ascending: true });
  if (soloIds) {
    const { data, error } = await query;
    if (error) return mapearError(c, error);
    return c.json({ tasks: data ?? [] });
  }
  query = query.order('created_at', { ascending: false });
  // Límite default para no bajar la org completa (500 tareas).
  const LIMITE_DEFAULT = 500;
  const limite = limitRaw
    ? z.coerce.number().int().min(1).max(1000).safeParse(limitRaw)
    : { success: true as const, data: LIMITE_DEFAULT };
  if (!limite.success) return c.json({ error: 'limit inválido' }, 400);
  query = query.limit(limite.data);
  const { data, error } = await query;
  if (error) return mapearError(c, error);
  return c.json({ tasks: data ?? [] });
});

// GET /tareas/contexto?organization_id= — colaboradores + config de listas +
// estructura mínima (pipeline: filtros por espacio de trabajo).
rutasTareas.get('/contexto', async (c) => {
  const supabase = c.get('supabase');
  const orgId = c.req.query('organization_id');
  if (!orgId) return c.json({ error: 'organization_id requerido' }, 400);
  const [collabRes, listsRes, workspacesRes, foldersRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role').eq('organization_id', orgId).eq('blocked', false),
    supabase
      .from('task_lists')
      .select('id, name, workspace_id, folder_id, statuses, priorities')
      .eq('organization_id', orgId),
    supabase
      .from('workspaces')
      .select('id, name, default_statuses, default_priorities')
      .eq('organization_id', orgId),
    supabase.from('workspace_folders').select('id, name, workspace_id'),
  ]);
  if (collabRes.error) return mapearError(c, collabRes.error);
  return c.json({
    collaborators: collabRes.data ?? [],
    lists: listsRes.data ?? [],
    workspaces: workspacesRes.data ?? [],
    folders: foldersRes.data ?? [],
  });
});

// GET /tareas/conteo-notas?task_ids=a,b,c — notas por tarea.
rutasTareas.get('/conteo-notas', async (c) => {
  const supabase = c.get('supabase');
  const raw = c.req.query('task_ids');
  if (!raw) return c.json({ error: 'task_ids requerido' }, 400);
  const ids = raw.split(',').filter(Boolean);
  if (ids.length === 0) return c.json({ notas: {} });
  const { data, error } = await supabase.from('task_notes').select('task_id').in('task_id', ids);
  if (error) return mapearError(c, error);
  const notas: Record<string, number> = {};
  for (const n of data ?? []) notas[n.task_id] = (notas[n.task_id] ?? 0) + 1;
  return c.json({ notas });
});

// GET /tareas/posicion?list_id= — última posición de la lista.
rutasTareas.get('/posicion', async (c) => {
  const supabase = c.get('supabase');
  const listId = c.req.query('list_id');
  if (!listId) return c.json({ error: 'list_id requerido' }, 400);
  const { data, error } = await supabase
    .from('tasks')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1);
  if (error) return mapearError(c, error);
  return c.json({ posicion: (data?.[0]?.position as number | undefined) ?? 0 });
});

const esquemaCrear = z.object({
  title: z.string().min(1),
  status: z.string().min(1),
  priority: z.string().min(1),
  assigned_to: z.string().uuid().nullable().optional(),
  shift_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  due_time: z.string().nullable().optional(),
  estimated_hours: z.number().nullable().optional(),
  parent_task_id: z.string().uuid().nullable().optional(),
  list_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_by: z.string().uuid(),
  position: z.number().int().min(0),
  status_position: z.number().int().min(0).optional(),
});

// POST /tareas — crear (con joins para optimismo).
rutasTareas.post('/', async (c) => {
  const supabase = c.get('supabase');
  const body = esquemaCrear.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: body.data.title,
      status: body.data.status,
      priority: body.data.priority,
      assigned_to: body.data.assigned_to ?? null,
      shift_id: body.data.shift_id ?? null,
      due_date: body.data.due_date ?? null,
      due_time: body.data.due_time ?? null,
      estimated_hours: body.data.estimated_hours ?? null,
      parent_task_id: body.data.parent_task_id ?? null,
      list_id: body.data.list_id,
      organization_id: body.data.organization_id,
      created_by: body.data.created_by,
      position: body.data.position,
      status_position: body.data.status_position ?? 0,
    })
    .select(TAREA_SELECT)
    .single();
  if (error) return mapearError(c, error, 'No se pudo crear la tarea');
  if (data?.assigned_to && data.assigned_to !== data.created_by) {
    await crearNotificaciones({
      actorId: data.created_by,
      destinatarioIds: [data.assigned_to],
      tipo: 'task_assigned',
      pref: 'task_assigned',
      titulo: `Te asignaron la tarea «${data.title}»`,
      referenciaTipo: 'task',
      referenciaId: data.id,
    });
  }
  return c.json({ tarea: data });
});

const esquemaPatch = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().min(1).optional(),
  priority: z.string().min(1).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  shift_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  due_time: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  estimated_hours: z.number().nullable().optional(),
  parent_task_id: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

// PATCH /tareas/:id
rutasTareas.patch('/:id', async (c) => {
  const supabase = c.get('supabase');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id requerido' }, 400);
  const body = esquemaPatch.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const { data: actual } = await supabase
    .from('tasks')
    .select('title, assigned_to, status, created_by')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('tasks').update(body.data as never).eq('id', id);
  if (error) return mapearError(c, error, 'No se pudo guardar la tarea');

  const actorId = c.get('usuarioId');
  const nuevoAsignado = body.data.assigned_to;
  if (
    actual &&
    nuevoAsignado !== undefined &&
    nuevoAsignado &&
    nuevoAsignado !== actual.assigned_to
  ) {
    await crearNotificaciones({
      actorId,
      destinatarioIds: [nuevoAsignado],
      tipo: 'task_assigned',
      pref: 'task_assigned',
      titulo: `Te asignaron la tarea «${actual.title}»`,
      referenciaTipo: 'task',
      referenciaId: id,
    });
  }
  if (actual && body.data.status !== undefined && body.data.status !== actual.status) {
    const asignado = nuevoAsignado ?? actual.assigned_to;
    if (asignado) {
      await crearNotificaciones({
        actorId,
        destinatarioIds: [asignado],
        tipo: 'task_status',
        pref: 'task_status',
        titulo: `La tarea «${actual.title}» cambió a ${body.data.status}`,
        referenciaTipo: 'task',
        referenciaId: id,
      });
    }
  }

  return c.json({ success: true });
});

// DELETE /tareas/:id
rutasTareas.delete('/:id', async (c) => {
  const supabase = c.get('supabase');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id requerido' }, 400);
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) return mapearError(c, error, 'No se pudo eliminar la tarea');
  return c.json({ success: true });
});

// POST /tareas/reordenar — batch posiciones (y parent si viene).
rutasTareas.post('/reordenar', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({
    parent_task_id: z.string().uuid().nullable().optional(),
    mover: z.string().uuid().optional(),
    items: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) })),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  if (body.data.mover && body.data.parent_task_id !== undefined) {
    const { error } = await supabase
      .from('tasks')
      .update({ parent_task_id: body.data.parent_task_id })
      .eq('id', body.data.mover);
    if (error) return mapearError(c, error);
  }

  const resultados = await Promise.all(
    body.data.items.map((item) =>
      supabase.from('tasks').update({ position: item.position }).eq('id', item.id)
    )
  );
  const fallo = resultados.find((r) => r.error)?.error;
  if (fallo) return mapearError(c, fallo);
  return c.json({ success: true });
});

// POST /tareas/pipeline/reordenar — movimiento del kanban global: status +
// status_position por tarjeta, en una transacción (RPC, RLS del usuario).
rutasTareas.post('/pipeline/reordenar', async (c) => {
  const supabase = c.get('supabase');
  const body = z
    .object({
      items: z
        .array(
          z.object({
            id: z.string().uuid(),
            status: z.string().min(1),
            status_position: z.number().int().min(0),
          })
        )
        .min(1)
        .max(1000),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const { error } = await supabase.rpc('reordenar_pipeline', {
    items: body.data.items,
  });
  if (error) return mapearError(c, error, 'No se pudo mover la tarjeta');
  return c.json({ success: true });
});

// GET /tareas/:id — detalle con joins.
rutasTareas.get('/:id', async (c) => {
  const supabase = c.get('supabase');
  const id = await resolverTareaId(supabase, c.req.param('id'));
  const { data, error } = await supabase.from('tasks').select(TAREA_SELECT).eq('id', id).single();
  if (error) return mapearError(c, error, 'Tarea no encontrada');
  return c.json({ tarea: data });
});

// GET /tareas/:id/notas — notas asc con autor (limit default 200).
rutasTareas.get('/:id/notas', async (c) => {
  const supabase = c.get('supabase');
  const id = await resolverTareaId(supabase, c.req.param('id'));
  const { data, error } = await supabase
    .from('task_notes')
    .select('*, author:profiles!task_notes_author_id_fkey(full_name)')
    .eq('task_id', id)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return mapearError(c, error);
  return c.json({ notas: data ?? [] });
});

// GET /tareas/:id/notas/recientes?limit=30 — últimas notas desc.
rutasTareas.get('/:id/notas/recientes', async (c) => {
  const supabase = c.get('supabase');
  const id = await resolverTareaId(supabase, c.req.param('id'));
  const limit = z.coerce.number().int().min(1).max(100).safeParse(c.req.query('limit') ?? '30');
  if (!limit.success) return c.json({ error: 'limit inválido' }, 400);
  const { data, error } = await supabase
    .from('task_notes')
    .select('*, author:profiles!task_notes_author_id_fkey(full_name)')
    .eq('task_id', id)
    .order('created_at', { ascending: false })
    .limit(limit.data);
  if (error) return mapearError(c, error);
  return c.json({ notas: data ?? [] });
});

// GET /tareas/:id/actividad — timeline (limit default 200).
rutasTareas.get('/:id/actividad', async (c) => {
  const supabase = c.get('supabase');
  const id = await resolverTareaId(supabase, c.req.param('id'));
  const { data, error } = await supabase
    .from('task_activity_log')
    .select('*, user:profiles!task_activity_log_user_id_fkey(full_name)')
    .eq('task_id', id)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return mapearError(c, error);
  return c.json({ actividad: data ?? [] });
});

// GET /tareas/:id/subtareas
rutasTareas.get('/:id/subtareas', async (c) => {
  const supabase = c.get('supabase');
  const id = await resolverTareaId(supabase, c.req.param('id'));
  const { data, error } = await supabase
    .from('tasks')
    .select(TAREA_SELECT_LISTA)
    .eq('parent_task_id', id)
    .order('position', { ascending: true });
  if (error) return mapearError(c, error);
  return c.json({ tareas: data ?? [] });
});

// GET /tareas/:id/padre — título del padre.
rutasTareas.get('/:id/padre', async (c) => {
  const supabase = c.get('supabase');
  const id = await resolverTareaId(supabase, c.req.param('id'));
  const { data, error } = await supabase.from('tasks').select('title').eq('id', id).single();
  if (error) return mapearError(c, error, 'Padre no encontrado');
  return c.json({ titulo: data?.title });
});

// POST /tareas/:id/notas — crear nota con autor.
rutasTareas.post('/:id/notas', async (c) => {
  const supabase = c.get('supabase');
  const id = await resolverTareaId(supabase, c.req.param('id'));
  const body = z.object({ author_id: z.string().uuid(), content: z.string().min(1) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { data, error } = await supabase
    .from('task_notes')
    .insert({ task_id: id, author_id: body.data.author_id, content: body.data.content })
    .select('*, author:profiles!task_notes_author_id_fkey(full_name)')
    .single();
  if (error) return mapearError(c, error, 'No se pudo enviar el comentario');

  const { data: tarea } = await supabase
    .from('tasks')
    .select('title, assigned_to, created_by')
    .eq('id', id)
    .maybeSingle();
  if (tarea) {
    await crearNotificaciones({
      actorId: body.data.author_id,
      destinatarioIds: [tarea.assigned_to, tarea.created_by].filter(
        (v): v is string => Boolean(v),
      ),
      tipo: 'note_added',
      pref: 'note_added',
      titulo: `Nuevo comentario en «${tarea.title}»`,
      cuerpo: body.data.content.slice(0, 160),
      referenciaTipo: 'task',
      referenciaId: id,
    });
  }

  return c.json({ nota: data });
});