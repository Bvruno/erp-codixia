'use client';

import {
  Plus,
  GripVertical,
  Pencil,
  Copy,
  Move,
  Trash2,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ENTIDADES_META } from '@/lib/entidades-meta';
import type { TaskList, TaskDocument, MindMap, Todo, Formulario } from '@/types';
import type { ReorderKind, RowActionItem, SharedProps } from './tipos';
import { VisibilityIcon } from './visibilidad';

// Filas del árbol (listas, documentos, mapas, TO-DOs) + primitivas de fila.

const ICONO_LISTA = ENTIDADES_META.list.icono;
const ICONO_DOCUMENTO = ENTIDADES_META.document.icono;
const ICONO_MAPA = ENTIDADES_META.mindmap.icono;
const ICONO_FORMULARIO = ENTIDADES_META.formulario.icono;
const ICONO_TODO = ENTIDADES_META.todo.icono;

export const DRAG_PLACEHOLDER = 'opacity-25';
export const DROP_TARGET = 'ring-2 ring-primary/70 bg-primary/5';

export function GripButton({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <button
      onPointerDown={onPointerDown}
      title="Arrastrar para mover o reordenar"
      className="cursor-grab touch-none select-none text-muted-foreground transition-opacity hover:text-foreground md:opacity-0 md:group-hover:opacity-100 active:cursor-grabbing"
    >
      <GripVertical className="size-3.5" />
    </button>
  );
}

export function RailBtn({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors',
        active
          ? 'ring-1 ring-inset ring-primary/60 text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function RowActions({
  label,
  create = [],
  manage = [],
  more = [],
}: {
  label: string;
  create?: RowActionItem[];
  manage?: RowActionItem[];
  more?: RowActionItem[];
}) {
  if (create.length === 0 && manage.length === 0 && more.length === 0) {
    return null;
  }

  const renderMenu = (
    trigger: React.ReactNode,
    triggerLabel: string,
    menuTitle: string,
    items: RowActionItem[]
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground transition-opacity hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
          title={triggerLabel}
          aria-label={triggerLabel}
        >
          {trigger}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {menuTitle}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            onClick={item.onClick}
            className={item.destructive ? 'text-destructive focus:text-destructive' : ''}
          >
            <span className="text-muted-foreground">{item.icon}</span>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {create.length > 0 &&
        renderMenu(
          <Plus className="size-4" />,
          `Crear · ${label}`,
          `Crear en · ${label}`,
          create
        )}
      {manage.length > 0 &&
        renderMenu(
          <Pencil className="size-4" />,
          `Editar o eliminar · ${label}`,
          `Opciones · ${label}`,
          manage
        )}
      {more.length > 0 &&
        renderMenu(
          <MoreHorizontal className="size-4" />,
          `Opciones de ${label}`,
          `Opciones · ${label}`,
          more
        )}
    </>
  );
}

export function ListRow({ list, shared }: { list: TaskList; shared: SharedProps }) {
  const isSelected = list.id === shared.selectedListId;
  const kind: ReorderKind = {
    type: 'list',
    id: list.id,
    containerKey: `list:${list.workspace_id}:${list.folder_id ?? ''}`,
  };
  const isDragging = shared.reorderEntity?.type === 'list' && shared.reorderEntity.id === list.id;
  const isReorderTarget = shared.reorderTarget?.type === 'list' && shared.reorderTarget.id === list.id;
  return (
    <div
      className={cn('group relative flex items-center transition-[opacity,transform,box-shadow,background-color] duration-150 ease-out', isDragging && DRAG_PLACEHOLDER)}
      {...shared.dropAttrs(kind)}
    >
      <div className={cn('ml-4 flex min-w-0 flex-1 items-center rounded-md', isReorderTarget && DROP_TARGET)}>
        {shared.canWriteEntity('list', list.id) && (
          <GripButton onPointerDown={(e) => shared.onGripPointerDown(e, kind)} />
        )}
        <button
          onClick={() => shared.onSelectList(list.id)}
          className={cn(
            'relative flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
            isSelected
              ? 'font-semibold text-sidebar-foreground before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
          )}
          title={list.name}
        >
          <ICONO_LISTA className={cn('size-3.5 shrink-0', isSelected ? 'text-sidebar-foreground' : 'text-muted-foreground/70')} />
          <span className="flex-1 truncate">{list.name}</span>
          <VisibilityIcon visibility={list.visibility} />
          <span className={cn('text-xs tabular-nums', isSelected ? 'text-sidebar-foreground/80' : 'text-muted-foreground/70')}>
            {shared.counts[list.id] || 0}
          </span>
        </button>
      </div>
      {shared.canWriteEntity('list', list.id) && (
        <RowActions
          label={list.name}
          more={[
            {
              key: 'edit',
              icon: <Pencil className="size-4" />,
              label: 'Editar',
              description: 'Cambiar nombre o visibilidad',
              onClick: () => shared.onOpenEdit('list', list),
            },
            {
              key: 'clone',
              icon: <Copy className="size-4" />,
              label: 'Clonar',
              description: 'Crear una copia con sus tareas',
              onClick: () => shared.onOpenCloneDialog('list', list),
            },
            {
              key: 'move',
              icon: <Move className="size-4" />,
              label: 'Mover',
              description: 'Cambiar a otra área de trabajo o carpeta',
              onClick: () => shared.onOpenMoveDialog('list', list),
            },
            ...(shared.canManageEntity('list', list.id)
              ? [{
                  key: 'delete',
                  icon: <Trash2 className="size-4" />,
                  label: 'Eliminar',
                  description: 'Eliminar la lista con todas sus tareas',
                  onClick: () => shared.onConfirmDelete('list', list.id, list.name),
                  destructive: true,
                } as RowActionItem]
              : []),
          ]}
        />
      )}
    </div>
  );
}

export function DocRow({ doc, shared }: { doc: TaskDocument; shared: SharedProps }) {
  const kind: ReorderKind = {
    type: 'document',
    id: doc.id,
    containerKey: `doc:${doc.workspace_id}:${doc.folder_id ?? ''}`,
  };
  const isActive = doc.id === shared.activeDocId;
  const isDragging = shared.reorderEntity?.type === 'document' && shared.reorderEntity.id === doc.id;
  const isReorderTarget = shared.reorderTarget?.type === 'document' && shared.reorderTarget.id === doc.id;
  return (
    <div
      className={cn('group relative flex items-center transition-[opacity,transform,box-shadow,background-color] duration-150 ease-out', isDragging && DRAG_PLACEHOLDER)}
      {...shared.dropAttrs(kind)}
    >
      <div className={cn('ml-4 flex min-w-0 flex-1 items-center rounded-md', isReorderTarget && DROP_TARGET)}>
        {shared.canWriteEntity('document', doc.id) && (
          <GripButton onPointerDown={(e) => shared.onGripPointerDown(e, kind)} />
        )}
        <button
          onClick={() => shared.onOpenDocument(doc.id)}
          className={cn(
            'relative flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
            isActive
              ? 'font-semibold text-sidebar-foreground before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
          )}
          title={doc.name}
        >
          <ICONO_DOCUMENTO className={cn('size-3.5 shrink-0', ENTIDADES_META.document.color)} />
          <span className="flex-1 truncate">{doc.name}</span>
          <VisibilityIcon visibility={doc.visibility} />
        </button>
      </div>
      {shared.canWriteEntity('document', doc.id) && (
        <RowActions
          label={doc.name}
          more={[
            {
              key: 'edit',
              icon: <Pencil className="size-4" />,
              label: 'Editar',
              description: 'Cambiar nombre o visibilidad',
              onClick: () => shared.onOpenEdit('document', doc),
            },
            {
              key: 'clone',
              icon: <Copy className="size-4" />,
              label: 'Clonar',
              description: 'Crear una copia con sus páginas',
              onClick: () => shared.onOpenCloneDialog('document', doc),
            },
            {
              key: 'move',
              icon: <Move className="size-4" />,
              label: 'Mover',
              description: 'Cambiar a otra área de trabajo o carpeta',
              onClick: () => shared.onOpenMoveDialog('document', doc),
            },
            ...(shared.canManageEntity('document', doc.id)
              ? [{
                  key: 'delete',
                  icon: <Trash2 className="size-4" />,
                  label: 'Eliminar',
                  description: 'Eliminar el documento con todas sus páginas',
                  onClick: () => shared.onConfirmDelete('document', doc.id, doc.name),
                  destructive: true,
                } as RowActionItem]
              : []),
          ]}
        />
      )}
    </div>
  );
}

export function MindMapRow({ map, shared }: { map: MindMap; shared: SharedProps }) {
  const kind: ReorderKind = {
    type: 'mindmap',
    id: map.id,
    containerKey: `map:${map.workspace_id}:${map.folder_id ?? ''}`,
  };
  const isActive = map.id === shared.activeMapId;
  const isDragging = shared.reorderEntity?.type === 'mindmap' && shared.reorderEntity.id === map.id;
  const isReorderTarget = shared.reorderTarget?.type === 'mindmap' && shared.reorderTarget.id === map.id;
  return (
    <div
      className={cn('group relative flex items-center transition-[opacity,transform,box-shadow,background-color] duration-150 ease-out', isDragging && DRAG_PLACEHOLDER)}
      {...shared.dropAttrs(kind)}
    >
      <div className={cn('ml-4 flex min-w-0 flex-1 items-center rounded-md', isReorderTarget && DROP_TARGET)}>
        {shared.canWriteEntity('mindmap', map.id) && (
          <GripButton onPointerDown={(e) => shared.onGripPointerDown(e, kind)} />
        )}
        <button
          onClick={() => shared.onOpenMindMap(map.id)}
          className={cn(
            'relative flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
            isActive
              ? 'font-semibold text-sidebar-foreground before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
          )}
          title={map.name}
        >
          <ICONO_MAPA className={cn('size-3.5 shrink-0', ENTIDADES_META.mindmap.color)} />
          <span className="flex-1 truncate">{map.name}</span>
          <VisibilityIcon visibility={map.visibility} />
        </button>
      </div>
      {shared.canWriteEntity('mindmap', map.id) && (
        <RowActions
          label={map.name}
          more={[
            {
              key: 'edit',
              icon: <Pencil className="size-4" />,
              label: 'Editar',
              description: 'Cambiar nombre o visibilidad',
              onClick: () => shared.onOpenEdit('mindmap', map),
            },
            {
              key: 'clone',
              icon: <Copy className="size-4" />,
              label: 'Clonar',
              description: 'Crear una copia con sus nodos y conexiones',
              onClick: () => shared.onOpenCloneDialog('mindmap', map),
            },
            {
              key: 'move',
              icon: <Move className="size-4" />,
              label: 'Mover',
              description: 'Cambiar a otra área de trabajo o carpeta',
              onClick: () => shared.onOpenMoveDialog('mindmap', map),
            },
            ...(shared.canManageEntity('mindmap', map.id)
              ? [{
                  key: 'delete',
                  icon: <Trash2 className="size-4" />,
                  label: 'Eliminar',
                  description: 'Eliminar el mapa mental con su contenido',
                  onClick: () => shared.onConfirmDelete('mindmap', map.id, map.name),
                  destructive: true,
                } as RowActionItem]
              : []),
          ]}
        />
      )}
    </div>
  );
}

export function FormularioRow({ formulario, shared }: { formulario: Formulario; shared: SharedProps }) {
  const kind: ReorderKind = {
    type: 'formulario',
    id: formulario.id,
    containerKey: `formulario:${formulario.workspace_id}:${formulario.folder_id ?? ''}`,
  };
  const isActive = formulario.id === shared.activeFormularioId;
  const isDragging = shared.reorderEntity?.type === 'formulario' && shared.reorderEntity.id === formulario.id;
  const isReorderTarget = shared.reorderTarget?.type === 'formulario' && shared.reorderTarget.id === formulario.id;
  return (
    <div
      className={cn('group relative flex items-center transition-[opacity,transform,box-shadow,background-color] duration-150 ease-out', isDragging && DRAG_PLACEHOLDER)}
      {...shared.dropAttrs(kind)}
    >
      <div className={cn('ml-4 flex min-w-0 flex-1 items-center rounded-md', isReorderTarget && DROP_TARGET)}>
        {shared.canWriteEntity('formulario', formulario.id) && (
          <GripButton onPointerDown={(e) => shared.onGripPointerDown(e, kind)} />
        )}
        <button
          onClick={() => shared.onOpenFormulario(formulario.id)}
          className={cn(
            'relative flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
            isActive
              ? 'font-semibold text-sidebar-foreground before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
          )}
          title={formulario.name}
        >
          <ICONO_FORMULARIO className={cn('size-3.5 shrink-0', ENTIDADES_META.formulario.color)} />
          <span className="flex-1 truncate">{formulario.name}</span>
          {formulario.estado === 'publicado' && (
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" title="Publicado" />
          )}
          <VisibilityIcon visibility={formulario.visibility} />
          <span className="text-xs text-muted-foreground/70 tabular-nums">
            {shared.counts[formulario.id] || 0}
          </span>
        </button>
      </div>
      {shared.canWriteEntity('formulario', formulario.id) && (
        <RowActions
          label={formulario.name}
          more={[
            {
              key: 'edit',
              icon: <Pencil className="size-4" />,
              label: 'Editar',
              description: 'Cambiar nombre o visibilidad',
              onClick: () => shared.onOpenEdit('formulario', formulario),
            },
            {
              key: 'clone',
              icon: <Copy className="size-4" />,
              label: 'Clonar',
              description: 'Crear una copia con sus preguntas (sin respuestas)',
              onClick: () => shared.onOpenCloneDialog('formulario', formulario),
            },
            {
              key: 'move',
              icon: <Move className="size-4" />,
              label: 'Mover',
              description: 'Cambiar a otra área de trabajo o carpeta',
              onClick: () => shared.onOpenMoveDialog('formulario', formulario),
            },
            ...(shared.canManageEntity('formulario', formulario.id)
              ? [{
                  key: 'delete',
                  icon: <Trash2 className="size-4" />,
                  label: 'Eliminar',
                  description: 'Eliminar el formulario con sus respuestas',
                  onClick: () => shared.onConfirmDelete('formulario', formulario.id, formulario.name),
                  destructive: true,
                } as RowActionItem]
              : []),
          ]}
        />
      )}
    </div>
  );
}

export function TodoRow({ todo, shared }: { todo: Todo; shared: SharedProps }) {
  const kind: ReorderKind = {
    type: 'todo',
    id: todo.id,
    containerKey: `todo:${todo.workspace_id}:${todo.folder_id ?? ''}`,
  };
  const isActive = todo.id === shared.activeTodoId;
  const isDragging = shared.reorderEntity?.type === 'todo' && shared.reorderEntity.id === todo.id;
  const isReorderTarget = shared.reorderTarget?.type === 'todo' && shared.reorderTarget.id === todo.id;
  return (
    <div
      className={cn('group relative flex items-center transition-[opacity,transform,box-shadow,background-color] duration-150 ease-out', isDragging && DRAG_PLACEHOLDER)}
      {...shared.dropAttrs(kind)}
    >
      <div className={cn('ml-4 flex min-w-0 flex-1 items-center rounded-md', isReorderTarget && DROP_TARGET)}>
        {shared.canWriteEntity('todo', todo.id) && (
          <GripButton onPointerDown={(e) => shared.onGripPointerDown(e, kind)} />
        )}
        <button
          onClick={() => shared.onOpenTodo(todo.id)}
          className={cn(
            'relative flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
            isActive
              ? 'font-semibold text-sidebar-foreground before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
          )}
          title={todo.name}
        >
          <ICONO_TODO className={cn('size-3.5 shrink-0', ENTIDADES_META.todo.color)} />
          <span className="flex-1 truncate">{todo.name}</span>
          <VisibilityIcon visibility={todo.visibility} />
          <span className="text-xs text-muted-foreground/70 tabular-nums">
            {shared.counts[todo.id] || 0}
          </span>
        </button>
      </div>
      {shared.canWriteEntity('todo', todo.id) && (
        <RowActions
          label={todo.name}
          more={[
            {
              key: 'edit',
              icon: <Pencil className="size-4" />,
              label: 'Editar',
              description: 'Cambiar nombre o visibilidad',
              onClick: () => shared.onOpenEdit('todo', todo),
            },
            {
              key: 'clone',
              icon: <Copy className="size-4" />,
              label: 'Clonar',
              description: 'Crear una copia con sus items',
              onClick: () => shared.onOpenCloneDialog('todo', todo),
            },
            {
              key: 'move',
              icon: <Move className="size-4" />,
              label: 'Mover',
              description: 'Cambiar a otra área de trabajo o carpeta',
              onClick: () => shared.onOpenMoveDialog('todo', todo),
            },
            ...(shared.canManageEntity('todo', todo.id)
              ? [{
                  key: 'delete',
                  icon: <Trash2 className="size-4" />,
                  label: 'Eliminar',
                  description: 'Eliminar el TO-DO con todos sus items',
                  onClick: () => shared.onConfirmDelete('todo', todo.id, todo.name),
                  destructive: true,
                } as RowActionItem]
              : []),
          ]}
        />
      )}
    </div>
  );
}
