'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import {
  LayoutGrid,
  Folder,
  FolderOpen,
  Plus,
  ChevronDown,
  FolderPlus,
  Pencil,
  Trash2,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navBus } from '@/lib/nav-bus';
import { slugify } from '@/lib/slugs';
import { ENTIDADES_META } from '@/lib/entidades-meta';
import { usePathname } from 'next/navigation';
import type { Workspace, WorkspaceFolder, TaskList, TaskDocument, MindMap, Profile, EntityPermission, Todo, Formulario } from '@/types';
import type {
  EntityType,
  CreateInput,
  DialogState,
  DeleteTarget,
  MoveTarget,
  CloneTarget,
  ReorderKind,
  RowActionItem,
  SharedProps,
} from './tipos';
import {
  DRAG_PLACEHOLDER,
  DROP_TARGET,
  GripButton,
  ListRow,
  DocRow,
  MindMapRow,
  TodoRow,
  FormularioRow,
  RowActions,
} from './filas';
import { VisibilityIcon, NO_INHERIT_TYPES } from './visibilidad';
import { FolderNode } from './folder-node';
import { RailNav } from './rail';
import { DialogosNav } from './dialogos';
import { nombreClonUnico } from './clon';
import { useArrastreNav } from './use-arrastre';

export function WorkspaceNav({
  workspaces,
  folders,
  lists,
  documents,
  mindmaps,
  todos,
  formularios,
  counts,
  selectedListId,
  onSelectList,
  onOpenDashboard,
  onOpenDocument,
  onOpenMindMap,
  onOpenTodo,
  onOpenFormulario,
  canManage,
  canManageEntity,
  canWriteEntity,
  onCreate,
  onOpenEdit,
  collaborators,
  onDelete,
  onMoveEntity,
  onClone,
  onReorderTo,
}: {
  workspaces: Workspace[];
  folders: WorkspaceFolder[];
  lists: TaskList[];
  documents: TaskDocument[];
  mindmaps: MindMap[];
  todos: Todo[];
  formularios: Formulario[];
  counts: Record<string, number>;
  selectedListId: string | null;
  onSelectList: (id: string) => void;
  onOpenDashboard: (scope: { type: 'workspace' | 'folder'; wsId: string; folderId?: string }) => void;
  onOpenDocument: (docId: string) => void;
  onOpenMindMap: (mapId: string) => void;
  onOpenTodo: (todoId: string) => void;
  onOpenFormulario: (formularioId: string) => void;
  canManage: boolean;
  canManageEntity: (type: EntityType, id: string) => boolean;
  canWriteEntity: (type: EntityType, id: string) => boolean;
  onCreate: (input: CreateInput) => Promise<{ error?: string } | undefined>;
  onOpenEdit: (type: EntityType, entity: Workspace | WorkspaceFolder | TaskList | TaskDocument | MindMap | Todo | Formulario) => void;
  collaborators: Profile[];
  onDelete: (input: { type: EntityType; id: string }) => void;
  onMoveEntity: (input: { type: EntityType; id: string; workspaceId: string; parentFolderId: string | null }) => Promise<{ error?: string } | undefined>;
  onClone: (input: { type: CloneTarget['type']; id: string; name: string }) => Promise<{ error?: string } | undefined>;
  onReorderTo: (input: { type: 'workspace' | 'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario'; id: string; targetId: string }) => void;
}) {
  const [collapsedWs, setCollapsedWs] = useState<Set<string>>(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [name, setName] = useState('');
  const [creando, setCreando] = useState(false);
  const [templateId, setTemplateId] = useState('blank');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moveWs, setMoveWs] = useState<string>('');
  const [moveParent, setMoveParent] = useState<string>('');
  const [cloneTarget, setCloneTarget] = useState<CloneTarget | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [clonando, setClonando] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(true);
  const [mobileMounted, setMobileMounted] = useState(false);

  const {
    reorderEntity,
    reorderTarget,
    dragGhost,
    ghostElRef,
    onGripPointerDown,
    dropAttrs,
    orderFor,
  } = useArrastreNav({ canManage, folders, onReorderTo, onMoveEntity });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lectura SSR-safe de localStorage post-mount; patrí³n caní³nico (ver theme-toggle.tsx).
    setMobileOpen(window.localStorage.getItem('tareas-nav-collapsed') !== '1');

    setMobileMounted(true);
  }, []);

  const navOpen = mobileMounted && mobileOpen;
  const setNavOpen = (v: boolean) => {
    setMobileOpen(v);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('tareas-nav-collapsed', v ? '0' : '1');
    }
  };
  const closeNav = () => setNavOpen(false);
  const drawerOpen = useSyncExternalStore(
    navBus.subscribe,
    navBus.getSnapshot,
    () => false
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navBus.closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const childrenMap: Record<string, WorkspaceFolder[]> = {};
  folders.forEach((f) => {
    const parentKey = f.parent_folder_id ?? '';
    if (!childrenMap[parentKey]) childrenMap[parentKey] = [];
    childrenMap[parentKey].push(f);
  });
  Object.keys(childrenMap).forEach((k) => childrenMap[k].sort((a, b) => a.position - b.position));

  const rootFoldersOf = (wsId: string) => (childrenMap[''] || []).filter((f) => f.workspace_id === wsId);

  const toggleCollapsed = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDialog = (state: DialogState) => {
    setName('');
    setTemplateId('blank');
    setDialog({
      visibility: 'public',
      memberIds: [],
      memberGrants: {},
      ...state,
    });
  };

  const submitCreate = async () => {
    if (!dialog || !name.trim() || creando) return;
    setCreando(true);
    try {
      const result = await onCreate({
        ...dialog,
        name: name.trim(),
        templateId: dialog.type === 'mindmap' ? templateId : undefined,
        memberGrants: Object.entries(dialog.memberGrants ?? {}).map(([profileId, grant]) => ({
          profileId,
          permission: grant.permission,
          inherit: grant.inherit,
        })),
      } as CreateInput);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setDialog(null);
    } finally {
      setCreando(false);
    }
  };

  const toggleCreateMember = (profileId: string) => {
    if (!dialog) return;
    const included = (dialog.memberIds ?? []).includes(profileId);
    const nextIds = included
      ? (dialog.memberIds ?? []).filter((m) => m !== profileId)
      : [...(dialog.memberIds ?? []), profileId];
    const nextGrants = { ...(dialog.memberGrants ?? {}) };
    if (included) delete nextGrants[profileId];
    else nextGrants[profileId] = { permission: 'read', inherit: NO_INHERIT_TYPES.has(dialog.type) ? false : true };
    setDialog({ ...dialog, memberIds: nextIds, memberGrants: nextGrants });
  };

  const setCreateGrant = (profileId: string, patch: Partial<{ permission: EntityPermission; inherit: boolean }>) => {
    if (!dialog) return;
    const grant = (dialog.memberGrants ?? {})[profileId] ?? { permission: 'read', inherit: NO_INHERIT_TYPES.has(dialog.type) ? false : true };
    setDialog({
      ...dialog,
      memberGrants: { ...(dialog.memberGrants ?? {}), [profileId]: { ...grant, ...patch } },
    });
  };

  const countAllFolders = (folderId: string): number =>
    (childrenMap[folderId] || []).reduce((sum, f) => sum + 1 + countAllFolders(f.id), 0);

  const describeDelete = (type: EntityType, id: string): string => {
    if (type === 'workspace') {
      const wsFolders = folders.filter((f) => f.workspace_id === id && !f.parent_folder_id);
      const allFolders = wsFolders.reduce((sum, f) => sum + 1 + countAllFolders(f.id), 0);
      const wsLists = lists.filter((l) => l.workspace_id === id);
      const wsDocs = documents.filter((d) => d.workspace_id === id);
      const wsMaps = mindmaps.filter((m) => m.workspace_id === id);
      const wsTodos = todos.filter((t) => t.workspace_id === id);
      const wsFormularios = formularios.filter((f) => f.workspace_id === id);
      const tasks = wsLists.reduce((sum, l) => sum + (counts[l.id] || 0), 0);
      const respuestas = wsFormularios.reduce((sum, f) => sum + (counts[f.id] || 0), 0);
      return 'Se eliminará el espacio con ' + allFolders + ' carpeta(s), ' + wsLists.length + ' lista(s), ' + wsDocs.length + ' documento(s), ' + wsMaps.length + ' mapa(s), ' + wsTodos.length + ' TO-DO(s) y ' + wsFormularios.length + ' formulario(s) con ' + respuestas + ' respuesta(s). Las ' + tasks + ' tarea(s) también se eliminarán. Esta accií³n no se puede deshacer.';
    }
    if (type === 'folder') {
      const sub = countAllFolders(id);
      const fLists = lists.filter((l) => l.folder_id === id);
      const fDocs = documents.filter((d) => d.folder_id === id);
      const fMaps = mindmaps.filter((m) => m.folder_id === id);
      const fTodos = todos.filter((t) => t.folder_id === id);
      const fFormularios = formularios.filter((f) => f.folder_id === id);
      const tasks = fLists.reduce((sum, l) => sum + (counts[l.id] || 0), 0);
      const respuestas = fFormularios.reduce((sum, f) => sum + (counts[f.id] || 0), 0);
      return 'Se eliminará la carpeta con ' + sub + ' sub-carpeta(s), ' + fLists.length + ' lista(s), ' + fDocs.length + ' documento(s), ' + fMaps.length + ' mapa(s), ' + fTodos.length + ' TO-DO(s) y ' + fFormularios.length + ' formulario(s) con ' + respuestas + ' respuesta(s). Las ' + tasks + ' tarea(s) también se eliminarán. Esta accií³n no se puede deshacer.';
    }
    if (type === 'list') {
      const tasks = counts[id] || 0;
      return 'La lista y sus ' + tasks + ' tarea(s) se borrarán. Esta accií³n no se puede deshacer.';
    }
    if (type === 'mindmap') {
      return 'Se eliminará el mapa mental con todos sus nodos y conexiones. Esta accií³n no se puede deshacer.';
    }
    if (type === 'todo') {
      return 'Se eliminará el TO-DO con todos sus items repetitivos y el progreso de cada trabajador. Esta accií³n no se puede deshacer.';
    }
    if (type === 'formulario') {
      return 'Se eliminará el formulario con todas sus respuestas, listas de acceso e invitados. Esta accií³n no se puede deshacer.';
    }
    return 'Se eliminará el documento con todas sus páginas. Esta accií³n no se puede deshacer.';
  };

  const confirmDelete = (type: EntityType, id: string, name: string) => {
    const labels: Record<EntityType, string> = {
      workspace: 'espacio de trabajo',
      folder: 'carpeta',
      list: 'lista',
      document: 'documento',
      mindmap: 'mapa mental',
      todo: 'TO-DO',
      formulario: 'formulario',
    };
    setDeleteTarget({ type, id, name, label: labels[type], description: describeDelete(type, id) });
  };

  const openMoveDialog = (type: 'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario', entity: WorkspaceFolder | TaskList | TaskDocument | MindMap | Todo | Formulario) => {
    setMoveTarget({ type, id: entity.id, name: entity.name });
    if (type === 'folder') {
      const f = entity as WorkspaceFolder;
      setMoveWs(f.workspace_id);
      setMoveParent(f.parent_folder_id ?? '');
    } else {
      const item = entity as TaskList | TaskDocument | MindMap | Todo | Formulario;
      setMoveWs(item.workspace_id);
      setMoveParent(item.folder_id ?? '');
    }
  };

  const confirmMove = async () => {
    if (!moveTarget) return;
    const result = await onMoveEntity({
      type: moveTarget.type,
      id: moveTarget.id,
      workspaceId: moveWs,
      parentFolderId: moveParent || null,
    });
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setMoveTarget(null);
  };

  const openCloneDialog = (
    type: CloneTarget['type'],
    entity: TaskList | TaskDocument | MindMap | Todo | Formulario
  ) => {
    const pool: { workspace_id: string; folder_id: string | null; name: string }[] =
      type === 'list'
        ? lists
        : type === 'document'
          ? documents
          : type === 'mindmap'
            ? mindmaps
            : type === 'todo'
              ? todos
              : formularios;
    const existentes = pool
      .filter(
        (x) =>
          x.workspace_id === entity.workspace_id &&
          (x.folder_id ?? null) === (entity.folder_id ?? null)
      )
      .map((x) => x.name);
    setCloneName(nombreClonUnico(entity.name, existentes));
    setCloneTarget({ type, id: entity.id, name: entity.name });
  };

  const confirmClone = async () => {
    if (!cloneTarget || !cloneName.trim() || clonando) return;
    setClonando(true);
    try {
      const result = await onClone({
        type: cloneTarget.type,
        id: cloneTarget.id,
        name: cloneName.trim(),
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setCloneTarget(null);
    } finally {
      setClonando(false);
    }
  };

  const isDescendant = (ancestorId: string, nodeId: string): boolean => {
    if (!ancestorId) return false;
    for (const child of childrenMap[ancestorId] || []) {
      if (child.id === nodeId) return true;
      if (isDescendant(child.id, nodeId)) return true;
    }
    return false;
  };

  const folderOptions = (wsId: string): { id: string; label: string }[] => {
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      folders
        .filter((f) => f.workspace_id === wsId && (f.parent_folder_id ?? null) === parentId)
        .sort((a, b) => a.position - b.position)
        .forEach((f) => {
          const isInvalidFolderTarget = moveTarget?.type === 'folder' && (f.id === moveTarget.id || isDescendant(moveTarget.id, f.id));
          if (!isInvalidFolderTarget) {
            out.push({ id: f.id, label: `${'— '.repeat(depth)}${f.name}` });
          }
          walk(f.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  };

  const wsSorted = orderFor('ws:all', workspaces)
    .map((id) => workspaces.find((w) => w.id === id))
    .filter((w): w is Workspace => !!w);

  const pathname = usePathname();
  const segments = (() => {
    const parts = pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('proyectos');
    return idx >= 0 ? parts.slice(idx + 1) : [];
  })();
  const matchesSlug = (param: string | undefined, id: string, name: string) => {
    if (!param) return false;
    if (param === slugify(name) || param === id) return true;
    if (id.startsWith(param)) return true;
    return false;
  };
  const activeWsId = segments[0]
    ? wsSorted.find((w) => matchesSlug(segments[0], w.id, w.name))?.id
    : undefined;
  const activeFolderId = (() => {
    const fSeg = segments[1] && segments[1] !== 'dashboard' ? segments[1] : undefined;
    if (!fSeg || !activeWsId) return undefined;
    return folders.find(
      (f) => f.workspace_id === activeWsId && matchesSlug(fSeg, f.id, f.name),
    )?.id;
  })();
  const activeDocId = (() => {
    if (segments[2] !== 'documento' || !segments[3] || !activeWsId) return undefined;
    return documents.find(
      (d) => d.workspace_id === activeWsId && matchesSlug(segments[3], d.id, d.name),
    )?.id;
  })();
  const activeMapId = (() => {
    if (segments[2] !== 'mapa' || !segments[3] || !activeWsId) return undefined;
    return mindmaps.find(
      (m) => m.workspace_id === activeWsId && matchesSlug(segments[3], m.id, m.name),
    )?.id;
  })();
  const activeTodoId = (() => {
    if (segments[2] !== 'todo' || !segments[3] || !activeWsId) return undefined;
    return todos.find(
      (t) => t.workspace_id === activeWsId && matchesSlug(segments[3], t.id, t.name),
    )?.id;
  })();
  const activeFormularioId = (() => {
    if (segments[2] !== 'formulario' || !segments[3] || !activeWsId) return undefined;
    return formularios.find(
      (f) => f.workspace_id === activeWsId && matchesSlug(segments[3], f.id, f.name),
    )?.id;
  })();

  const dialogMeta: Record<DialogState['type'], { title: string; icon: React.ReactNode; placeholder: string }> = Object.fromEntries(
    (Object.keys(ENTIDADES_META) as (keyof typeof ENTIDADES_META)[]).map((tipo) => {
      const meta = ENTIDADES_META[tipo];
      const Icono = meta.icono;
      return [tipo, { title: meta.etiquetaCrear, icon: <Icono className="size-4" />, placeholder: meta.placeholder }];
    })
  ) as Record<DialogState['type'], { title: string; icon: React.ReactNode; placeholder: string }>;

  const shared: SharedProps = {
    workspaces,
    folders,
    lists,
    documents,
    mindmaps,
    todos,
    formularios,
    counts,
    selectedListId,
    collapsedFolders,
    canManage,
    canManageEntity,
    canWriteEntity,
    onSelectList: (id) => {
      onSelectList(id);
      navBus.closeDrawer();
    },
    onOpenDashboard: (scope) => {
      onOpenDashboard(scope);
      navBus.closeDrawer();
    },
    onOpenDocument: (docId) => {
      onOpenDocument(docId);
      navBus.closeDrawer();
    },
    onOpenMindMap: (mapId) => {
      onOpenMindMap(mapId);
      navBus.closeDrawer();
    },
    onOpenTodo: (todoId) => {
      onOpenTodo(todoId);
      navBus.closeDrawer();
    },
    onOpenFormulario: (formularioId) => {
      onOpenFormulario(formularioId);
      navBus.closeDrawer();
    },
    onOpenCreate: openDialog,
    onOpenEdit,
    onConfirmDelete: confirmDelete,
    onOpenMoveDialog: openMoveDialog,
    onOpenCloneDialog: openCloneDialog,
    onToggleFolder: (id) => toggleCollapsed(setCollapsedFolders, id),
    orderFor,
    reorderEntity,
    reorderTarget,
    onGripPointerDown,
    dropAttrs,
    activeWsId,
    activeFolderId,
    activeDocId,
    activeMapId,
    activeTodoId,
    activeFormularioId,
  };

  return (
    <>
      <aside
        className={cn(
          'flex flex-col border-r bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200',
          'fixed inset-y-0 left-0 z-40 w-64 shadow-lg lg:static lg:z-auto lg:shadow-none print:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          navOpen
            ? 'lg:flex lg:h-full lg:w-64 lg:shrink-0'
            : 'lg:flex lg:h-full lg:w-14 lg:shrink-0'
        )}
      >
        {/* Cabecera expandida (mí³vil + desktop expandido) */}
        <div
          className={cn(
            'flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3',
            !navOpen && 'lg:hidden'
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <LayoutGrid className="size-4 shrink-0 text-primary" />
            <span className="font-display truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              Espacios de trabajo
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {canManage && (
              <button
                onClick={() => openDialog({ type: 'workspace' })}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
                title="Nuevo espacio de trabajo"
                aria-label="Nuevo espacio de trabajo"
              >
                <Plus className="size-4" />
              </button>
            )}
            <button
              onClick={closeNav}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
              aria-label="Ocultar navegacií³n"
              title="Ocultar navegacií³n"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>
        </div>

        {/* Cabecera rail (desktop colapsado) */}
        {!navOpen && (
          <div className="hidden h-14 shrink-0 items-center justify-center border-b border-sidebar-border lg:flex">
            <button
              onClick={() => setNavOpen(true)}
              className="flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              aria-label="Expandir navegacií³n"
              title="Expandir navegacií³n"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          </div>
        )}

        {/* írbol completo (mí³vil drawer + desktop expandido) */}
        <div className={cn('flex-1 overflow-y-auto px-2 pb-3', !navOpen && 'lg:hidden')}>
        {wsSorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
            <LayoutGrid className="size-6 text-sidebar-foreground/40" />
            <p className="text-sm font-medium text-sidebar-foreground">
              {canManage ? 'Crea tu primer espacio' : 'Sin espacios de trabajo'}
            </p>
            <p className="text-xs text-sidebar-foreground/60">
              {canManage
                ? 'Organiza carpetas, listas y documentos.'
                : 'Solicita acceso a un administrador.'}
            </p>
          </div>
        ) : (
          wsSorted.map((ws) => {
            const wsFolderIds = orderFor(`folder:${ws.id}:`, rootFoldersOf(ws.id));
            const wsFolders = wsFolderIds
              .map((id) => folders.find((f) => f.id === id))
              .filter((f): f is WorkspaceFolder => !!f);
            const rootListIds = orderFor(`list:${ws.id}:`, lists.filter((l) => l.workspace_id === ws.id && !l.folder_id));
            const rootLists = rootListIds
              .map((id) => lists.find((l) => l.id === id))
              .filter((l): l is TaskList => !!l);
            const rootDocIds = orderFor(`doc:${ws.id}:`, documents.filter((d) => d.workspace_id === ws.id && !d.folder_id));
            const rootDocs = rootDocIds
              .map((id) => documents.find((d) => d.id === id))
              .filter((d): d is TaskDocument => !!d);
            const rootMapIds = orderFor(`map:${ws.id}:`, mindmaps.filter((m) => m.workspace_id === ws.id && !m.folder_id));
            const rootMaps = rootMapIds
              .map((id) => mindmaps.find((m) => m.id === id))
              .filter((m): m is MindMap => !!m);
            const rootTodoIds = orderFor(`todo:${ws.id}:`, todos.filter((t) => t.workspace_id === ws.id && !t.folder_id));
            const rootTodos = rootTodoIds
              .map((id) => todos.find((t) => t.id === id))
              .filter((t): t is Todo => !!t);
            const rootFormularioIds = orderFor(`formulario:${ws.id}:`, formularios.filter((f) => f.workspace_id === ws.id && !f.folder_id));
            const rootFormularios = rootFormularioIds
              .map((id) => formularios.find((f) => f.id === id))
              .filter((f): f is Formulario => !!f);
            const isWsOpen = !collapsedWs.has(ws.id);
            const kind: ReorderKind = { type: 'workspace', id: ws.id, containerKey: 'ws:all' };
            const isWsActive = ws.id === activeWsId;
            const isReorderTarget = reorderTarget?.type === 'workspace' && reorderTarget.id === ws.id;
            const isDragging = reorderEntity?.type === 'workspace' && reorderEntity.id === ws.id;
            const wsIdx = wsSorted.findIndex((w) => w.id === ws.id);
            return (
              <div key={ws.id} className={cn('mb-1', wsIdx > 0 && 'border-t border-border pt-2')}>
                <div
                  className={cn(
                    'group relative flex items-center gap-1 rounded-lg px-2 py-1.5 transition-[opacity,transform,box-shadow,background-color] duration-150 ease-out hover:bg-sidebar-accent/50',
                    isWsActive &&
                      'before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary',
                    isReorderTarget && DROP_TARGET,
                    isDragging && DRAG_PLACEHOLDER
                  )}
                  {...dropAttrs(kind)}
                >
                  {canWriteEntity('workspace', ws.id) && (
                    <GripButton onPointerDown={(e) => onGripPointerDown(e, kind)} />
                  )}
                  <button
                    onClick={() => toggleCollapsed(setCollapsedWs, ws.id)}
                    className="flex w-4 shrink-0 items-center justify-center text-muted-foreground"
                    title={isWsOpen ? 'Colapsar' : 'Expandir'}
                  >
                    <ChevronDown className={cn('size-3.5 transition-transform', !isWsOpen && '-rotate-90')} />
                  </button>
                  <button
                    onClick={() => onOpenDashboard({ type: 'workspace', wsId: ws.id })}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm',
                      isWsActive ? 'font-semibold text-sidebar-foreground' : 'font-medium text-sidebar-foreground',
                    )}
                    title={ws.name}
                  >
                    {isWsOpen ? (
                      <FolderOpen className="size-4 shrink-0 text-blue-500" />
                    ) : (
                      <Folder className="size-4 shrink-0 text-blue-500" />
                    )}
                    <span className="truncate">{ws.name}</span>
                    <VisibilityIcon visibility={ws.visibility} />
                  </button>
                  {canWriteEntity('workspace', ws.id) && (
                    <RowActions
                      label={ws.name}
                      create={[
                        {
                          key: 'list',
                          icon: <ENTIDADES_META.list.icono className="size-4" />,
                          label: 'Nueva lista',
                          description: 'Crear una lista de tareas en la raí­z',
                          onClick: () => openDialog({ type: 'list', workspaceId: ws.id }),
                        },
                        {
                          key: 'document',
                          icon: <ENTIDADES_META.document.icono className="size-4" />,
                          label: 'Nuevo documento',
                          description: 'Crear un documento en la raí­z',
                          onClick: () => openDialog({ type: 'document', workspaceId: ws.id }),
                        },
                        {
                          key: 'mindmap',
                          icon: <ENTIDADES_META.mindmap.icono className="size-4" />,
                          label: 'Nuevo mapa mental',
                          description: 'Crear un mapa mental en la raí­z',
                          onClick: () => openDialog({ type: 'mindmap', workspaceId: ws.id }),
                        },
                        {
                          key: 'todo',
                          icon: <ENTIDADES_META.todo.icono className="size-4" />,
                          label: 'Nuevo TO-DO',
                          description: 'Crear un TO-DO repetitivo en la raí­z',
                          onClick: () => openDialog({ type: 'todo', workspaceId: ws.id }),
                        },
                        {
                          key: 'formulario',
                          icon: <ENTIDADES_META.formulario.icono className="size-4" />,
                          label: 'Nuevo formulario',
                          description: 'Crear un formulario para clientes en la raí­z',
                          onClick: () => openDialog({ type: 'formulario', workspaceId: ws.id }),
                        },
                        {
                          key: 'folder',
                          icon: <FolderPlus className="size-4" />,
                          label: 'Nueva carpeta',
                          description: 'Crear una carpeta en la raí­z',
                          onClick: () => openDialog({ type: 'folder', workspaceId: ws.id }),
                        },
                      ]}
                      manage={[
                        {
                          key: 'edit',
                          icon: <Pencil className="size-4" />,
                          label: 'Editar',
                          description: 'Cambiar nombre o visibilidad',
                          onClick: () => onOpenEdit('workspace', ws),
                        },
                        ...(canManageEntity('workspace', ws.id)
                          ? [{
                              key: 'delete',
                              icon: <Trash2 className="size-4" />,
                              label: 'Eliminar',
                              description: 'Eliminar el área de trabajo con todo su contenido',
                              onClick: () => confirmDelete('workspace', ws.id, ws.name),
                              destructive: true,
                            } as RowActionItem]
                          : []),
                      ]}
                    />
                  )}
                </div>

                {isWsOpen && (
                  <>
                    {wsFolders.map((folder) => (
                      <FolderNode key={folder.id} folder={folder} depth={1} wsId={ws.id} childrenMap={childrenMap} shared={shared} />
                    ))}
                    {rootLists.map((list) => (
                      <ListRow key={list.id} list={list} shared={shared} />
                    ))}
                    {rootDocs.map((doc) => (
                      <DocRow key={doc.id} doc={doc} shared={shared} />
                    ))}
                    {rootMaps.map((map) => (
                      <MindMapRow key={map.id} map={map} shared={shared} />
                    ))}
                    {rootTodos.map((todo) => (
                      <TodoRow key={todo.id} todo={todo} shared={shared} />
                    ))}
                    {rootFormularios.map((formulario) => (
                      <FormularioRow key={formulario.id} formulario={formulario} shared={shared} />
                    ))}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Rail de workspaces (desktop colapsado) */}
      {!navOpen && (
        <RailNav
          wsSorted={wsSorted}
          folders={folders}
          lists={lists}
          documents={documents}
          mindmaps={mindmaps}
          todos={todos}
          formularios={formularios}
          selectedListId={selectedListId}
          activeWsId={activeWsId}
          activeFolderId={activeFolderId}
          activeDocId={activeDocId}
          activeMapId={activeMapId}
          activeTodoId={activeTodoId}
          activeFormularioId={activeFormularioId}
          onOpenDashboard={onOpenDashboard}
          onSelectList={onSelectList}
          onOpenDocument={onOpenDocument}
          onOpenMindMap={onOpenMindMap}
          onOpenTodo={onOpenTodo}
          onOpenFormulario={onOpenFormulario}
        />
      )}

      <DialogosNav
        dialog={dialog}
        setDialog={setDialog}
        name={name}
        setName={setName}
        templateId={templateId}
        setTemplateId={setTemplateId}
        creando={creando}
        submitCreate={submitCreate}
        toggleCreateMember={toggleCreateMember}
        setCreateGrant={setCreateGrant}
        collaborators={collaborators}
        dialogMeta={dialogMeta}
        moveTarget={moveTarget}
        setMoveTarget={setMoveTarget}
        wsSorted={wsSorted}
        moveWs={moveWs}
        setMoveWs={setMoveWs}
        moveParent={moveParent}
        setMoveParent={setMoveParent}
        folderOptions={folderOptions}
        confirmMove={confirmMove}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        onDelete={onDelete}
        cloneTarget={cloneTarget}
        setCloneTarget={setCloneTarget}
        cloneName={cloneName}
        setCloneName={setCloneName}
        clonando={clonando}
        confirmClone={confirmClone}
      />
      </aside>

    {/* Backdrop (mí³vil) */}
      <div
        onClick={() => navBus.closeDrawer()}
        aria-hidden={!drawerOpen}
        className={cn(
          'fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden print:hidden',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />

      {dragGhost &&
        (() => {
          const ghostEntity =
            dragGhost.type === 'workspace'
              ? wsSorted.find((w) => w.id === dragGhost.id)
              : dragGhost.type === 'folder'
                ? folders.find((f) => f.id === dragGhost.id)
                : dragGhost.type === 'list'
                  ? lists.find((l) => l.id === dragGhost.id)
                  : dragGhost.type === 'document'
                    ? documents.find((d) => d.id === dragGhost.id)
                    : dragGhost.type === 'mindmap'
                      ? mindmaps.find((m) => m.id === dragGhost.id)
                      : dragGhost.type === 'todo'
                        ? todos.find((t) => t.id === dragGhost.id)
                        : formularios.find((f) => f.id === dragGhost.id);
          const ghostIcon = (() => {
            const meta = ENTIDADES_META[dragGhost.type];
            const Icono = meta.icono;
            return <Icono className={cn('size-4 shrink-0', meta.color)} />;
          })();
          return (
            <div
              ref={ghostElRef}
              className="pointer-events-none fixed left-0 top-0 z-50"
              aria-hidden
            >
              <div className="drag-ghost-inner flex w-56 items-center gap-2.5 rounded-lg bg-card px-3 py-2 shadow-raised ring-1 ring-border/80">
                {ghostIcon}
                <span className="truncate text-sm font-medium text-foreground">
                  {ghostEntity?.name ?? ''}
                </span>
              </div>
            </div>
          );
        })()}
    </>
  );
}

export type { CreateInput, UpdateInput, EditState } from './tipos';
export { VisibilityFields } from './visibilidad';
