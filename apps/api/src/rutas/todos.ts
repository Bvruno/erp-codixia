import type { SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import { isFullUuid, matchParam } from '@erp/shared';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { mapearError } from './entidades';

export const rutasTodos = new Hono<{ Variables: VariablesDatos }>();

rutasTodos.use('/*', clienteUsuarioMiddleware);

// Resuelve el param de ruta (UUID completo, prefijo corto o slug del
// nombre) al TODO real visible para el usuario. El SPA navega con
// slugs; si el contexto de estructura aún no tiene la entidad
// (refetch en vuelo), la vista cae aquí sin depender del contexto.
const TODO_RESUELTO_SELECT = 'id, name, workspace_id, folder_id, position, visibility';
type TodoResuelto = {
  id: string;
  name: string;
  workspace_id: string | null;
  folder_id: string | null;
  position: number;
  visibility: string | null;
};

async function resolverTodo(
  supabase: SupabaseClient,
  param: string
): Promise<TodoResuelto | null> {
  if (isFullUuid(param)) {
    const { data } = await supabase
      .from('todos')
      .select(TODO_RESUELTO_SELECT)
      .eq('id', param)
      .maybeSingle();
    return (data as TodoResuelto | null) ?? null;
  }
  const compact = param.replace(/-/g, '');
  const { data } = await supabase
    .from('todos')
    .select(TODO_RESUELTO_SELECT)
    .limit(1000);
  const hit = (data ?? []).find(
    (t) =>
      t.id.replace(/-/g, '').startsWith(compact) ||
      matchParam(param, t.id, t.name)
  );
  return (hit as TodoResuelto | undefined) ?? null;
}

// GET /todos/:id/resolver — TODO real (id + campos) a partir de
// slug/prefijo (fallback del SPA cuando la estructura no resuelve la
// entidad recién creada).
rutasTodos.get('/:id/resolver', async (c) => {
  const supabase = c.get('supabase');
  const todo = await resolverTodo(supabase, c.req.param('id'));
  if (!todo) return c.json({ error: 'TO-DO no encontrado' }, 404);
  return c.json({ todo });
});

// GET /todos/:id/board — RPC todo_board + timezone + preferencias.
rutasTodos.get('/:id/board', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const todo = await resolverTodo(supabase, c.req.param('id'));
  if (!todo) return c.json({ error: 'TO-DO no encontrado' }, 404);
  const [boardRes, tzRes, profileRes] = await Promise.all([
    supabase.rpc('todo_board', { p_todo_id: todo.id }),
    supabase.from('org_settings').select('timezone').single(),
    supabase.from('profiles').select('preferences').eq('id', usuarioId).single(),
  ]);
  if (boardRes.error) return mapearError(c, boardRes.error);
  return c.json({
    todo_id: todo.id,
    rows: boardRes.data ?? [],
    timezone: tzRes.data?.timezone ?? 'UTC',
    preferences: profileRes.data?.preferences ?? null,
  });
});

const esquemaItem = z.object({
  name: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'shift', 'interval']),
  interval_days: z.number().nullable().optional(),
  target_quantity: z.number().optional(),
  week_days: z.array(z.number()).nullable().optional(),
  due_time: z.string().nullable().optional(),
  position: z.number().int().min(0),
  created_by: z.string().uuid(),
});

// POST /todos/:id/items — crear varios items a la vez.
rutasTodos.post('/:id/items', async (c) => {
  const supabase = c.get('supabase');
  const todo = await resolverTodo(supabase, c.req.param('id'));
  if (!todo) return c.json({ error: 'TO-DO no encontrado' }, 404);
  const body = z.object({ items: z.array(esquemaItem) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('todo_items').insert(
    body.data.items.map((i) => ({ todo_id: todo.id, ...i, interval_days: i.interval_days ?? null, target_quantity: i.target_quantity ?? 1, week_days: i.week_days ?? null, due_time: i.due_time ?? null }))
  );
  if (error) return mapearError(c, error, 'No se pudieron crear los items');
  return c.json({ success: true });
});

// PATCH /todos/:id/items/:itemId
rutasTodos.patch('/:id/items/:itemId', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({
    name: z.string().min(1).optional(),
    frequency: z.enum(['daily', 'weekly', 'shift', 'interval']).optional(),
    interval_days: z.number().nullable().optional(),
    target_quantity: z.number().optional(),
    active: z.boolean().optional(),
    week_days: z.array(z.number()).nullable().optional(),
    due_time: z.string().nullable().optional(),
    position: z.number().int().min(0).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.from('todo_items').update(body.data as never).eq('id', c.req.param('itemId'));
  if (error) return mapearError(c, error, 'No se pudo actualizar el item');
  return c.json({ success: true });
});

// DELETE /todos/:id/items/:itemId
rutasTodos.delete('/:id/items/:itemId', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase.from('todo_items').delete().eq('id', c.req.param('itemId'));
  if (error) return mapearError(c, error, 'No se pudo eliminar el item');
  return c.json({ success: true });
});

// POST /todos/:id/items/:itemId/tick — RPC todo_tick.
rutasTodos.post('/:id/items/:itemId/tick', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({ delta: z.number().int() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase.rpc('todo_tick', { p_item_id: c.req.param('itemId'), p_delta: body.data.delta });
  if (error) return mapearError(c, error, 'No se pudo registrar el progreso');
  return c.json({ success: true });
});