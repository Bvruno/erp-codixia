'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ListTodo, Plus, UserPlus, X } from 'lucide-react';
import {
  EntityScopePicker,
  type ScopeSelection,
} from '@/components/colaboradores/entity-scope-picker';
import { PermissionPicker } from '@/components/colaboradores/permission-picker';
import type { AccessTree } from '@/lib/access';
import type { EntityPermission, EntityType, Profile } from '@/types';

export type GrantDraft = {
  entity_type: EntityType;
  entity_id: string;
  permission: EntityPermission;
  inherit: boolean;
};

const PERMISSION_LABELS: Record<EntityPermission, string> = {
  read: 'Solo lectura',
  write: 'Lectura y escritura',
  manage: 'Gestión completa',
};

const SCOPE_LABELS: Record<EntityType, string> = {
  workspace: 'Área',
  folder: 'Carpeta',
  list: 'Lista',
  document: 'Documento',
  mindmap: 'Mapa mental',
  todo: 'TO-DO',
  formulario: 'Formulario',
};

function entityName(tree: AccessTree, type: EntityType, id: string): string {
  if (type === 'workspace') return tree.workspaces.find((w) => w.id === id)?.name || 'Área';
  if (type === 'folder') return tree.folders.find((f) => f.id === id)?.name || 'Carpeta';
  if (type === 'list') return tree.lists.find((l) => l.id === id)?.name || 'Lista';
  if (type === 'mindmap') return tree.mindmaps.find((m) => m.id === id)?.name || 'Mapa';
  if (type === 'todo') return tree.todos.find((t) => t.id === id)?.name || 'TO-DO';
  if (type === 'formulario') return tree.formularios.find((f) => f.id === id)?.name || 'Formulario';
  return tree.documents.find((d) => d.id === id)?.name || 'Documento';
}

export function AssignAccessDialog({
  open,
  onOpenChange,
  assignee,
  listId,
  tree,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignee: Profile;
  listId: string | null;
  tree: AccessTree;
  onConfirm: (grants: GrantDraft[]) => void;
}) {
  const [mainPermission, setMainPermission] = useState<EntityPermission>('read');
  const [mainInherit, setMainInherit] = useState(true);
  const [addType, setAddType] = useState<EntityType>('workspace');
  const [addSelection, setAddSelection] = useState<ScopeSelection>(null);
  const [addPermission, setAddPermission] = useState<EntityPermission>('read');
  const [addInherit, setAddInherit] = useState(true);
  const [extras, setExtras] = useState<GrantDraft[]>([]);

  const listName = listId ? entityName(tree, 'list', listId) : null;

  const addExtra = () => {
    if (!addSelection) return;
    setExtras((prev) => [
      ...prev,
      {
        entity_type: addSelection.type,
        entity_id: addSelection.id,
        permission: addPermission,
        inherit: addInherit,
      },
    ]);
    setAddSelection(null);
  };

  const handleConfirm = () => {
    const grants: GrantDraft[] = [];
    if (listId) {
      grants.push({
        entity_type: 'list',
        entity_id: listId,
        permission: mainPermission,
        inherit: mainInherit,
      });
    }
    grants.push(...extras);
    onConfirm(grants);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            Confirmar accesos para {assignee.full_name}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-muted-foreground text-xs">
            Al asignar esta tarea, la persona obtiene acceso a la lista donde vive.
          </p>

          {listId && (
            <div className="space-y-2 rounded-md border p-3">
              <Label className="flex items-center gap-2">
                <ListTodo className="size-3.5 text-muted-foreground" />
                Acceso a la lista de la tarea
              </Label>
              <p className="text-sm font-medium">{listName || 'Lista de la tarea'}</p>
              <PermissionPicker
                value={mainPermission}
                onChange={setMainPermission}
                inherit={mainInherit}
                onInheritChange={setMainInherit}
              />
            </div>
          )}

          <div className="space-y-2 border-t pt-3">
            <Label>Accesos adicionales</Label>
            {extras.length > 0 && (
              <div className="space-y-1.5">
                {extras.map((g, i) => (
                  <div
                    key={`${g.entity_type}:${g.entity_id}`}
                    className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                  >
                    <Badge variant="outline" className="text-xs">
                      {SCOPE_LABELS[g.entity_type]}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate">
                      {entityName(tree, g.entity_type, g.entity_id)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {PERMISSION_LABELS[g.permission]}
                    </Badge>
                    {!g.inherit && (
                      <span className="text-muted-foreground text-xs">sin heredar</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setExtras((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      title="Quitar acceso"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <EntityScopePicker
              tree={tree}
              type={addType}
              onTypeChange={setAddType}
              value={addSelection}
              onChange={setAddSelection}
            />
            <PermissionPicker
              value={addPermission}
              onChange={setAddPermission}
              inherit={addInherit}
              onInheritChange={setAddInherit}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={addExtra}
              disabled={!addSelection}
            >
              <Plus className="size-4" />
              Agregar acceso
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Confirmar y asignar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useAssignAccess(tree: AccessTree) {
  const [state, setState] = useState<{
    assignee: Profile;
    listId: string | null;
    resetKey: number;
  } | null>(null);
  const onAcceptedRef = useRef<((grants: GrantDraft[]) => void) | null>(null);

  const openAssignAccess = (
    assignee: Profile,
    listId: string | null,
    onAccepted: (grants: GrantDraft[]) => void
  ) => {
    onAcceptedRef.current = onAccepted;
    setState((prev) => ({ assignee, listId, resetKey: (prev?.resetKey ?? 0) + 1 }));
  };

  const dialog = state ? (
    <AssignAccessDialog
      key={state.resetKey}
      open
      onOpenChange={(open) => {
        if (!open) {
          setState(null);
          onAcceptedRef.current = null;
        }
      }}
      assignee={state.assignee}
      listId={state.listId}
      tree={tree}
      onConfirm={(grants) => {
        const cb = onAcceptedRef.current;
        onAcceptedRef.current = null;
        setState(null);
        cb?.(grants);
      }}
    />
  ) : null;

  return { openAssignAccess, dialog };
}
