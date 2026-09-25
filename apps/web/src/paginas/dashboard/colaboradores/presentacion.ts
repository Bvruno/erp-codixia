import type {
  Invitation,
  EntityPermission,
  EntityType,
  Workspace,
  WorkspaceFolder,
  TaskList,
  TaskDocument,
  MindMap,
  Todo,
  Formulario,
} from '@/types';

// Presentación del módulo de colaboradores: labels y helpers de formato.
// Las funciones que dependen del árbol lo reciben como parámetro (puras).

export type ArbolColaboradores = {
  workspaces: Workspace[];
  folders: WorkspaceFolder[];
  lists: TaskList[];
  documents: TaskDocument[];
  mindmaps: MindMap[];
  todos: Todo[];
  formularios: Formulario[];
};

/** Árbol vacío para el estado inicial antes del primer fetch. */
export const ArbolColaboradoresPlaceholder: ArbolColaboradores = {
  workspaces: [],
  folders: [],
  lists: [],
  documents: [],
  mindmaps: [],
  todos: [],
  formularios: [],
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  collaborator: 'Colaborador',
};

export const PERMISSION_LABELS: Record<EntityPermission, string> = {
  read: 'Solo lectura',
  write: 'Lectura y escritura',
  manage: 'Gestión completa',
};

export const SCOPE_LABELS: Record<EntityType, string> = {
  workspace: 'Área de trabajo',
  folder: 'Carpeta',
  list: 'Lista de tareas',
  document: 'Documento',
  mindmap: 'Mapa mental',
  todo: 'TO-DO',
  formulario: 'Formulario',
};

export function entityName(tree: ArbolColaboradores, type: EntityType, id: string): string {
  if (type === 'workspace') return tree.workspaces.find((w) => w.id === id)?.name || 'Área';
  if (type === 'folder') return tree.folders.find((f) => f.id === id)?.name || 'Carpeta';
  if (type === 'list') return tree.lists.find((l) => l.id === id)?.name || 'Lista';
  if (type === 'mindmap') return tree.mindmaps.find((m) => m.id === id)?.name || 'Mapa mental';
  if (type === 'todo') return tree.todos.find((t) => t.id === id)?.name || 'TO-DO';
  if (type === 'formulario') return tree.formularios.find((f) => f.id === id)?.name || 'Formulario';
  return tree.documents.find((d) => d.id === id)?.name || 'Documento';
}

export function grantPath(tree: ArbolColaboradores, type: EntityType, id: string): string {
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
  }
  const parts: string[] = [];
  let f = folderId ? tree.folders.find((x) => x.id === folderId) ?? null : null;
  while (f) {
    const cur = f;
    parts.unshift(cur.name);
    const parentId = cur.parent_folder_id;
    f = parentId ? tree.folders.find((x) => x.id === parentId) ?? null : null;
  }
  const base = wsId ? [tree.workspaces.find((w) => w.id === wsId)?.name || 'Área', ...parts].join(' > ') : parts.join(' > ');
  return type === 'workspace' ? entityName(tree, type, id) : `${base} > ${entityName(tree, type, id)}`.replace(/^ > /, '');
}

export function scopeOf(tree: ArbolColaboradores, inv: Invitation): string {
  if (!inv.entity_type || !inv.entity_id) return 'Toda la organización';
  const label = SCOPE_LABELS[inv.entity_type];
  const name = entityName(tree, inv.entity_type, inv.entity_id);
  return `${label} "${name}"`;
}

export function effectiveStatus(inv: Invitation): string {
  if (inv.status === 'pending' && new Date(inv.expires_at) < new Date()) return 'expired';
  return inv.status;
}

export function statusLabel(status: string): string {
  return status === 'pending'
    ? 'Pendiente'
    : status === 'accepted'
    ? 'Aceptada'
    : status === 'rejected'
    ? 'Rechazada'
    : status === 'expired'
    ? 'Expirada'
    : 'Cancelada';
}

export function statusBadgeClass(status: string): string {
  return status === 'pending'
    ? 'bg-info/20 text-info'
    : status === 'accepted'
    ? 'bg-success/20 text-success'
    : status === 'rejected'
    ? 'bg-destructive/10 text-destructive'
    : 'bg-muted text-muted-foreground';
}
