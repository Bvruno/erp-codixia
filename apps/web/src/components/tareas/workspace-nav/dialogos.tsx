'use client';

import { Move, Copy, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { MIND_MAP_TEMPLATES } from '@/lib/mindmap-templates';
import type { Workspace, Profile } from '@/types';
import type { DeleteTarget, DialogState, EntityType, MoveTarget, CloneTarget } from './tipos';
import { VisibilityFields } from './visibilidad';

// Diálogos del árbol: crear entidad, mover entidad, clonar y confirmar
// eliminación.

const MOVE_LABELS: Record<'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario', string> = {
  folder: 'carpeta',
  list: 'lista',
  document: 'documento',
  mindmap: 'mapa mental',
  todo: 'TO-DO',
  formulario: 'formulario',
};

export function DialogosNav({
  dialog,
  setDialog,
  name,
  setName,
  templateId,
  setTemplateId,
  creando,
  submitCreate,
  toggleCreateMember,
  setCreateGrant,
  collaborators,
  dialogMeta,
  moveTarget,
  setMoveTarget,
  wsSorted,
  moveWs,
  setMoveWs,
  moveParent,
  setMoveParent,
  folderOptions,
  confirmMove,
  deleteTarget,
  setDeleteTarget,
  onDelete,
  cloneTarget,
  setCloneTarget,
  cloneName,
  setCloneName,
  clonando,
  confirmClone,
}: {
  dialog: DialogState | null;
  setDialog: React.Dispatch<React.SetStateAction<DialogState | null>>;
  name: string;
  setName: (v: string) => void;
  templateId: string;
  setTemplateId: (v: string) => void;
  creando: boolean;
  submitCreate: () => void;
  toggleCreateMember: (profileId: string) => void;
  setCreateGrant: (profileId: string, patch: Partial<{ permission: 'read' | 'write' | 'manage'; inherit: boolean }>) => void;
  collaborators: Profile[];
  dialogMeta: Record<DialogState['type'], { title: string; icon: React.ReactNode; placeholder: string }>;
  moveTarget: MoveTarget | null;
  setMoveTarget: (t: MoveTarget | null) => void;
  wsSorted: Workspace[];
  moveWs: string;
  setMoveWs: (v: string) => void;
  moveParent: string;
  setMoveParent: (v: string) => void;
  folderOptions: (wsId: string) => { id: string; label: string }[];
  confirmMove: () => void;
  deleteTarget: DeleteTarget | null;
  setDeleteTarget: (t: DeleteTarget | null) => void;
  onDelete: (input: { type: EntityType; id: string }) => void;
  cloneTarget: CloneTarget | null;
  setCloneTarget: (t: CloneTarget | null) => void;
  cloneName: string;
  setCloneName: (v: string) => void;
  clonando: boolean;
  confirmClone: () => void;
}) {
  return (
    <>
      {/* Crear */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !creando) setDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialog && dialogMeta[dialog.type].icon}
              {dialog && dialogMeta[dialog.type].title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Nombre</Label>
              <Input
                id="create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={dialog ? dialogMeta[dialog.type].placeholder : ''}
                onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); }}
                autoFocus
              />
            </div>
            {dialog && dialog.type === 'mindmap' && (
              <div className="space-y-2">
                <Label>Plantilla</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {MIND_MAP_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        'rounded-md border p-2 text-left transition-colors',
                        templateId === t.id
                          ? 'border-primary/50 bg-primary/5'
                          : 'hover:bg-sidebar-accent/50'
                      )}
                    >
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {dialog && (
              <VisibilityFields
                entityType={dialog.type}
                visibility={dialog.visibility ?? 'public'}
                onVisibilityChange={(v) => setDialog({ ...dialog, visibility: v })}
                collaborators={collaborators.filter((c) => !c.is_owner)}
                memberIds={dialog.memberIds ?? []}
                memberGrants={dialog.memberGrants ?? {}}
                onToggleMember={toggleCreateMember}
                onGrantChange={setCreateGrant}
              />
            )}
          </div>
          <DialogFooter>
            <Button onClick={submitCreate} disabled={!name.trim() || creando}>
              {creando ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creando…
                </>
              ) : (
                'Crear'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mover */}
      <Dialog open={moveTarget !== null} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Move className="size-4" />
              Mover {moveTarget ? MOVE_LABELS[moveTarget.type] : ''} &quot;{moveTarget?.name}&quot;
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Espacio de trabajo destino</Label>
              <Select value={moveWs} onValueChange={(v) => { setMoveWs(v); setMoveParent(''); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {wsSorted.map((ws) => (<SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Carpeta destino (opcional)</Label>
              <Select value={moveParent} onValueChange={setMoveParent}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Raíz del espacio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Raíz del espacio</SelectItem>
                  {folderOptions(moveWs).map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sin carpeta se coloca en la raíz del espacio elegido; con carpeta, dentro de ella.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>Cancelar</Button>
            <Button onClick={confirmMove} disabled={!moveWs}>
              Mover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clonar */}
      <Dialog open={cloneTarget !== null} onOpenChange={(open) => { if (!open && !clonando) setCloneTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="size-4" />
              Clonar {cloneTarget ? MOVE_LABELS[cloneTarget.type] : ''} &quot;{cloneTarget?.name}&quot;
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clone-name">Nombre del clon</Label>
              <Input
                id="clone-name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmClone(); }}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Se copia el contenido del original en el mismo lugar, junto con su visibilidad y
              accesos. {cloneTarget?.type === 'formulario'
                ? 'El clon nace como borrador, sin respuestas ni invitados.'
                : ''}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneTarget(null)} disabled={clonando}>
              Cancelar
            </Button>
            <Button onClick={confirmClone} disabled={!cloneName.trim() || clonando}>
              {clonando ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Clonando…
                </>
              ) : (
                'Clonar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Eliminar ${deleteTarget ? deleteTarget.label : ''} "${deleteTarget?.name || ''}"`}
        description={deleteTarget?.description || ''}
        confirmLabel="Eliminar"
        requireText={deleteTarget?.name ?? ''}
        onConfirm={() => {
          if (deleteTarget) onDelete({ type: deleteTarget.type, id: deleteTarget.id });
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
