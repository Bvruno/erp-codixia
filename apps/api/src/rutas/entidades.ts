import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { ejecutarEscritura, sinPermisoEscritura } from '../lib/escrituras';

export const rutasEntidades = new Hono<{ Variables: VariablesDatos }>();

rutasEntidades.use('/*', clienteUsuarioMiddleware);

export const TIPO_ENTIDAD = z.enum(['workspace', 'folder', 'list', 'document', 'mindmap', 'todo', 'formulario']);

export function tablaDeTipo(tipo: z.infer<typeof TIPO_ENTIDAD>): string {
  switch (tipo) {
    case 'workspace': return 'workspaces';
    case 'folder': return 'workspace_folders';
    case 'list': return 'task_lists';
    case 'document': return 'documents';
    case 'mindmap': return 'mind_maps';
    case 'todo': return 'todos';
    case 'formulario': return 'formularios';
  }
}

export function mapearError(
  c: { json: (b: unknown, s?: number) => Response },
  error: { message?: string; code?: string },
  fallback = 'Error del servidor'
): Response {
  const code = error.code;
  // RLS / privilegios: el mensaje crudo de Postgres no le dice nada al
  // usuario; se traduce a una acción concreta.
  if (code?.startsWith('42501')) {
    return c.json(
      {
        error:
          'No tienes permiso para realizar esta acción. Pide acceso a un administrador.',
        code,
      },
      403
    );
  }
  if (code === '23505') {
    return c.json(
      { error: 'Ya existe un elemento con ese nombre en este lugar', code },
      409
    );
  }
  // FK del contenedor: el destino ya no existe (o no es visible).
  if (code === '23503' && error.message?.includes('entities_parent_id_fkey')) {
    return c.json(
      { error: 'El destino ya no existe o no tienes acceso a él', code },
      400
    );
  }
  return c.json({ error: error.message ?? fallback, code: code ?? undefined }, 400);
}

// GET /entidades/arbol — estructura completa de la org (mismo shape que
// el fetch del SPA): perfil + árbol + conteos + colaboradores + grants.
rutasEntidades.get('/arbol', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');

  const { data: p, error: pErr } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', usuarioId)
    .single();
  if (pErr || !p) return c.json({ error: 'Perfil no encontrado' }, 404);
  const orgId = p.organization_id;

  const [wsRes, foldersRes, listsRes, docsRes, mapsRes, todosRes, formulariosRes, listTasksRes, todoItemsRes, respuestasRes, collabRes, evRes] =
    await Promise.all([
      supabase.from('workspaces').select('*').eq('organization_id', orgId).order('position', { ascending: true }),
      // workspace_folders no tiene organization_id: RLS acota v��a workspace.
      supabase.from('workspace_folders').select('*').order('position', { ascending: true }),
      supabase.from('task_lists').select('*').eq('organization_id', orgId).order('position', { ascending: true }),
      supabase.from('documents').select('*').eq('organization_id', orgId).order('position', { ascending: true }),
      // El ǭrbol no necesita `content` (snapshot completo, puede ser pesado):
      // el editor lo carga con GET /mapas/:id/contenido.
      supabase
        .from('mind_maps')
        .select('id, organization_id, workspace_id, folder_id, name, visibility, position, created_by, created_at, updated_at')
        .eq('organization_id', orgId)
        .order('position', { ascending: true }),
      supabase.from('todos').select('*').eq('organization_id', orgId).order('position', { ascending: true }),
      // El árbol solo necesita metadatos del formulario; esquema y ajustes
      // se cargan al abrir el editor (GET /formularios/:id).
      supabase
        .from('formularios')
        .select('id, organization_id, workspace_id, folder_id, name, description, visibility, estado, position, publicado_at, created_by, created_at, updated_at')
        .eq('organization_id', orgId)
        .order('position', { ascending: true }),
      supabase.from('tasks').select('list_id').eq('organization_id', orgId),
      supabase.from('todo_items').select('todo_id'),
      supabase.from('formulario_respuestas').select('formulario_id'),
      supabase.from('profiles').select('id, full_name, role, is_owner').eq('organization_id', orgId).eq('blocked', false),
      supabase.from('entity_visibility').select('entity_type, entity_id, profile_id, permission, inherit'),
    ]);

  return c.json({
    profile: { organization_id: orgId, role: p.role },
    workspaces: wsRes.data ?? [],
    folders: foldersRes.data ?? [],
    lists: listsRes.data ?? [],
    documents: docsRes.data ?? [],
    mindmaps: mapsRes.data ?? [],
    todos: todosRes.data ?? [],
    formularios: formulariosRes.data ?? [],
    tasks: listTasksRes.data ?? [],
    todo_items: todoItemsRes.data ?? [],
    formulario_respuestas: respuestasRes.data ?? [],
    collaborators: collabRes.data ?? [],
    grants: evRes.data ?? [],
  });
});

// GET /entidades/conteos — tareas por lista + items por todo (refetch realtime).
rutasEntidades.get('/conteos', async (c) => {
  const supabase = c.get('supabase');
  const orgId = c.req.query('organization_id');
  if (!orgId) return c.json({ error: 'organization_id requerido' }, 400);
  const [tasksRes, todoItemsRes, respuestasRes] = await Promise.all([
    supabase.from('tasks').select('list_id').eq('organization_id', orgId),
    supabase.from('todo_items').select('todo_id'),
    supabase.from('formulario_respuestas').select('formulario_id'),
  ]);
  return c.json({
    tasks: tasksRes.data ?? [],
    todo_items: todoItemsRes.data ?? [],
    formulario_respuestas: respuestasRes.data ?? [],
  });
});

// GET /entidades/permiso?type&id — entity_permission RPC.
rutasEntidades.get('/permiso', async (c) => {
  const supabase = c.get('supabase');
  const tipo = TIPO_ENTIDAD.safeParse(c.req.query('type'));
  const id = c.req.query('id');
  if (!tipo.success || !id) return c.json({ error: 'type e id requeridos' }, 400);
  const { data, error } = await supabase.rpc('entity_permission', { e_type: tipo.data, e_id: id });
  if (error) return mapearError(c, error);
  return c.json({ permiso: data });
});

// GET /entidades/grants?profile_id= — grants de un perfil (colaboradores).
rutasEntidades.get('/grants', async (c) => {
  const supabase = c.get('supabase');
  const profileId = c.req.query('profile_id');
  if (!profileId) return c.json({ error: 'profile_id requerido' }, 400);
  const { data, error } = await supabase
    .from('entity_visibility')
    .select('*')
    .eq('profile_id', profileId);
  if (error) return mapearError(c, error);
  return c.json({ grants: data ?? [] });
});

const esquemaCrear = z.discriminatedUnion('type', [
  z.object({ type: z.literal('workspace'), organization_id: z.string().uuid(), name: z.string().min(1), position: z.number().int().min(0), visibility: z.enum(['public', 'private', 'restricted']) }),
  z.object({ type: z.literal('folder'), workspace_id: z.string().uuid(), parent_folder_id: z.string().uuid().nullable(), name: z.string().min(1), position: z.number().int().min(0), visibility: z.enum(['public', 'private', 'restricted']) }),
  z.object({ type: z.literal('list'), workspace_id: z.string().uuid(), folder_id: z.string().uuid().nullable(), organization_id: z.string().uuid(), name: z.string().min(1), position: z.number().int().min(0), visibility: z.enum(['public', 'private', 'restricted']) }),
  z.object({ type: z.literal('document'), workspace_id: z.string().uuid(), folder_id: z.string().uuid().nullable(), organization_id: z.string().uuid(), name: z.string().min(1), position: z.number().int().min(0), visibility: z.enum(['public', 'private', 'restricted']) }),
  z.object({ type: z.literal('mindmap'), workspace_id: z.string().uuid(), folder_id: z.string().uuid().nullable(), organization_id: z.string().uuid(), name: z.string().min(1), content: z.unknown(), position: z.number().int().min(0), visibility: z.enum(['public', 'private', 'restricted']) }),
  z.object({ type: z.literal('todo'), workspace_id: z.string().uuid(), folder_id: z.string().uuid().nullable(), organization_id: z.string().uuid(), name: z.string().min(1), position: z.number().int().min(0), visibility: z.enum(['public', 'private', 'restricted']) }),
  z.object({ type: z.literal('formulario'), workspace_id: z.string().uuid(), folder_id: z.string().uuid().nullable(), organization_id: z.string().uuid(), name: z.string().min(1), position: z.number().int().min(0), visibility: z.enum(['public', 'private', 'restricted']) }),
]);

const esquemaGrants = z.object({
  grants: z.array(z.object({
    profile_id: z.string().uuid(),
    permission: z.enum(['read', 'write', 'manage']),
    inherit: z.boolean(),
  })),
  removed_ids: z.array(z.string().uuid()).optional(),
  replace: z.boolean().optional(),
});

// Valida el destino ANTES de insertar: sin esto, un contenedor sin
// permiso llega al INSERT y RLS responde un 42501 críptico; un contenedor
// inexistente revienta en el trigger de proyección con un FK de `entities`.
async function validarDestino(
  supabase: SupabaseClient,
  usuarioId: string,
  input: z.infer<typeof esquemaCrear>
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.type === 'workspace') {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role, organization_id')
      .eq('id', usuarioId)
      .maybeSingle();
    if (perfil?.role !== 'admin' || perfil.organization_id !== input.organization_id) {
      return {
        ok: false,
        error: 'Solo un administrador puede crear áreas de trabajo',
      };
    }
    return { ok: true };
  }

  const contenedor =
    input.type === 'folder'
      ? input.parent_folder_id ?? input.workspace_id
      : input.folder_id ?? input.workspace_id;
  const { data, error } = await supabase.rpc('entity_writable', {
    e_id: contenedor,
  });
  if (error || data !== true) {
    return {
      ok: false,
      error:
        'No tienes permiso para crear aquí. El destino no existe o no tienes acceso.',
    };
  }
  return { ok: true };
}

// POST /entidades — crea entidad (trigger grant_creator_access da manage).
rutasEntidades.post('/', async (c) => {
  const supabase = c.get('supabase');
  const body = esquemaCrear.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const input = body.data;

  const permiso = await validarDestino(supabase, c.get('usuarioId'), input);
  if (!permiso.ok) return c.json({ error: permiso.error, code: '42501' }, 403);

  // Los INSERT no usan `.select()`/RETURNING a propósito: las policies de
  // SELECT de estas tablas dependen de la proyección en `entities`, que el
  // trigger BEFORE INSERT de la misma sentencia no hace visible al chequeo
  // RLS del RETURNING (mismo command id) → 42501 "new row violates
  // row-level security policy". El id se genera aquí y se devuelve directo.
  const id = randomUUID();

  if (input.type === 'workspace') {
    const { error } = await supabase
      .from('workspaces')
      .insert({ id, organization_id: input.organization_id, name: input.name, position: input.position, visibility: input.visibility });
    if (error) return mapearError(c, error, 'No se pudo crear el área de trabajo');
    return c.json({ id });
  }

  if (input.type === 'folder') {
    const { error } = await supabase
      .from('workspace_folders')
      .insert({ id, workspace_id: input.workspace_id, parent_folder_id: input.parent_folder_id, name: input.name, position: input.position, visibility: input.visibility });
    if (error) return mapearError(c, error, 'No se pudo crear la carpeta');
    return c.json({ id });
  }

  if (input.type === 'list') {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('default_statuses, default_priorities')
      .eq('id', input.workspace_id)
      .single();
    const { error } = await supabase
      .from('task_lists')
      .insert({
        id,
        folder_id: input.folder_id,
        workspace_id: input.workspace_id,
        organization_id: input.organization_id,
        name: input.name,
        statuses: ws?.default_statuses ?? null,
        priorities: ws?.default_priorities ?? null,
        position: input.position,
        visibility: input.visibility,
      });
    if (error) return mapearError(c, error, 'No se pudo crear la lista');
    return c.json({ id });
  }

  if (input.type === 'document') {
    const { error } = await supabase
      .from('documents')
      .insert({ id, folder_id: input.folder_id, workspace_id: input.workspace_id, name: input.name, organization_id: input.organization_id, position: input.position, visibility: input.visibility });
    if (error) return mapearError(c, error, 'No se pudo crear el documento');
    await supabase.from('document_pages').insert({
      document_id: id,
      title: 'Hoja principal',
      content: '',
      is_main: true,
      position: 0,
    });
    return c.json({ id });
  }

  if (input.type === 'mindmap') {
    const { error } = await supabase
      .from('mind_maps')
      .insert({ id, folder_id: input.folder_id, workspace_id: input.workspace_id, organization_id: input.organization_id, name: input.name, content: input.content, position: input.position, visibility: input.visibility });
    if (error) return mapearError(c, error, 'No se pudo crear el mapa mental');
    return c.json({ id });
  }

  if (input.type === 'todo') {
    const { error } = await supabase
      .from('todos')
      .insert({ id, folder_id: input.folder_id, workspace_id: input.workspace_id, organization_id: input.organization_id, name: input.name, position: input.position, visibility: input.visibility });
    if (error) return mapearError(c, error, 'No se pudo crear el TO-DO');
    return c.json({ id });
  }

  const { error } = await supabase
    .from('formularios')
    .insert({ id, folder_id: input.folder_id, workspace_id: input.workspace_id, organization_id: input.organization_id, name: input.name, position: input.position, visibility: input.visibility });
  if (error) return mapearError(c, error, 'No se pudo crear el formulario');
  return c.json({ id });
});

const esquemaPatch = z.object({
  name: z.string().min(1).optional(),
  visibility: z.enum(['public', 'private', 'restricted']).optional(),
  statuses: z.unknown().optional(),
  priorities: z.unknown().optional(),
  default_statuses: z.unknown().optional(),
  default_priorities: z.unknown().optional(),
});

// PATCH /entidades/:type/:id — rename, visibility, statuses/priorities.
rutasEntidades.patch('/:type/:id', async (c) => {
  const supabase = c.get('supabase');
  const tipo = TIPO_ENTIDAD.safeParse(c.req.param('type'));
  const id = c.req.param('id');
  if (!tipo.success || !id) return c.json({ error: 'Entidad inválida' }, 400);
  const body = esquemaPatch.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const patch: Record<string, unknown> = {};
  if (body.data.name !== undefined) patch.name = body.data.name;
  if (body.data.visibility !== undefined) patch.visibility = body.data.visibility;
  if (tipo.data === 'list') {
    if (body.data.statuses !== undefined) patch.statuses = body.data.statuses;
    if (body.data.priorities !== undefined) patch.priorities = body.data.priorities;
  }
  if (tipo.data === 'workspace') {
    if (body.data.default_statuses !== undefined) patch.default_statuses = body.data.default_statuses;
    if (body.data.default_priorities !== undefined) patch.default_priorities = body.data.default_priorities;
  }
  if (Object.keys(patch).length === 0) return c.json({ success: true });

  const { error, filas } = await ejecutarEscritura(
    supabase.from(tablaDeTipo(tipo.data)).update(patch).eq('id', id).select('id')
  );
  if (error) return mapearError(c, error, 'No se pudo actualizar');
  if (filas === 0) return sinPermisoEscritura(c);
  return c.json({ success: true });
});

// POST /entidades/:type/:id/mover — mover a otro workspace/carpeta.
rutasEntidades.post('/:type/:id/mover', async (c) => {
  const supabase = c.get('supabase');
  const tipo = TIPO_ENTIDAD.safeParse(c.req.param('type'));
  const id = c.req.param('id');
  if (!tipo.success || !id) return c.json({ error: 'Entidad inválida' }, 400);
  const body = z.object({
    workspace_id: z.string().uuid().optional(),
    folder_id: z.string().uuid().nullable().optional(),
    parent_folder_id: z.string().uuid().nullable().optional(),
    position: z.number().int().min(0).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const patch: Record<string, unknown> = {};
  if (tipo.data === 'folder') {
    if (body.data.workspace_id !== undefined) patch.workspace_id = body.data.workspace_id;
    if (body.data.parent_folder_id !== undefined) patch.parent_folder_id = body.data.parent_folder_id;
  } else {
    if (body.data.workspace_id !== undefined) patch.workspace_id = body.data.workspace_id;
    if (body.data.folder_id !== undefined) patch.folder_id = body.data.folder_id;
  }
  if (body.data.position !== undefined) patch.position = body.data.position;

  const { error, filas } = await ejecutarEscritura(
    supabase.from(tablaDeTipo(tipo.data)).update(patch).eq('id', id).select('id')
  );
  if (error) return mapearError(c, error, 'No se pudo mover');
  if (filas === 0) return sinPermisoEscritura(c);
  return c.json({ success: true });
});

// POST /entidades/:type/:id/clonar — copia profunda en el mismo contenedor.
// Clonable: lista (tareas + notas), documento (páginas), mapa mental
// (snapshot), TO-DO (items) y formulario (esquema/ajustes, sin respuestas,
// invitados ni publicación). Copia visibilidad y grants; el clon nace con
// manage para quien clona vía trigger grant_creator_access.
const TIPO_CLONABLE = z.enum(['list', 'document', 'mindmap', 'todo', 'formulario']);

rutasEntidades.post('/:type/:id/clonar', async (c) => {
  const supabase = c.get('supabase');
  const usuarioId = c.get('usuarioId');
  const tipo = TIPO_CLONABLE.safeParse(c.req.param('type'));
  const id = c.req.param('id');
  if (!tipo.success || !id) return c.json({ error: 'Entidad no clonable' }, 400);
  const body = z.object({ name: z.string().trim().min(1) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const tabla = tablaDeTipo(tipo.data);
  const { data: origen, error: origenError } = await supabase
    .from(tabla)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (origenError) return mapearError(c, origenError);
  if (!origen) return c.json({ error: 'Entidad no encontrada' }, 404);

  let posQuery = supabase
    .from(tabla)
    .select('position')
    .eq('workspace_id', origen.workspace_id);
  posQuery = origen.folder_id
    ? posQuery.eq('folder_id', origen.folder_id)
    : posQuery.is('folder_id', null);
  const { data: ultimas } = await posQuery
    .order('position', { ascending: false })
    .limit(1);
  const position = ((ultimas?.[0]?.position as number | undefined) ?? -1) + 1;

  const comun = {
    workspace_id: origen.workspace_id,
    folder_id: origen.folder_id,
    organization_id: origen.organization_id,
    name: body.data.name,
    position,
    visibility: origen.visibility,
  };

  // Sin RETURNING por el mismo motivo que POST /entidades: la proyección
  // en `entities` no es visible al chequeo SELECT del RETURNING.
  const nuevoId = randomUUID();
  let fila: Record<string, unknown>;
  if (tipo.data === 'list') {
    fila = { id: nuevoId, ...comun, statuses: origen.statuses ?? null, priorities: origen.priorities ?? null };
  } else if (tipo.data === 'mindmap') {
    fila = { id: nuevoId, ...comun, content: origen.content, created_by: usuarioId };
  } else if (tipo.data === 'formulario') {
    fila = {
      id: nuevoId,
      ...comun,
      description: origen.description ?? null,
      esquema: origen.esquema,
      ajustes: origen.ajustes,
      estado: 'borrador',
      token_publico_hash: null,
      codigo_publico: null,
      publicado_at: null,
      created_by: usuarioId,
    };
  } else {
    fila = { id: nuevoId, ...comun };
  }

  const { error: insertError } = await supabase
    .from(tabla)
    .insert(fila as never);
  if (insertError) return mapearError(c, insertError, 'No se pudo clonar');

  const fallo = async (
    error: { message?: string; code?: string },
    mensaje: string
  ): Promise<Response> => {
    await supabase.from(tabla).delete().eq('id', nuevoId);
    return mapearError(c, error, mensaje);
  };

  if (tipo.data === 'document') {
    const { data: paginas, error: paginasError } = await supabase
      .from('document_pages')
      .select('title, content, is_main, position')
      .eq('document_id', id)
      .order('position', { ascending: true });
    if (paginasError) return fallo(paginasError, 'No se pudieron copiar las páginas');
    if (paginas?.length) {
      const { error } = await supabase
        .from('document_pages')
        .insert(paginas.map((p) => ({ ...p, document_id: nuevoId })) as never);
      if (error) return fallo(error, 'No se pudieron copiar las páginas');
    }
  }

  if (tipo.data === 'todo') {
    const { data: items, error: itemsError } = await supabase
      .from('todo_items')
      .select('name, frequency, interval_days, target_quantity, active, week_days, due_time, position')
      .eq('todo_id', id)
      .order('position', { ascending: true });
    if (itemsError) return fallo(itemsError, 'No se pudieron copiar los items');
    if (items?.length) {
      const { error } = await supabase
        .from('todo_items')
        .insert(items.map((i) => ({ ...i, todo_id: nuevoId, created_by: usuarioId })) as never);
      if (error) return fallo(error, 'No se pudieron copiar los items');
    }
  }

  if (tipo.data === 'list') {
    const { data: tareas, error: tareasError } = await supabase
      .from('tasks')
      .select('*')
      .eq('list_id', id);
    if (tareasError) return fallo(tareasError, 'No se pudieron copiar las tareas');
    if (tareas?.length) {
      const porId = new Map(tareas.map((t) => [t.id as string, t]));
      const nuevosIds = new Map<string, string>();
      for (const t of tareas) nuevosIds.set(t.id as string, randomUUID());

      const profundidad = (t: Record<string, unknown>): number => {
        let d = 0;
        let actual = t.parent_task_id as string | null;
        const vistos = new Set<string>([t.id as string]);
        while (actual && porId.has(actual) && !vistos.has(actual)) {
          vistos.add(actual);
          d += 1;
          actual = (porId.get(actual)?.parent_task_id as string | null) ?? null;
        }
        return d;
      };
      const ordenadas = [...tareas].sort((a, b) => profundidad(a) - profundidad(b));
      const filas = ordenadas.map((t) => ({
        id: nuevosIds.get(t.id as string),
        organization_id: t.organization_id,
        list_id: nuevoId,
        parent_task_id:
          t.parent_task_id && nuevosIds.has(t.parent_task_id as string)
            ? nuevosIds.get(t.parent_task_id as string)
            : null,
        title: t.title,
        description: t.description ?? null,
        status: t.status,
        priority: t.priority,
        assigned_to: t.assigned_to ?? null,
        created_by: usuarioId,
        shift_id: t.shift_id ?? null,
        due_date: t.due_date ?? null,
        due_time: t.due_time ?? null,
        start_date: t.start_date ?? null,
        estimated_hours: t.estimated_hours ?? null,
        position: t.position,
        status_position: t.status_position ?? 0,
        completed_at: t.completed_at ?? null,
      }));
      const { error } = await supabase.from('tasks').insert(filas as never);
      if (error) return fallo(error, 'No se pudieron copiar las tareas');

      if (tareas.length > 0) {
        const { data: notas } = await supabase
          .from('task_notes')
          .select('task_id, author_id, content, created_at')
          .in('task_id', tareas.map((t) => t.id as string));
        if (notas?.length) {
          await supabase.from('task_notes').insert(
            notas.map((n) => ({
              task_id: nuevosIds.get(n.task_id as string),
              author_id: n.author_id,
              content: n.content,
              created_at: n.created_at,
            })) as never
          );
        }
      }
    }
  }

  // Grants del origen al clon (excluye al creador: el trigger ya le da
  // manage y el upsert lo rebajaría al permiso copiado).
  const { data: grants } = await supabase
    .from('entity_visibility')
    .select('profile_id, permission, inherit')
    .eq('entity_type', tipo.data)
    .eq('entity_id', id);
  const copiables = (grants ?? []).filter((g) => g.profile_id !== usuarioId);
  if (copiables.length > 0) {
    await supabase.from('entity_visibility').upsert(
      copiables.map((g) => ({
        entity_type: tipo.data,
        entity_id: nuevoId,
        profile_id: g.profile_id,
        permission: g.permission,
        inherit: g.inherit,
      })),
      { onConflict: 'entity_type,entity_id,profile_id' }
    );
  }

  return c.json({ id: nuevoId });
});

// POST /entidades/reordenar — batch de posiciones.
// Updates en paralelo (sin upsert: un INSERT parcial violaría NOT NULL).
rutasEntidades.post('/reordenar', async (c) => {
  const supabase = c.get('supabase');
  const body = z.object({
    type: TIPO_ENTIDAD,
    items: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) })),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const tabla = tablaDeTipo(body.data.type);
  const resultados = await Promise.all(
    body.data.items.map((item) =>
      ejecutarEscritura(
        supabase.from(tabla).update({ position: item.position }).eq('id', item.id).select('id')
      )
    )
  );
  const fallo = resultados.find((r) => r.error)?.error;
  if (fallo) return mapearError(c, fallo);
  if (resultados.some((r) => r.filas === 0)) return sinPermisoEscritura(c);
  return c.json({ success: true });
});

// DELETE /entidades/:type/:id
rutasEntidades.delete('/:type/:id', async (c) => {
  const supabase = c.get('supabase');
  const tipo = TIPO_ENTIDAD.safeParse(c.req.param('type'));
  const id = c.req.param('id');
  if (!tipo.success || !id) return c.json({ error: 'Entidad inválida' }, 400);
  const { error, filas } = await ejecutarEscritura(
    supabase.from(tablaDeTipo(tipo.data)).delete().eq('id', id).select('id')
  );
  if (error) return mapearError(c, error, 'No se pudo eliminar');
  if (filas === 0) return sinPermisoEscritura(c);
  return c.json({ success: true });
});

// POST /entidades/:type/:id/grants — reemplaza/upsert grants de visibilidad.
rutasEntidades.post('/:type/:id/grants', async (c) => {
  const supabase = c.get('supabase');
  const tipo = TIPO_ENTIDAD.safeParse(c.req.param('type'));
  const id = c.req.param('id');
  if (!tipo.success || !id) return c.json({ error: 'Entidad inválida' }, 400);
  const body = esquemaGrants.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  if (body.data.replace) {
    const { error: delErr } = await supabase
      .from('entity_visibility')
      .delete()
      .eq('entity_type', tipo.data)
      .eq('entity_id', id);
    if (delErr) return mapearError(c, delErr);
  } else if (body.data.removed_ids?.length) {
    const { error: delErr } = await supabase
      .from('entity_visibility')
      .delete()
      .eq('entity_type', tipo.data)
      .eq('entity_id', id)
      .in('profile_id', body.data.removed_ids);
    if (delErr) return mapearError(c, delErr);
  }

  if (body.data.grants.length > 0) {
    const { error } = await supabase.from('entity_visibility').upsert(
      body.data.grants.map((g) => ({
        entity_type: tipo.data,
        entity_id: id,
        profile_id: g.profile_id,
        permission: g.permission,
        inherit: g.inherit,
      })),
      { onConflict: 'entity_type,entity_id,profile_id' }
    );
    if (error) return mapearError(c, error);
  }

  return c.json({ success: true });
});

