import { Hono } from 'hono';
import { z } from 'zod';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { mapearError } from './entidades';
import { TAREA_SELECT_LISTA } from './tareas';

export const rutasCalendario = new Hono<{ Variables: VariablesDatos }>();

rutasCalendario.use('/*', clienteUsuarioMiddleware);

// GET /calendario/datos — tareas con due_date + notas + árbol ligero +
// colaboradores + permisos de lista (solo no-admin).
rutasCalendario.get('/datos', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('organization_id, role, is_owner')
    .eq('id', usuarioId)
    .single();
  if (pErr || !profile?.organization_id) return c.json({ error: 'Perfil no encontrado' }, 404);
  const orgId = profile.organization_id;

  const [tasksRes, notesRes, listsRes, foldersRes, workspacesRes, docsRes, mapsRes, todosRes, collabRes] =
    await Promise.all([
      supabase
        .from('tasks')
        .select(TAREA_SELECT_LISTA)
        .eq('organization_id', orgId)
        .not('due_date', 'is', null),
      // Sin drawing/image: son data-URLs/trazos pesados que solo se usan al
      // abrir la nota (GET /calendario/notas/:id).
      supabase
        .from('notes')
        .select('id, organization_id, note_date, title, content, created_by, created_at, updated_at')
        .eq('organization_id', orgId),
      supabase.from('task_lists').select('*').eq('organization_id', orgId),
      supabase.from('workspace_folders').select('*'),
      supabase.from('workspaces').select('*').eq('organization_id', orgId),
      supabase.from('documents').select('id, name').eq('organization_id', orgId),
      supabase.from('mind_maps').select('id, name').eq('organization_id', orgId),
      supabase.from('todos').select('id, name').eq('organization_id', orgId),
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('organization_id', orgId)
        .eq('blocked', false),
    ]);

  let writableIds: string[] | null = null;
  if (profile.role !== 'admin') {
    const lists = (listsRes.data ?? []) as { id: string }[];
    const ids = lists.map((l) => l.id);
    // Una sola RPC para todas las listas (antes era 1 por lista).
    const { data: bulk, error: bulkErr } = await supabase.rpc('entity_permissions_bulk', {
      e_type: 'list',
      e_ids: ids,
    });
    if (!bulkErr && Array.isArray(bulk)) {
      const permitidas = new Set(
        (bulk as { entity_id: string; permission: string | null }[])
          .filter((p) => p.permission === 'write' || p.permission === 'manage')
          .map((p) => p.entity_id)
      );
      writableIds = ids.filter((id) => permitidas.has(id));
    } else {
      // Fallback si la función bulk no está desplegada.
      const perms = await Promise.all(
        lists.map((l) => supabase.rpc('entity_permission', { e_type: 'list', e_id: l.id }))
      );
      writableIds = lists.filter((_, i) => {
        const p = perms[i].data;
        return p === 'write' || p === 'manage';
      }).map((l) => l.id);
    }
  }

  return c.json({
    profile: { organization_id: orgId, role: profile.role, is_owner: profile.is_owner },
    tasks: tasksRes.data ?? [],
    notes: notesRes.data ?? [],
    lists: listsRes.data ?? [],
    folders: foldersRes.data ?? [],
    workspaces: workspacesRes.data ?? [],
    documents: docsRes.data ?? [],
    mindmaps: mapsRes.data ?? [],
    todos: todosRes.data ?? [],
    collaborators: collabRes.data ?? [],
    writable_list_ids: writableIds,
  });
});

const esquemaNota = z.object({
  note_date: z.string(),
  title: z.string().min(1),
  content: z.string().nullable().optional(),
  drawing: z.unknown().nullable().optional(),
  image: z.string().nullable().optional(),
});

// GET /calendario/notas/:id — nota completa (incluye drawing/image).
rutasCalendario.get('/notas/:id', async (c) => {
  const supabase = c.get('supabase');
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', c.req.param('id'))
    .single();
  if (error) return mapearError(c, error, 'No se pudo cargar la nota');
  return c.json({ nota: data });
});

// POST /calendario/notas
rutasCalendario.post('/notas', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const body = esquemaNota.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', usuarioId).single();
  if (!profile?.organization_id) return c.json({ error: 'Perfil no encontrado' }, 404);
  const { error } = await supabase.from('notes').insert({
    note_date: body.data.note_date,
    title: body.data.title,
    content: body.data.content ?? null,
    drawing: body.data.drawing ?? null,
    image: body.data.image ?? null,
    organization_id: profile.organization_id,
    created_by: usuarioId,
  });
  if (error) return mapearError(c, error, 'No se pudo guardar la nota');
  return c.json({ success: true });
});

// PUT /calendario/notas/:id
rutasCalendario.put('/notas/:id', async (c) => {
  const supabase = c.get('supabase');
  const body = esquemaNota.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const { error } = await supabase
    .from('notes')
    .update({
      note_date: body.data.note_date,
      title: body.data.title,
      content: body.data.content ?? null,
      drawing: body.data.drawing ?? null,
      image: body.data.image ?? null,
    })
    .eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo guardar la nota');
  return c.json({ success: true });
});

// DELETE /calendario/notas/:id
rutasCalendario.delete('/notas/:id', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase.from('notes').delete().eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo eliminar la nota');
  return c.json({ success: true });
});