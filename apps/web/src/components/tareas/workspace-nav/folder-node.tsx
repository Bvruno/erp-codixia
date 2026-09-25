'use client';

import {
  Folder,
  ChevronDown,
  FolderPlus,
  Pencil,
  Move,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENTIDADES_META } from '@/lib/entidades-meta';
import type { WorkspaceFolder, TaskList, TaskDocument, MindMap, Todo, Formulario } from '@/types';
import type { ReorderKind, RowActionItem, SharedProps } from './tipos';
import { DRAG_PLACEHOLDER, DROP_TARGET, GripButton, ListRow, DocRow, MindMapRow, TodoRow, FormularioRow, RowActions } from './filas';
import { VisibilityIcon } from './visibilidad';

// Nodo recursivo de carpeta dentro del árbol de navegacií³n.

export function FolderNode({
  folder,
  depth,
  wsId,
  childrenMap,
  shared,
}: {
  folder: WorkspaceFolder;
  depth: number;
  wsId: string;
  childrenMap: Record<string, WorkspaceFolder[]>;
  shared: SharedProps;
}) {
  const subFolderIds = shared.orderFor(
    `folder:${wsId}:${folder.parent_folder_id ?? ''}`,
    shared.folders.filter((f) => f.parent_folder_id === folder.id && f.workspace_id === wsId)
  );
  const subFolders = subFolderIds
    .map((id) => shared.folders.find((f) => f.id === id))
    .filter((f): f is WorkspaceFolder => !!f);
  const folderListIds = shared.orderFor(
    `list:${wsId}:${folder.id}`,
    shared.lists.filter((l) => l.folder_id === folder.id)
  );
  const folderLists = folderListIds
    .map((id) => shared.lists.find((l) => l.id === id))
    .filter((l): l is TaskList => !!l);
  const folderDocIds = shared.orderFor(
    `doc:${wsId}:${folder.id}`,
    shared.documents.filter((d) => d.folder_id === folder.id)
  );
  const folderDocs = folderDocIds
    .map((id) => shared.documents.find((d) => d.id === id))
    .filter((d): d is TaskDocument => !!d);
  const folderMapIds = shared.orderFor(
    `map:${wsId}:${folder.id}`,
    shared.mindmaps.filter((m) => m.folder_id === folder.id)
  );
  const folderMaps = folderMapIds
    .map((id) => shared.mindmaps.find((m) => m.id === id))
    .filter((m): m is MindMap => !!m);
  const folderTodoIds = shared.orderFor(
    `todo:${wsId}:${folder.id}`,
    shared.todos.filter((t) => t.folder_id === folder.id)
  );
  const folderTodos = folderTodoIds
    .map((id) => shared.todos.find((t) => t.id === id))
    .filter((t): t is Todo => !!t);
  const folderFormularioIds = shared.orderFor(
    `formulario:${wsId}:${folder.id}`,
    shared.formularios.filter((f) => f.folder_id === folder.id)
  );
  const folderFormularios = folderFormularioIds
    .map((id) => shared.formularios.find((f) => f.id === id))
    .filter((f): f is Formulario => !!f);
  const isOpen = !shared.collapsedFolders.has(folder.id);
  const kind: ReorderKind = {
    type: 'folder',
    id: folder.id,
    containerKey: `folder:${wsId}:${folder.parent_folder_id ?? ''}`,
  };
  const isFolderActive = folder.id === shared.activeFolderId;
  const isDragging = shared.reorderEntity?.type === 'folder' && shared.reorderEntity.id === folder.id;
  const isReorderTarget = shared.reorderTarget?.type === 'folder' && shared.reorderTarget.id === folder.id;

  return (
    <div className="mb-1 ml-2">
      <div
        className={cn(
          'group relative flex items-center gap-1 rounded-lg px-2 py-1.5 transition-[opacity,transform,box-shadow,background-color] duration-150 ease-out hover:bg-sidebar-accent/50',
          isFolderActive &&
            'before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary',
          isReorderTarget && DROP_TARGET,
          isDragging && DRAG_PLACEHOLDER
        )}
        {...shared.dropAttrs(kind)}
      >
        {shared.canWriteEntity('folder', folder.id) && (
          <GripButton onPointerDown={(e) => shared.onGripPointerDown(e, kind)} />
        )}
        {!shared.canWriteEntity('folder', folder.id) && <span className="w-3.5 shrink-0" />}
        <button
          onClick={() => shared.onToggleFolder(folder.id)}
          className="flex w-4 shrink-0 items-center justify-center text-muted-foreground"
          title={isOpen ? 'Colapsar' : 'Expandir'}
        >
          <ChevronDown className={cn('size-3.5 transition-transform', !isOpen && '-rotate-90')} />
        </button>
        <button
          onClick={() => shared.onOpenDashboard({ type: 'folder', wsId, folderId: folder.id })}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm',
            isFolderActive ? 'font-semibold text-sidebar-foreground' : 'text-muted-foreground',
          )}
          title={folder.name}
        >
          <Folder className="size-3.5 shrink-0 text-yellow-500" />
          <span className="truncate">{folder.name}</span>
          <VisibilityIcon visibility={folder.visibility} />
        </button>
        {shared.canWriteEntity('folder', folder.id) && (
          <RowActions
            label={folder.name}
            create={[
              {
                key: 'subfolder',
                icon: <FolderPlus className="size-4" />,
                label: 'Nueva sub-carpeta',
                description: 'Crear una carpeta dentro de esta',
                onClick: () => shared.onOpenCreate({ type: 'folder', workspaceId: wsId, parentFolderId: folder.id }),
              },
              {
                key: 'document',
                icon: <ENTIDADES_META.document.icono className="size-4" />,
                label: 'Nuevo documento',
                description: 'Crear un documento dentro de esta carpeta',
                onClick: () => shared.onOpenCreate({ type: 'document', folderId: folder.id }),
              },
              {
                key: 'mindmap',
                icon: <ENTIDADES_META.mindmap.icono className="size-4" />,
                label: 'Nuevo mapa mental',
                description: 'Crear un mapa mental dentro de esta carpeta',
                onClick: () => shared.onOpenCreate({ type: 'mindmap', folderId: folder.id }),
              },
              {
                key: 'list',
                icon: <ENTIDADES_META.list.icono className="size-4" />,
                label: 'Nueva lista',
                description: 'Crear una lista de tareas dentro de esta carpeta',
                onClick: () => shared.onOpenCreate({ type: 'list', folderId: folder.id }),
              },
              {
                key: 'todo',
                icon: <ENTIDADES_META.todo.icono className="size-4" />,
                label: 'Nuevo TO-DO',
                description: 'Crear un TO-DO repetitivo dentro de esta carpeta',
                onClick: () => shared.onOpenCreate({ type: 'todo', folderId: folder.id }),
              },
              {
                key: 'formulario',
                icon: <ENTIDADES_META.formulario.icono className="size-4" />,
                label: 'Nuevo formulario',
                description: 'Crear un formulario para clientes dentro de esta carpeta',
                onClick: () => shared.onOpenCreate({ type: 'formulario', folderId: folder.id }),
              },
            ]}
            manage={[
              {
                key: 'edit',
                icon: <Pencil className="size-4" />,
                label: 'Editar',
                description: 'Cambiar nombre o visibilidad',
                onClick: () => shared.onOpenEdit('folder', folder),
              },
              {
                key: 'move',
                icon: <Move className="size-4" />,
                label: 'Mover',
                description: 'Cambiar a otra área de trabajo o carpeta',
                onClick: () => shared.onOpenMoveDialog('folder', folder),
              },
              ...(shared.canManageEntity('folder', folder.id)
                ? [{
                    key: 'delete',
                    icon: <Trash2 className="size-4" />,
                    label: 'Eliminar',
                    description: 'Eliminar la carpeta con todo su contenido',
                    onClick: () => shared.onConfirmDelete('folder', folder.id, folder.name),
                    destructive: true,
                  } as RowActionItem]
                : []),
            ]}
          />
        )}
      </div>

      {isOpen && (
        <div className="ml-2 border-l border-border/70 pl-1.5">
          {subFolders.map((sub) => (
            <FolderNode key={sub.id} folder={sub} depth={depth + 1} wsId={wsId} childrenMap={childrenMap} shared={shared} />
          ))}
          {folderLists.map((list) => (
            <ListRow key={list.id} list={list} shared={shared} />
          ))}
          {folderDocs.map((doc) => (
            <DocRow key={doc.id} doc={doc} shared={shared} />
          ))}
          {folderMaps.map((map) => (
            <MindMapRow key={map.id} map={map} shared={shared} />
          ))}
          {folderTodos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} shared={shared} />
          ))}
          {folderFormularios.map((formulario) => (
            <FormularioRow key={formulario.id} formulario={formulario} shared={shared} />
          ))}
        </div>
      )}
    </div>
  );
}
