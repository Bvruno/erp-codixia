import type {
  EntityGrant,
  EntityPermission,
  EntityType,
  Formulario,
  MindMap,
  Todo,
  TaskDocument,
  TaskList,
  Visibility,
  Workspace,
  WorkspaceFolder,
} from '@/types';

export const PERM_RANK: Record<EntityPermission, number> = {
  read: 1,
  write: 2,
  manage: 3,
};

export type AccessTree = {
  workspaces: Workspace[];
  folders: WorkspaceFolder[];
  lists: TaskList[];
  documents: TaskDocument[];
  mindmaps: MindMap[];
  todos: Todo[];
  formularios: Formulario[];
};

export type LevelSource = {
  type: EntityType;
  id: string;
  name: string;
  level: EntityPermission;
};

/** Visibilidad de una entidad del árbol (null si no está en el árbol). */
export function visibilityOf(
  tree: AccessTree,
  type: EntityType,
  id: string
): Visibility | null {
  switch (type) {
    case 'workspace':
      return tree.workspaces.find((w) => w.id === id)?.visibility ?? null;
    case 'folder':
      return tree.folders.find((f) => f.id === id)?.visibility ?? null;
    case 'list':
      return tree.lists.find((l) => l.id === id)?.visibility ?? null;
    case 'document':
      return tree.documents.find((d) => d.id === id)?.visibility ?? null;
    case 'mindmap':
      return tree.mindmaps.find((m) => m.id === id)?.visibility ?? null;
    case 'todo':
      return tree.todos.find((t) => t.id === id)?.visibility ?? null;
    case 'formulario':
      return tree.formularios.find((f) => f.id === id)?.visibility ?? null;
  }
}

function folderChainIds(tree: AccessTree, folderId: string | null): string[] {
  const ids: string[] = [];
  let f = folderId ? tree.folders.find((x) => x.id === folderId) ?? null : null;
  while (f) {
    const cur = f;
    ids.unshift(cur.id);
    const parentId = cur.parent_folder_id;
    f = parentId ? tree.folders.find((x) => x.id === parentId) ?? null : null;
  }
  return ids;
}

/**
 * Nivel efectivo de permiso de un miembro sobre una entidad.
 * Grant propio cuenta siempre; grants de ancestros (carpetas y
 * workspace) solo si tienen inherit=true y la entidad NO es privada
 * (restringido sí hereda), con nivel capado a write. Espeja la
 * semántica de `entity_effective` en la BD.
 */
export function effectiveLevelOf(
  grants: EntityGrant[],
  tree: AccessTree,
  type: EntityType,
  id: string
): { level: EntityPermission; source: LevelSource } | null {
  const found: { type: EntityType; id: string; level: EntityPermission }[] = [];

  const collect = (t: EntityType, i: string, requireInherit: boolean) => {
    const g = grants.find((x) => x.entity_type === t && x.entity_id === i);
    if (!g || (requireInherit && !g.inherit)) return;
    const level: EntityPermission = requireInherit
      ? PERM_RANK[g.permission] >= 2
        ? 'write'
        : g.permission
      : g.permission;
    found.push({ type: t, id: i, level });
  };

  collect(type, id, false);

  const targetPrivada = visibilityOf(tree, type, id) === 'private';

  if (
    !targetPrivada &&
    (type === 'folder' || type === 'list' || type === 'document' || type === 'mindmap' || type === 'todo' || type === 'formulario')
  ) {
    let folderId: string | null = null;
    let wsId: string | null = null;

    if (type === 'folder') {
      const f = tree.folders.find((x) => x.id === id);
      folderId = f?.parent_folder_id ?? null;
      wsId = f?.workspace_id ?? null;
    } else if (type === 'list') {
      const l = tree.lists.find((x) => x.id === id);
      folderId = l?.folder_id ?? null;
      wsId = l?.workspace_id ?? null;
    } else if (type === 'document') {
      const d = tree.documents.find((x) => x.id === id);
      folderId = d?.folder_id ?? null;
      wsId = d?.workspace_id ?? null;
    } else if (type === 'mindmap') {
      const m = tree.mindmaps.find((x) => x.id === id);
      folderId = m?.folder_id ?? null;
      wsId = m?.workspace_id ?? null;
    } else if (type === 'todo') {
      const t = tree.todos.find((x) => x.id === id);
      folderId = t?.folder_id ?? null;
      wsId = t?.workspace_id ?? null;
    } else {
      const f = tree.formularios.find((x) => x.id === id);
      folderId = f?.folder_id ?? null;
      wsId = f?.workspace_id ?? null;
    }

    folderChainIds(tree, folderId).forEach((fid) => collect('folder', fid, true));
    if (wsId) collect('workspace', wsId, true);
  }

  const bestSource = found.reduce<{ type: EntityType; id: string; level: EntityPermission } | null>(
    (acc, c) => (acc === null || PERM_RANK[c.level] > PERM_RANK[acc.level] ? c : acc),
    null
  );

  if (!bestSource) return null;
  const src = bestSource;

  const sourceName =
    src.type === 'workspace'
      ? tree.workspaces.find((w) => w.id === src.id)?.name
      : src.type === 'folder'
        ? tree.folders.find((f) => f.id === src.id)?.name
        : src.type === 'list'
          ? tree.lists.find((l) => l.id === src.id)?.name
          : src.type === 'mindmap'
            ? tree.mindmaps.find((m) => m.id === src.id)?.name
            : src.type === 'todo'
              ? tree.todos.find((t) => t.id === src.id)?.name
              : src.type === 'formulario'
                ? tree.formularios.find((f) => f.id === src.id)?.name
                : tree.documents.find((d) => d.id === src.id)?.name;

  return {
    level: src.level,
    source: { ...src, name: sourceName || 'Entidad' },
  };
}

export function computeEffectiveLevel(
  grants: EntityGrant[],
  tree: AccessTree,
  type: EntityType,
  id: string
): EntityPermission | null {
  return effectiveLevelOf(grants, tree, type, id)?.level ?? null;
}

export type EffectiveEntry = {
  type: EntityType;
  id: string;
  name: string;
  path: string;
  level: EntityPermission;
  explicit: boolean;
  source: LevelSource;
};

/** Todas las entidades con acceso efectivo para el miembro, con ruta legible. */
export function effectiveAccessEntries(grants: EntityGrant[], tree: AccessTree): EffectiveEntry[] {
  const entries: EffectiveEntry[] = [];
  const wsName = (id: string) => tree.workspaces.find((w) => w.id === id)?.name || 'Área';

  const pushFor = (type: EntityType, id: string, name: string, path: string) => {
    const res = effectiveLevelOf(grants, tree, type, id);
    if (!res) return;
    const explicit = res.source.type === type && res.source.id === id;
    entries.push({
      type,
      id,
      name,
      path,
      level: res.level,
      explicit,
      source: res.source,
    });
  };

  tree.workspaces.forEach((ws) => {
    pushFor('workspace', ws.id, ws.name, ws.name);
  });

  const folderPath = (folderId: string, wsId: string): string => {
    const chain = folderChainIds(tree, folderId);
    const parts = chain.map((fid) => tree.folders.find((f) => f.id === fid)?.name || '');
    return [wsName(wsId), ...parts].join(' > ');
  };

  tree.folders.forEach((f) => {
    pushFor('folder', f.id, f.name, folderPath(f.id, f.workspace_id));
  });

  tree.lists.forEach((l) => {
    const path = l.folder_id
      ? `${folderPath(l.folder_id, l.workspace_id)} > ${l.name}`
      : `${wsName(l.workspace_id)} > ${l.name}`;
    pushFor('list', l.id, l.name, path);
  });

  tree.documents.forEach((d) => {
    const path = d.folder_id
      ? `${folderPath(d.folder_id, d.workspace_id)} > ${d.name}`
      : `${wsName(d.workspace_id)} > ${d.name}`;
    pushFor('document', d.id, d.name, path);
  });

  tree.mindmaps.forEach((m) => {
    const path = m.folder_id
      ? `${folderPath(m.folder_id, m.workspace_id)} > ${m.name}`
      : `${wsName(m.workspace_id)} > ${m.name}`;
    pushFor('mindmap', m.id, m.name, path);
  });

  tree.todos.forEach((t) => {
    const path = t.folder_id
      ? `${folderPath(t.folder_id, t.workspace_id)} > ${t.name}`
      : `${wsName(t.workspace_id)} > ${t.name}`;
    pushFor('todo', t.id, t.name, path);
  });

  tree.formularios.forEach((f) => {
    const path = f.folder_id
      ? `${folderPath(f.folder_id, f.workspace_id)} > ${f.name}`
      : `${wsName(f.workspace_id)} > ${f.name}`;
    pushFor('formulario', f.id, f.name, path);
  });

  return entries;
}

