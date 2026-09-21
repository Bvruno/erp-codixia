import type {
  Workspace,
  WorkspaceFolder,
  TaskList,
  TaskDocument,
  MindMap,
  Todo,
  Formulario,
  Visibility,
  EntityPermission,
} from '@/types';

// Tipos compartidos del árbol de navegación (WorkspaceNav y subcomponentes).

export type EntityType = 'workspace' | 'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario';

export type MemberGrant = { profileId: string; permission: EntityPermission; inherit: boolean };

export type CreateInput =
  | { type: 'workspace'; workspaceId?: never; folderId?: never; name: string; visibility?: Visibility; memberGrants?: MemberGrant[] }
  | { type: 'folder'; workspaceId: string; parentFolderId?: string; name: string; visibility?: Visibility; memberGrants?: MemberGrant[] }
  | { type: 'list'; workspaceId?: string; folderId?: string; name: string; visibility?: Visibility; memberGrants?: MemberGrant[] }
  | { type: 'document'; workspaceId?: string; folderId?: string; name: string; visibility?: Visibility; memberGrants?: MemberGrant[] }
  | { type: 'mindmap'; workspaceId?: string; folderId?: string; templateId?: string; name: string; visibility?: Visibility; memberGrants?: MemberGrant[] }
  | { type: 'todo'; workspaceId?: string; folderId?: string; name: string; visibility?: Visibility; memberGrants?: MemberGrant[] }
  | { type: 'formulario'; workspaceId?: string; folderId?: string; name: string; visibility?: Visibility; memberGrants?: MemberGrant[] };

export type UpdateInput = {
  type: EntityType;
  id: string;
  name: string;
  visibility: Visibility;
  memberIds: string[];
  memberGrants?: MemberGrant[];
};

export type DialogState =
  | { type: 'workspace'; visibility?: Visibility; memberIds?: string[]; memberGrants?: Record<string, { permission: EntityPermission; inherit: boolean }> }
  | { type: 'folder'; workspaceId: string; parentFolderId?: string; visibility?: Visibility; memberIds?: string[]; memberGrants?: Record<string, { permission: EntityPermission; inherit: boolean }> }
  | { type: 'list'; folderId?: string; workspaceId?: string; visibility?: Visibility; memberIds?: string[]; memberGrants?: Record<string, { permission: EntityPermission; inherit: boolean }> }
  | { type: 'document'; folderId?: string; workspaceId?: string; visibility?: Visibility; memberIds?: string[]; memberGrants?: Record<string, { permission: EntityPermission; inherit: boolean }> }
  | { type: 'mindmap'; folderId?: string; workspaceId?: string; templateId?: string; visibility?: Visibility; memberIds?: string[]; memberGrants?: Record<string, { permission: EntityPermission; inherit: boolean }> }
  | { type: 'todo'; folderId?: string; workspaceId?: string; visibility?: Visibility; memberIds?: string[]; memberGrants?: Record<string, { permission: EntityPermission; inherit: boolean }> }
  | { type: 'formulario'; folderId?: string; workspaceId?: string; visibility?: Visibility; memberIds?: string[]; memberGrants?: Record<string, { permission: EntityPermission; inherit: boolean }> };

export type EditState = {
  type: EntityType;
  id: string;
  name: string;
  visibility: Visibility;
  memberIds: string[];
  memberGrants: Record<string, { permission: EntityPermission; inherit: boolean }>;
};

export type DeleteTarget = { type: EntityType; id: string; name: string; description: string; label: string };

export type MoveTarget = { type: 'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario'; id: string; name: string };

export type CloneTarget = { type: 'list' | 'document' | 'mindmap' | 'todo' | 'formulario'; id: string; name: string };

export type ReorderKind = { type: 'workspace' | 'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario'; id: string; containerKey: string };

export type ReorderTarget = { type: ReorderKind['type']; id: string; containerKey: string };

export type RowActionItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  destructive?: boolean;
};

export type SharedProps = {
  workspaces: Workspace[];
  folders: WorkspaceFolder[];
  lists: TaskList[];
  documents: TaskDocument[];
  mindmaps: MindMap[];
  todos: Todo[];
  formularios: Formulario[];
  counts: Record<string, number>;
  selectedListId: string | null;
  collapsedFolders: Set<string>;
  canManage: boolean;
  canManageEntity: (type: EntityType, id: string) => boolean;
  canWriteEntity: (type: EntityType, id: string) => boolean;
  onSelectList: (id: string) => void;
  onOpenDashboard: (scope: { type: 'workspace' | 'folder'; wsId: string; folderId?: string }) => void;
  onOpenDocument: (docId: string) => void;
  onOpenMindMap: (mapId: string) => void;
  onOpenTodo: (todoId: string) => void;
  onOpenFormulario: (formularioId: string) => void;
  onOpenCreate: (state: DialogState) => void;
  onOpenEdit: (type: EntityType, entity: Workspace | WorkspaceFolder | TaskList | TaskDocument | MindMap | Todo | Formulario) => void;
  onConfirmDelete: (type: EntityType, id: string, name: string) => void;
  onOpenMoveDialog: (type: 'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario', entity: WorkspaceFolder | TaskList | TaskDocument | MindMap | Todo | Formulario) => void;
  onOpenCloneDialog: (type: CloneTarget['type'], entity: TaskList | TaskDocument | MindMap | Todo | Formulario) => void;
  onToggleFolder: (id: string) => void;
  orderFor: (containerKey: string, items: { id: string; position: number }[]) => string[];
  reorderEntity: ReorderKind | null;
  reorderTarget: ReorderTarget | null;
  onGripPointerDown: (e: React.PointerEvent, kind: ReorderKind) => void;
  dropAttrs: (kind: ReorderKind) => Record<string, string>;
  activeWsId?: string;
  activeFolderId?: string;
  activeDocId?: string;
  activeMapId?: string;
  activeTodoId?: string;
  activeFormularioId?: string;
};
