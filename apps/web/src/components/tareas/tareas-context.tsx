'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { usePathname, useRouter } from 'next/navigation';
import { sesionActual } from '@/lib/auth/sesion';
import { api, apiFetch, ErrorApi } from '@/lib/api/cliente';
import { computeEffectiveLevel } from '@/lib/access';
import { parseSnapshot, EMPTY_SNAPSHOT } from '@/lib/mindmap';
import { getTemplate } from '@/lib/mindmap-templates';
import { entitySlug, findEntityByParam } from '@/lib/slugs';
import { cacheGet, cacheSet } from '@/lib/cache';
import { claveEstructura, TTL_CACHE } from '@/lib/cache-claves';
import { queryClient } from '@/lib/query-client';
import type { Workspace, WorkspaceFolder, TaskList as TaskListEntry, TaskDocument, MindMap, Profile, EntityType, EntityGrant, EntityPermission, Todo, Formulario } from '@/types';
import type { CreateInput, UpdateInput, EditState } from '@/components/tareas/workspace-nav';

export type EditEntity =
  | Workspace
  | WorkspaceFolder
  | TaskListEntry
  | TaskDocument
  | MindMap
  | Todo
  | Formulario;

export type ShareTarget = {
  type: EntityType;
  id: string;
  name: string;
};

export type ShareGrant = {
  profileId: string;
  permission: EntityPermission;
  inherit: boolean;
};

/** Entidades sin contenido interno: los grants nunca heredan. */
const ISOLATED_TYPES: ReadonlySet<EntityType> = new Set(['document', 'mindmap', 'todo', 'formulario']);

function normalizeGrants<T extends { permission: EntityPermission; inherit: boolean }>(
  type: EntityType,
  grants: T[]
): T[] {
  return grants.map((g) => ({
    ...g,
    inherit: ISOLATED_TYPES.has(type) ? false : g.inherit,
  }));
}

type TareasCtxValue = {
  loading: boolean;
  structureError: string | null;
  workspaces: Workspace[];
  folders: WorkspaceFolder[];
  lists: TaskListEntry[];
  documents: TaskDocument[];
  mindmaps: MindMap[];
  todos: Todo[];
  formularios: Formulario[];
  counts: Record<string, number>;
  members: Record<string, string[]>;
  grants: EntityGrant[];
  collaborators: Profile[];
  currentUserId: string | null;
  organizationId: string | null;
  isAdmin: boolean;
  selectedListId: string | null;
  listPath: string;
  getLevel: (type: EntityType, id: string) => EntityPermission | null;
  canWrite: (type: EntityType, id: string) => boolean;
  canWriteEntity: (type: EntityType, id: string) => boolean;
  canManageEntity: (type: EntityType, id: string) => boolean;
  onSelectList: (id: string) => void;
  onOpenDashboard: (scope: { type: 'workspace' | 'folder'; wsId: string; folderId?: string }) => void;
  onOpenDocument: (docId: string) => void;
  onOpenMindMap: (mapId: string) => void;
  onOpenTodo: (todoId: string) => void;
  onOpenFormulario: (formularioId: string) => void;
  editTarget: EditState | null;
  openEdit: (type: EntityType, entity: EditEntity) => void;
  closeEdit: () => void;
  shareTarget: ShareTarget | null;
  openShare: (type: EntityType, entity: EditEntity) => void;
  closeShare: () => void;
  saveShareGrants: (input: {
    type: EntityType;
    id: string;
    grants: ShareGrant[];
    removedIds: string[];
  }) => Promise<{ error?: string } | undefined>;
  onCreate: (input: CreateInput) => Promise<{ error?: string } | undefined>;
  onUpdate: (input: UpdateInput) => Promise<{ error?: string } | undefined>;
  onDelete: (input: { type: EntityType; id: string }) => void;
  onMoveEntity: (input: { type: EntityType; id: string; workspaceId: string; parentFolderId: string | null }) => Promise<{ error?: string } | undefined>;
  onClone: (input: { type: 'list' | 'document' | 'mindmap' | 'todo' | 'formulario'; id: string; name: string }) => Promise<{ error?: string } | undefined>;
  onReorderTo: (input: { type: 'workspace' | 'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario'; id: string; targetId: string }) => void;
  refetch: () => void;
};

const TareasContext = createContext<TareasCtxValue | null>(null);

/**
 * Reconstruye la URL actual de /tareas con los slugs correctos tras un
 * renombrado (la estructura "next" ya trae el nombre nuevo). Solo
 * reemplaza la ruta si cambió (router.replace no dispara re-render de
 * datos innecesario).
 */
function refreshTareasPath(
  next: {
    nextWorkspaces: Workspace[];
    nextFolders: WorkspaceFolder[];
    nextLists: TaskListEntry[];
    nextDocuments: TaskDocument[];
    nextMindmaps: MindMap[];
    nextTodos: Todo[];
    nextFormularios: Formulario[];
  },
  pathname: string,
  router: ReturnType<typeof useRouter>
) {
  const segs = pathname.split('/').filter(Boolean);
  if (segs[0] !== 'proyectos' || segs.length < 2) return;
  const ws = findEntityByParam(segs[1], next.nextWorkspaces);
  if (!ws) return;
  const wsSlg = entitySlug(ws, next.nextWorkspaces);
  let newPath = `/proyectos/${wsSlg}`;

  if (segs[2]) {
    // '/dashboard' legacy → la ruta terminal del workspace ya es el dashboard.
    if (segs[2] === 'dashboard') {
      if (newPath !== pathname) router.replace(newPath);
      return;
    }
    if (segs[2] === 'raiz') {
      newPath += '/raiz';
    } else {
      const folder = findEntityByParam(segs[2], next.nextFolders);
      newPath += `/${folder ? entitySlug(folder, next.nextFolders) : segs[2]}`;
    }
  }
  if (segs[3]) {
    if (segs[3] === 'dashboard') {
      // '/dashboard' legacy → la ruta terminal de la carpeta ya es el dashboard.
      if (newPath !== pathname) router.replace(newPath);
      return;
    } else if (segs[3] === 'documento' || segs[3] === 'mapa' || segs[3] === 'todo' || segs[3] === 'formulario') {
      const pool =
        segs[3] === 'documento'
          ? next.nextDocuments
          : segs[3] === 'mapa'
            ? next.nextMindmaps
            : segs[3] === 'todo'
              ? next.nextTodos
              : next.nextFormularios;
      const ent = findEntityByParam(segs[4], pool);
      newPath += `/${segs[3]}/${ent ? entitySlug(ent, pool) : segs[4]}`;
      if (segs[3] === 'formulario' && segs[5]) {
        newPath += `/${segs.slice(5).join('/')}`;
      }
    } else {
      const list = findEntityByParam(segs[3], next.nextLists);
      newPath += `/${list ? entitySlug(list, next.nextLists) : segs[3]}`;
      if (segs[4]) newPath += `/${segs.slice(4).join('/')}`;
    }
  }
  if (newPath !== pathname) router.replace(newPath);
}

export function TareasProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [lists, setLists] = useState<TaskListEntry[]>([]);
  const [documents, setDocuments] = useState<TaskDocument[]>([]);
  const [mindmaps, setMindmaps] = useState<MindMap[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<Record<string, string[]>>({});
  const [grants, setGrants] = useState<EntityGrant[]>([]);
  const [collaborators, setCollaborators] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editTarget, setEditTarget] = useState<EditState | null>(null);

  const openEdit = useCallback(
    (type: EntityType, entity: EditEntity) => {
      const key = `${type}:${entity.id}`;
      const memberGrants: EditState['memberGrants'] = {};
      (members[key] || []).forEach((profileId) => {
        const g = grants.find(
          (x) =>
            x.entity_type === type &&
            x.entity_id === entity.id &&
            x.profile_id === profileId
        );
        memberGrants[profileId] = {
          permission: g?.permission ?? 'read',
          inherit: g?.inherit ?? (ISOLATED_TYPES.has(type) ? false : true),
        };
      });
      setEditTarget({
        type,
        id: entity.id,
        name: entity.name,
        visibility: entity.visibility || 'public',
        memberIds: [...(members[key] || [])],
        memberGrants,
      });
    },
    [members, grants]
  );

  const closeEdit = useCallback(() => setEditTarget(null), []);

  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  // Cache de estructura (hydrate + revalidate en background).
  const structureInFlightRef = useRef<Promise<void> | null>(null);

  // Última estructura aplicada: permite verificar (después de un write)
  // si la entidad creada ya es visible antes de navegar a su vista.
  const structureRef = useRef<StructurePayload | null>(null);

  type StructurePayload = {
    userId: string;
    organizationId: string;
    role: string;
    workspaces: Workspace[];
    folders: WorkspaceFolder[];
    lists: TaskListEntry[];
    documents: TaskDocument[];
    mindmaps: MindMap[];
    todos: Todo[];
    formularios: Formulario[];
    counts: Record<string, number>;
    members: Record<string, string[]>;
    grants: EntityGrant[];
    collaborators: Profile[];
  };

  type ArbolPayload = {
    profile: { organization_id: string; role: string };
    workspaces: Workspace[];
    folders: WorkspaceFolder[];
    lists: TaskListEntry[];
    documents: TaskDocument[];
    mindmaps: MindMap[];
    todos: Todo[];
    formularios: Formulario[];
    tasks: { list_id: string | null }[];
    todo_items: { todo_id: string | null }[];
    formulario_respuestas: { formulario_id: string | null }[];
    collaborators: Profile[];
    grants: EntityGrant[];
  };

  const structureCacheKey = (userId: string) => claveEstructura(userId);

  const applyStructure = useCallback((payload: StructurePayload) => {
    structureRef.current = payload;
    setCurrentUserId(payload.userId);
    setOrganizationId(payload.organizationId);
    setIsAdmin(payload.role === 'admin');
    setWorkspaces(payload.workspaces);
    setFolders(payload.folders);
    setLists(payload.lists);
    setDocuments(payload.documents);
    setMindmaps(payload.mindmaps);
    setTodos(payload.todos);
    setFormularios(payload.formularios ?? []);
    setCounts(payload.counts);
    setMembers(payload.members);
    setGrants(payload.grants);
    setCollaborators(payload.collaborators);
    setLoading(false);
  }, []);

  const fetchStructure = useCallback(async (opts?: { forzar?: boolean }) => {
    const sesion = await sesionActual();
    if (!sesion) return;
    const userId = sesion.userId;
    const cacheKey = structureCacheKey(userId);

    // Hydrate inmediato desde cache (paint sin esperar red); el refetch
    // de abajo revalida en background. El cache solo contiene datos que
    // este usuario ya vio (filtrados por RLS en el fetch original).
    // TTL corto: si la copia es vieja se ignora y manda el fetch.
    const cached = await cacheGet<StructurePayload>(cacheKey, TTL_CACHE.estructura);
    if (cached) {
      applyStructure(cached.value);
      setStructureError(null);
    }

    // Dedupe: refetches concurrentes (mount + realtime) comparten promise.
    // con forzar=true (tras un write) se ignora el dedupe para no
    // reutilizar un fetch iniciado antes del INSERT.
    if (!opts?.forzar && structureInFlightRef.current) return structureInFlightRef.current;

    const run = (async () => {
      try {
        const arbol = await apiFetch<ArbolPayload>('/entidades/arbol');

        const countsMap: Record<string, number> = {};
        for (const t of arbol.tasks) {
          if (t.list_id) countsMap[t.list_id] = (countsMap[t.list_id] || 0) + 1;
        }
        for (const i of arbol.todo_items) {
          if (i.todo_id) countsMap[i.todo_id] = (countsMap[i.todo_id] || 0) + 1;
        }
        for (const r of arbol.formulario_respuestas ?? []) {
          if (r.formulario_id) countsMap[r.formulario_id] = (countsMap[r.formulario_id] || 0) + 1;
        }

        const membersMap: Record<string, string[]> = {};
        const loadedGrants = arbol.grants;
        loadedGrants.forEach((m) => {
          const key = `${m.entity_type}:${m.entity_id}`;
          if (!membersMap[key]) membersMap[key] = [];
          membersMap[key].push(m.profile_id);
        });

        const payload: StructurePayload = {
          userId,
          organizationId: arbol.profile.organization_id,
          role: arbol.profile.role,
          workspaces: arbol.workspaces,
          folders: arbol.folders,
          lists: arbol.lists,
          documents: arbol.documents,
          mindmaps: arbol.mindmaps.map((m) => ({ ...m, content: parseSnapshot(m.content) })) as MindMap[],
          todos: arbol.todos,
          formularios: arbol.formularios ?? [],
          counts: countsMap,
          members: membersMap,
          grants: loadedGrants,
          collaborators: arbol.collaborators,
        };

        applyStructure(payload);
        setStructureError(null);
        void cacheSet(cacheKey, payload);
      } catch (e) {
        setStructureError(e instanceof Error ? e.message : 'Error cargando la estructura');
        if (!cached) setLoading(false);
      }
    })();

    structureInFlightRef.current = run;
    try {
      await run;
    } finally {
      structureInFlightRef.current = null;
    }
  }, [applyStructure]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchStructure(); }, [fetchStructure]);

  // Realtime: cambios en estructura/grants/tareas refrescan el árbol
  // automáticamente (sin F5). RLS aplica: solo llegan eventos de
  // filas visibles para el usuario. Los eventos de tareas solo
  // actualizan los contadores del árbol (la estructura no cambia),
  // con una query ligera en vez del refetch completo de 12 queries.
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipStructureUntilRef = useRef(0);

  const refreshCounts = useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await apiFetch<{
        tasks: { list_id: string | null }[];
        todo_items: { todo_id: string | null }[];
        formulario_respuestas: { formulario_id: string | null }[];
      }>(
        `/entidades/conteos?organization_id=${encodeURIComponent(organizationId)}`
      );
      const countsMap: Record<string, number> = {};
      for (const t of res.tasks) {
        if (t.list_id) countsMap[t.list_id] = (countsMap[t.list_id] || 0) + 1;
      }
      for (const i of res.todo_items) {
        if (i.todo_id) countsMap[i.todo_id] = (countsMap[i.todo_id] || 0) + 1;
      }
      for (const r of res.formulario_respuestas ?? []) {
        if (r.formulario_id) countsMap[r.formulario_id] = (countsMap[r.formulario_id] || 0) + 1;
      }
      setCounts(countsMap);
    } catch {
      // refetch fallará con el siguiente evento realtime
    }
  }, [organizationId]);

  // Refetch con supresión del realtime redundante del propio write:
  // el refetch explícito ya refleja el estado tras el write, así que
  // los eventos realtime que lleguen en la ventana siguiente se
  // descartan (autocurativo: cualquier cambio posterior refresca).
  const refetchStructure = useCallback(async (forzar = false) => {
    skipStructureUntilRef.current = Date.now() + 800;
    await fetchStructure({ forzar });
  }, [fetchStructure]);

  useEffect(() => {
    if (!organizationId) return;
    const debouncedRefetch = () => {
      if (Date.now() < skipStructureUntilRef.current) return;
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(() => {
        void fetchStructure();
        // El dashboard de workspace/carpeta depende de la estructura.
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }, 300);
    };
    const debouncedCounts = () => {
      if (countsTimerRef.current) clearTimeout(countsTimerRef.current);
      countsTimerRef.current = setTimeout(() => {
        void refreshCounts();
        // El dashboard combina tareas + turnos + horarios.
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }, 300);
    };
    const channel = canalRealtime(`tareas-${organizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entity_visibility' },
        debouncedRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspaces' },
        debouncedRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspace_folders' },
        debouncedRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_lists' },
        debouncedRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        debouncedRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mind_maps' },
        debouncedRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todos' },
        debouncedRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'formularios' },
        debouncedRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        debouncedCounts
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'formulario_respuestas' },
        debouncedCounts
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      if (countsTimerRef.current) clearTimeout(countsTimerRef.current);
      removerCanal(channel);
    };
  }, [organizationId, fetchStructure, refreshCounts]);

  // Redirección raíz: /tareas → primera lista
  useEffect(() => {
    if (pathname === '/proyectos' && lists.length > 0 && !loading) {
      const first = lists[0];
      const ws = workspaces.find((w) => w.id === first.workspace_id);
      if (ws) {
        const folder = first.folder_id
          ? folders.find((f) => f.id === first.folder_id)
          : undefined;
        router.replace(
          `/proyectos/${entitySlug(ws, workspaces)}/${folder ? entitySlug(folder, folders) : 'raiz'}/${entitySlug(first, lists)}`
        );
      }
    }
  }, [pathname, lists, workspaces, folders, loading, router]);

  // Redirección cuando la lista seleccionada fue eliminada
  useEffect(() => {
    const segs = pathname.split('/').filter(Boolean);
    const seg = segs[0] === 'proyectos' && segs.length >= 4 ? segs[3] : null;
    if (
      !loading &&
      seg &&
      seg !== 'dashboard' &&
      seg !== 'documento' &&
      seg !== 'mapa' &&
      seg !== 'todo' &&
      seg !== 'formulario' &&
      lists.length > 0 &&
      !findEntityByParam(seg, lists)
    ) {
      router.replace('/proyectos');
    }
  }, [pathname, lists, loading, router]);

  const segs = pathname.split('/').filter(Boolean);
  const candidate = segs[0] === 'proyectos' && segs.length >= 4 ? segs[3] : null;
  const selectedListId =
    (candidate && findEntityByParam(candidate, lists)?.id) ?? null;

  const listPath = selectedListId
    ? (() => {
        const list = lists.find((l) => l.id === selectedListId);
        const ws = list ? workspaces.find((w) => w.id === list.workspace_id) : undefined;
        const folder = list && list.folder_id ? folders.find((f) => f.id === list.folder_id) : undefined;
        return list && ws
          ? `/proyectos/${entitySlug(ws, workspaces)}/${folder ? entitySlug(folder, folders) : 'raiz'}/${entitySlug(list, lists)}`
          : '';
      })()
    : '';

  const TYPE_LABEL: Record<EntityType, string> = {
    workspace: 'área de trabajo',
    folder: 'carpeta',
    list: 'lista',
    document: 'documento',
    mindmap: 'mapa mental',
    todo: 'TO-DO',
    formulario: 'formulario',
  };

  const conflictMessage = (type: EntityType) =>
    `Ya existe un ${TYPE_LABEL[type]} con ese nombre aquí`;

  const onCreate = async (input: CreateInput) => {
    if (!organizationId) return;
    let createdId: string | null = null;
    let createdWorkspaceId: string | null = null;
    let createdPosition = 0;

    if (input.type === 'workspace') {
      if (workspaces.some((w) => w.name === input.name)) {
        return { error: conflictMessage('workspace') };
      }
      try {
        const res = await api.post<{ id: string }>('/entidades', {
          type: 'workspace',
          organization_id: organizationId,
          name: input.name,
          position: workspaces.length,
          visibility: input.visibility,
        });
        createdId = res.id;
      } catch (e) {
        if (e instanceof ErrorApi && e.code === '23505') return { error: conflictMessage('workspace') };
        return { error: e instanceof Error ? e.message : 'Error al crear' };
      }
      createdPosition = workspaces.length;
    } else if (input.type === 'folder') {
      const parentId = input.parentFolderId ?? null;
      if (
        folders.some(
          (f) =>
            f.workspace_id === input.workspaceId &&
            (f.parent_folder_id ?? null) === parentId &&
            f.name === input.name
        )
      ) {
        return { error: conflictMessage('folder') };
      }
      const position = folders.filter(
        (f) => f.workspace_id === input.workspaceId && (f.parent_folder_id ?? null) === parentId
      ).length;
      try {
        const res = await api.post<{ id: string }>('/entidades', {
          type: 'folder',
          workspace_id: input.workspaceId,
          parent_folder_id: parentId,
          name: input.name,
          position,
          visibility: input.visibility,
        });
        createdId = res.id;
      } catch (e) {
        if (e instanceof ErrorApi && e.code === '23505') return { error: conflictMessage('folder') };
        return { error: e instanceof Error ? e.message : 'Error al crear' };
      }
      createdWorkspaceId = input.workspaceId ?? null;
      createdPosition = position;
    } else if (input.type === 'list') {
      const folder = input.folderId ? folders.find((f) => f.id === input.folderId) : undefined;
      const workspaceId = folder?.workspace_id || input.workspaceId || '';
      if (
        lists.some(
          (l) =>
            l.workspace_id === workspaceId &&
            (l.folder_id ?? null) === (input.folderId ?? null) &&
            l.name === input.name
        )
      ) {
        return { error: conflictMessage('list') };
      }
      const position = lists.filter((l) => l.workspace_id === workspaceId && (l.folder_id ?? null) === (input.folderId ?? null)).length;
      try {
        const res = await api.post<{ id: string }>('/entidades', {
          type: 'list',
          workspace_id: workspaceId,
          folder_id: input.folderId ?? null,
          organization_id: organizationId,
          name: input.name,
          position,
          visibility: input.visibility,
        });
        createdId = res.id;
      } catch (e) {
        if (e instanceof ErrorApi && e.code === '23505') return { error: conflictMessage('list') };
        return { error: e instanceof Error ? e.message : 'Error al crear' };
      }
      createdWorkspaceId = workspaceId || null;
      createdPosition = position;
    } else if (input.type === 'document') {
      const folder = input.folderId ? folders.find((f) => f.id === input.folderId) : undefined;
      const workspaceId = folder?.workspace_id || input.workspaceId || '';
      if (
        documents.some(
          (d) =>
            d.workspace_id === workspaceId &&
            (d.folder_id ?? null) === (input.folderId ?? null) &&
            d.name === input.name
        )
      ) {
        return { error: conflictMessage('document') };
      }
      const position = documents.filter((d) => d.workspace_id === workspaceId && (d.folder_id ?? null) === (input.folderId ?? null)).length;
      try {
        const res = await api.post<{ id: string }>('/entidades', {
          type: 'document',
          workspace_id: workspaceId,
          folder_id: input.folderId ?? null,
          organization_id: organizationId,
          name: input.name,
          position,
          visibility: input.visibility,
        });
        createdId = res.id;
      } catch (e) {
        if (e instanceof ErrorApi && e.code === '23505') return { error: conflictMessage('document') };
        return { error: e instanceof Error ? e.message : 'Error al crear' };
      }
      createdWorkspaceId = workspaceId || null;
      createdPosition = position;
    } else if (input.type === 'mindmap') {
      const folder = input.folderId ? folders.find((f) => f.id === input.folderId) : undefined;
      const workspaceId = folder?.workspace_id || input.workspaceId || '';
      if (
        mindmaps.some(
          (m) =>
            m.workspace_id === workspaceId &&
            (m.folder_id ?? null) === (input.folderId ?? null) &&
            m.name === input.name
        )
      ) {
        return { error: conflictMessage('mindmap') };
      }
      const content = 'templateId' in input && input.templateId
        ? getTemplate(input.templateId).build()
        : EMPTY_SNAPSHOT;
      const position = mindmaps.filter((m) => m.workspace_id === workspaceId && (m.folder_id ?? null) === (input.folderId ?? null)).length;
      try {
        const res = await api.post<{ id: string }>('/entidades', {
          type: 'mindmap',
          workspace_id: workspaceId,
          folder_id: input.folderId ?? null,
          organization_id: organizationId,
          name: input.name,
          content,
          position,
          visibility: input.visibility,
        });
        createdId = res.id;
      } catch (e) {
        if (e instanceof ErrorApi && e.code === '23505') return { error: conflictMessage('mindmap') };
        return { error: e instanceof Error ? e.message : 'Error al crear' };
      }
      createdWorkspaceId = workspaceId || null;
      createdPosition = position;
    } else if (input.type === 'todo') {
      const folder = input.folderId ? folders.find((f) => f.id === input.folderId) : undefined;
      const workspaceId = folder?.workspace_id || input.workspaceId || '';
      if (
        todos.some(
          (t) =>
            t.workspace_id === workspaceId &&
            (t.folder_id ?? null) === (input.folderId ?? null) &&
            t.name === input.name
        )
      ) {
        return { error: conflictMessage('todo') };
      }
      const position = todos.filter((t) => t.workspace_id === workspaceId && (t.folder_id ?? null) === (input.folderId ?? null)).length;
      try {
        const res = await api.post<{ id: string }>('/entidades', {
          type: 'todo',
          workspace_id: workspaceId,
          folder_id: input.folderId ?? null,
          organization_id: organizationId,
          name: input.name,
          position,
          visibility: input.visibility,
        });
        createdId = res.id;
      } catch (e) {
        if (e instanceof ErrorApi && e.code === '23505') return { error: conflictMessage('todo') };
        return { error: e instanceof Error ? e.message : 'Error al crear' };
      }
      createdWorkspaceId = workspaceId || null;
      createdPosition = position;
    } else if (input.type === 'formulario') {
      const folder = input.folderId ? folders.find((f) => f.id === input.folderId) : undefined;
      const workspaceId = folder?.workspace_id || input.workspaceId || '';
      if (
        formularios.some(
          (x) =>
            x.workspace_id === workspaceId &&
            (x.folder_id ?? null) === (input.folderId ?? null) &&
            x.name.trim().toLowerCase() === input.name.trim().toLowerCase()
        )
      ) {
        return { error: conflictMessage('formulario') };
      }
      const position = formularios.filter((x) => x.workspace_id === workspaceId && (x.folder_id ?? null) === (input.folderId ?? null)).length;
      try {
        const res = await api.post<{ id: string }>('/entidades', {
          type: 'formulario',
          workspace_id: workspaceId,
          folder_id: input.folderId ?? null,
          organization_id: organizationId,
          name: input.name,
          position,
          visibility: input.visibility,
        });
        createdId = res.id;
      } catch (e) {
        if (e instanceof ErrorApi && e.code === '23505') return { error: conflictMessage('formulario') };
        return { error: e instanceof Error ? e.message : 'Error al crear' };
      }
      createdWorkspaceId = workspaceId || null;
      createdPosition = position;
    }
    if (createdId && input.visibility === 'restricted' && input.memberGrants?.length) {
      await api.post(`/entidades/${input.type}/${createdId}/grants`, {
        grants: normalizeGrants(input.type, input.memberGrants).map((g) => ({
          profile_id: g.profileId,
          permission: g.permission,
          inherit: g.inherit,
        })),
      }).catch(() => undefined);
    }

    // Redirigir a la vista de lo recién creado (URL con slug). La
    // estructura se refresca ANTES de navegar para que la vista
    // destino resuelva la entidad por slug sin race conditions.
    await refetchStructure();
    if (createdId && createdWorkspaceId) {
      // El dedupe de fetchStructure pudo devolver un refetch iniciado
      // antes del INSERT (estructura sin la entidad nueva). Verificar
      // la presencia en la estructura aplicada; si falta, re-fetch
      // forzado (ignora el dedupe) antes de navegar.
      const s = structureRef.current;
      const creadaEnEstructura = !!s && (
        input.type === 'workspace'
          ? s.workspaces.some((w) => w.id === createdId)
          : input.type === 'folder'
            ? s.folders.some((f) => f.id === createdId)
            : input.type === 'list'
              ? s.lists.some((l) => l.id === createdId)
              : input.type === 'document'
                ? s.documents.some((d) => d.id === createdId)
                : input.type === 'mindmap'
                  ? s.mindmaps.some((m) => m.id === createdId)
                  : input.type === 'todo'
                    ? s.todos.some((t) => t.id === createdId)
                    : s.formularios.some((f) => f.id === createdId)
      );
      if (!creadaEnEstructura) {
        await refetchStructure(true);
      }
      const folderId = 'folderId' in input && input.folderId ? input.folderId : 'raiz';
      const ws = workspaces.find((w) => w.id === createdWorkspaceId);
      if (ws) {
        const wsSlg = entitySlug(ws, workspaces);
        const newItem = {
          id: createdId,
          name: input.name,
          position: createdPosition,
        };
        const folderSeg =
          input.type === 'folder'
            ? entitySlug(newItem, folders)
            : folderId === 'raiz'
              ? 'raiz'
              : (() => {
                  const f = folders.find((x) => x.id === folderId);
                  return f ? entitySlug(f, folders) : 'raiz';
                })();
        if (input.type === 'workspace') {
          router.push(`/proyectos/${entitySlug({ ...ws, ...newItem }, workspaces)}/dashboard`);
        } else if (input.type === 'folder') {
          router.push(`/proyectos/${wsSlg}/${entitySlug(newItem, folders)}/dashboard`);
        } else if (input.type === 'list') {
          router.push(`/proyectos/${wsSlg}/${folderSeg}/${entitySlug(newItem, lists)}`);
        } else if (input.type === 'document') {
          router.push(`/proyectos/${wsSlg}/${folderSeg}/documento/${entitySlug(newItem, documents)}`);
        } else if (input.type === 'mindmap') {
          router.push(`/proyectos/${wsSlg}/${folderSeg}/mapa/${entitySlug(newItem, mindmaps)}`);
        } else if (input.type === 'todo') {
          router.push(`/proyectos/${wsSlg}/${folderSeg}/todo/${entitySlug(newItem, todos)}`);
        } else if (input.type === 'formulario') {
          router.push(`/proyectos/${wsSlg}/${folderSeg}/formulario/${entitySlug(newItem, formularios)}`);
        }
      }
    }
  };

  const getLevel = useCallback(
    (type: EntityType, id: string): EntityPermission | null => {
      if (isAdmin) return 'manage';
      return computeEffectiveLevel(grants, { workspaces, folders, lists, documents, mindmaps, todos, formularios }, type, id);
    },
    [grants, isAdmin, workspaces, folders, lists, documents, mindmaps, todos, formularios]
  );

  const canWrite = useCallback(
    (type: EntityType, id: string) => {
      if (isAdmin) return true;
      const level = getLevel(type, id);
      return level === 'write' || level === 'manage';
    },
    [getLevel, isAdmin]
  );

  const canManageEntity = useCallback(
    (type: EntityType, id: string) => {
      if (isAdmin) return true;
      return getLevel(type, id) === 'manage';
    },
    [getLevel, isAdmin]
  );

  const onUpdate = async (input: UpdateInput) => {
    // Unicidad de nombre entre hermanos (regla del negocio)
    if (input.type === 'workspace') {
      if (workspaces.some((w) => w.id !== input.id && w.name === input.name)) {
        return { error: conflictMessage('workspace') };
      }
    } else if (input.type === 'folder') {
      const f = folders.find((x) => x.id === input.id);
      if (
        f &&
        folders.some(
          (x) =>
            x.id !== input.id &&
            x.workspace_id === f.workspace_id &&
            (x.parent_folder_id ?? null) === (f.parent_folder_id ?? null) &&
            x.name === input.name
        )
      ) {
        return { error: conflictMessage('folder') };
      }
    } else {
      const pool = input.type === 'list' ? lists : input.type === 'document' ? documents : input.type === 'mindmap' ? mindmaps : input.type === 'todo' ? todos : formularios;
      const item = pool.find((x) => x.id === input.id);
      if (
        item &&
        pool.some(
          (x) =>
            x.id !== input.id &&
            x.workspace_id === item.workspace_id &&
            (x.folder_id ?? null) === (item.folder_id ?? null) &&
            x.name === input.name
        )
      ) {
        return { error: conflictMessage(input.type) };
      }
    }

    try {
      await api.patch(`/entidades/${input.type}/${input.id}`, { name: input.name, visibility: input.visibility });
    } catch (e) {
      if (e instanceof ErrorApi && e.code === '23505') return { error: conflictMessage(input.type) };
      return { error: e instanceof Error ? e.message : 'No se pudo actualizar' };
    }
    const rawMemberGrants =
      input.memberGrants ??
      input.memberIds.map((profileId) => ({ profileId, permission: 'read' as const, inherit: true }));
    const memberGrants = normalizeGrants(input.type, rawMemberGrants);
    if (input.visibility === 'restricted' && memberGrants.length > 0) {
      await api.post(`/entidades/${input.type}/${input.id}/grants`, {
        replace: true,
        grants: memberGrants.map(({ profileId, permission, inherit }) => ({
          profile_id: profileId,
          permission,
          inherit,
        })),
      }).catch(() => undefined);
    }

    // Si se renombró la entidad visible, refrescar la URL (slug nuevo).
    // La estructura se refresca antes para que la vista destino ya tenga
    // el nombre nuevo al resolver el slug.
    await refetchStructure();
    const nextWorkspaces = workspaces.map((w) =>
      input.type === 'workspace' && w.id === input.id ? { ...w, name: input.name } : w
    );
    const nextFolders = folders.map((f) =>
      input.type === 'folder' && f.id === input.id ? { ...f, name: input.name } : f
    );
    const nextLists = lists.map((l) =>
      input.type === 'list' && l.id === input.id ? { ...l, name: input.name } : l
    );
    const nextDocuments = documents.map((d) =>
      input.type === 'document' && d.id === input.id ? { ...d, name: input.name } : d
    );
    const nextMindmaps = mindmaps.map((m) =>
      input.type === 'mindmap' && m.id === input.id ? { ...m, name: input.name } : m
    );
    const nextTodos = todos.map((t) =>
      input.type === 'todo' && t.id === input.id ? { ...t, name: input.name } : t
    );
    const nextFormularios = formularios.map((f) =>
      input.type === 'formulario' && f.id === input.id ? { ...f, name: input.name } : f
    );
    refreshTareasPath(
      { nextWorkspaces, nextFolders, nextLists, nextDocuments, nextMindmaps, nextTodos, nextFormularios },
      pathname,
      router
    );
  };

  const onSelectList = (id: string) => {
    const list = lists.find((l) => l.id === id);
    if (!list) return;
    const ws = workspaces.find((w) => w.id === list.workspace_id);
    const folder = list.folder_id ? folders.find((f) => f.id === list.folder_id) : undefined;
    if (ws) {
      router.push(
        `/proyectos/${entitySlug(ws, workspaces)}/${folder ? entitySlug(folder, folders) : 'raiz'}/${entitySlug(list, lists)}`
      );
    }
  };

  const onOpenDashboard = (scope: { type: 'workspace' | 'folder'; wsId: string; folderId?: string }) => {
    const ws = workspaces.find((w) => w.id === scope.wsId);
    if (!ws) return;
    const folder = scope.folderId ? folders.find((f) => f.id === scope.folderId) : undefined;
    // La ruta terminal (sin /dashboard) ya renderiza el dashboard del
    // workspace o carpeta (layout con Outlet).
    router.push(
      `/proyectos/${entitySlug(ws, workspaces)}${folder ? `/${entitySlug(folder, folders)}` : ''}`
    );
  };

  const onReorderTo = async (input: { type: 'workspace' | 'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario'; id: string; targetId: string }) => {
    let siblings: { id: string; position: number }[];
    if (input.type === 'workspace') {
      siblings = workspaces.map((w) => ({ id: w.id, position: w.position }));
    } else if (input.type === 'folder') {
      const f = folders.find((x) => x.id === input.id);
      if (!f) return;
      siblings = folders
        .filter((x) => x.workspace_id === f.workspace_id && (x.parent_folder_id ?? null) === (f.parent_folder_id ?? null))
        .map((x) => ({ id: x.id, position: x.position }));
    } else {
      const pool = input.type === 'list' ? lists : input.type === 'document' ? documents : input.type === 'mindmap' ? mindmaps : input.type === 'todo' ? todos : formularios;
      const item = pool.find((x) => x.id === input.id);
      if (!item) return;
      siblings = pool
        .filter((x) => x.workspace_id === item.workspace_id && (x.folder_id ?? null) === (item.folder_id ?? null))
        .map((x) => ({ id: x.id, position: x.position }));
    }

    siblings.sort((a, b) => a.position - b.position);
    const order = siblings.map((s) => s.id).filter((x) => x !== input.id);
    if (input.targetId) {
      if (!siblings.some((s) => s.id === input.targetId)) return;
      const targetIdx = order.indexOf(input.targetId);
      if (targetIdx === -1) return;
      order.splice(targetIdx, 0, input.id);
    } else {
      order.push(input.id);
    }

    const updates = order
      .map((id, i) => {
        const cur = siblings.find((s) => s.id === id);
        if (cur && cur.position !== i) return { id, position: i };
        return null;
      })
      .filter((x): x is { id: string; position: number } => x !== null);
    if (updates.length > 0) {
      await api.post('/entidades/reordenar', { type: input.type, items: updates }).catch(() => undefined);
    }
    await refetchStructure();
  };

  const onOpenDocument = (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    const ws = workspaces.find((w) => w.id === doc.workspace_id);
    const folder = doc.folder_id ? folders.find((f) => f.id === doc.folder_id) : undefined;
    if (ws) {
      router.push(
        `/proyectos/${entitySlug(ws, workspaces)}/${folder ? entitySlug(folder, folders) : 'raiz'}/documento/${entitySlug(doc, documents)}`
      );
    }
  };

  const onOpenMindMap = (mapId: string) => {
    const map = mindmaps.find((m) => m.id === mapId);
    if (!map) return;
    const ws = workspaces.find((w) => w.id === map.workspace_id);
    const folder = map.folder_id ? folders.find((f) => f.id === map.folder_id) : undefined;
    if (ws) {
      router.push(
        `/proyectos/${entitySlug(ws, workspaces)}/${folder ? entitySlug(folder, folders) : 'raiz'}/mapa/${entitySlug(map, mindmaps)}`
      );
    }
  };

  const onOpenTodo = (todoId: string) => {
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return;
    const ws = workspaces.find((w) => w.id === todo.workspace_id);
    const folder = todo.folder_id ? folders.find((f) => f.id === todo.folder_id) : undefined;
    if (ws) {
      router.push(
        `/proyectos/${entitySlug(ws, workspaces)}/${folder ? entitySlug(folder, folders) : 'raiz'}/todo/${entitySlug(todo, todos)}`
      );
    }
  };

  const onOpenFormulario = (formularioId: string) => {
    const formulario = formularios.find((f) => f.id === formularioId);
    if (!formulario) return;
    const ws = workspaces.find((w) => w.id === formulario.workspace_id);
    const folder = formulario.folder_id ? folders.find((f) => f.id === formulario.folder_id) : undefined;
    if (ws) {
      router.push(
        `/proyectos/${entitySlug(ws, workspaces)}/${folder ? entitySlug(folder, folders) : 'raiz'}/formulario/${entitySlug(formulario, formularios)}`
      );
    }
  };

  const onDelete = async (input: { type: EntityType; id: string }) => {
    await api.delete(`/entidades/${input.type}/${input.id}`).catch(() => undefined);
    await refetchStructure();
  };

  const onMoveEntity = async (input: { type: EntityType; id: string; workspaceId: string; parentFolderId: string | null }) => {
    const { type, id, workspaceId, parentFolderId } = input;
    const conflict = (msg: string) => ({ error: msg });

    if (type === 'folder') {
      const f = folders.find((x) => x.id === id);
      if (
        f &&
        folders.some(
          (x) =>
            x.id !== id &&
            x.workspace_id === workspaceId &&
            (x.parent_folder_id ?? null) === parentFolderId &&
            x.name === f.name
        )
      ) {
        return conflict(
          'Ya existe un elemento con ese nombre en el destino. Renómbralo para continuar'
        );
      }
      const position = folders.filter(
        (f2) => f2.workspace_id === workspaceId && (f2.parent_folder_id ?? null) === parentFolderId
      ).length;
      try {
        await api.post(`/entidades/${type}/${id}/mover`, {
          workspace_id: workspaceId,
          parent_folder_id: parentFolderId,
          position,
        });
      } catch (e) {
        if (e instanceof ErrorApi && e.code === '23505') {
          return conflict(
            'Ya existe un elemento con ese nombre en el destino. Renómbralo para continuar'
          );
        }
        return { error: e instanceof Error ? e.message : 'No se pudo mover' };
      }
    } else {
      const targetFolderId = parentFolderId;
      const pool = type === 'list' ? lists : type === 'document' ? documents : type === 'mindmap' ? mindmaps : type === 'todo' ? todos : formularios;
      const item = pool.find((x) => x.id === id);
      if (
        item &&
        pool.some(
          (x) =>
            x.id !== id &&
            x.workspace_id === workspaceId &&
            (x.folder_id ?? null) === targetFolderId &&
            x.name === item.name
        )
      ) {
        return conflict(
          'Ya existe un elemento con ese nombre en el destino. Renómbralo para continuar'
        );
      }
      const position = pool.filter(
        (x) => x.workspace_id === workspaceId && (x.folder_id ?? null) === targetFolderId
      ).length;
      try {
        await api.post(`/entidades/${type}/${id}/mover`, {
          workspace_id: workspaceId,
          folder_id: targetFolderId,
          position,
        });
      } catch (e) {
        if (e instanceof ErrorApi && e.code === '23505') {
          return conflict(
            'Ya existe un elemento con ese nombre en el destino. Renómbralo para continuar'
          );
        }
        return { error: e instanceof Error ? e.message : 'No se pudo mover' };
      }
    }
    await refetchStructure();
  };

  const onClone = async (input: {
    type: 'list' | 'document' | 'mindmap' | 'todo' | 'formulario';
    id: string;
    name: string;
  }) => {
    try {
      await api.post<{ id: string }>(`/entidades/${input.type}/${input.id}/clonar`, {
        name: input.name,
      });
    } catch (e) {
      if (e instanceof ErrorApi && e.code === '23505') {
        return { error: conflictMessage(input.type) };
      }
      return { error: e instanceof Error ? e.message : 'No se pudo clonar' };
    }
    await refetchStructure();
    return { success: true };
  };

  const openShare = useCallback((type: EntityType, entity: EditEntity) => {
    setShareTarget({ type, id: entity.id, name: entity.name });
  }, []);

  const closeShare = useCallback(() => setShareTarget(null), []);

  const saveShareGrants = useCallback(
    async (input: {
      type: EntityType;
      id: string;
      grants: ShareGrant[];
      removedIds: string[];
    }) => {
      const normalized = normalizeGrants(input.type, input.grants);
      try {
        await api.post(`/entidades/${input.type}/${input.id}/grants`, {
          grants: normalized.map((g) => ({
            profile_id: g.profileId,
            permission: g.permission,
            inherit: g.inherit,
          })),
          removed_ids: input.removedIds.length > 0 ? input.removedIds : undefined,
        });
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'No se pudieron guardar los accesos' };
      }
      await refetchStructure();
      return { success: true };
    },
    [refetchStructure]
  );

  const value: TareasCtxValue = {
    loading,
    structureError,
    workspaces,
    folders,
    lists,
    documents,
    mindmaps,
    todos,
    formularios,
    counts,
    members,
    grants,
    collaborators,
    currentUserId,
    organizationId,
    isAdmin,
    selectedListId,
    listPath,
    getLevel,
    canWrite,
    canWriteEntity: canWrite,
    canManageEntity,
    onSelectList,
    onOpenDashboard,
    onOpenDocument,
    onOpenMindMap,
    onOpenTodo,
    onOpenFormulario,
    editTarget,
    openEdit,
    closeEdit,
    shareTarget,
    openShare,
    closeShare,
    saveShareGrants,
    onCreate,
    onUpdate,
    onDelete,
    onMoveEntity,
    onClone,
    onReorderTo,
    refetch: fetchStructure,
  };

  return <TareasContext.Provider value={value}>{children}</TareasContext.Provider>;
}

export function useTareas(): TareasCtxValue {
  const ctx = useContext(TareasContext);
  if (!ctx) throw new Error('useTareas debe usarse dentro de TareasProvider');
  return ctx;
}

/**
 * Variante sin error para vistas fuera de /proyectos (p. ej. el calendario),
 * que montan el detalle de tarea con datos propios en lugar del contexto.
 */
export function useTareasOpcional(): TareasCtxValue | null {
  return useContext(TareasContext);
}

