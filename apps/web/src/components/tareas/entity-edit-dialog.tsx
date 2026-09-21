'use client';

import { useState } from 'react';
import { useTareas } from './tareas-context';
import { VisibilityFields } from './workspace-nav';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Profile } from '@/types';
import type { EditState, UpdateInput } from './workspace-nav';

const EDIT_TITLES: Record<EditState['type'], string> = {
  workspace: 'Editar espacio de trabajo',
  folder: 'Editar carpeta de trabajo',
  list: 'Editar lista',
  document: 'Editar documento',
  mindmap: 'Editar mapa mental',
  todo: 'Editar TO-DO',
  formulario: 'Editar formulario',
};

function EditDialogInner({
  target,
  onClose,
  onUpdate,
  collaborators,
  canEditVisibility,
}: {
  target: EditState;
  onClose: () => void;
  onUpdate: (input: UpdateInput) => Promise<{ error?: string } | undefined>;
  collaborators: Profile[];
  canEditVisibility: boolean;
}) {
  const [draft, setDraft] = useState<EditState>(target);
  const [guardando, setGuardando] = useState(false);

  const submit = async () => {
    if (!draft.name.trim() || guardando) return;
    setGuardando(true);
    try {
      const result = await onUpdate({
        type: draft.type,
        id: draft.id,
        name: draft.name,
        visibility: draft.visibility,
        memberIds: draft.memberIds,
        memberGrants: Object.entries(draft.memberGrants).map(([profileId, grant]) => ({
          profileId,
          permission: grant.permission,
          inherit: grant.inherit,
        })),
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !guardando) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            {EDIT_TITLES[draft.type]}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nombre</Label>
            <Input
              id="edit-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              autoFocus
            />
          </div>

          {canEditVisibility && (
          <VisibilityFields
            entityType={draft.type}
            visibility={draft.visibility}
            onVisibilityChange={(v) => setDraft({ ...draft, visibility: v })}
            collaborators={collaborators.filter((c) => !c.is_owner)}
            memberIds={draft.memberIds}
            memberGrants={draft.memberGrants}
            onToggleMember={(profileId) => {
              const included = draft.memberIds.includes(profileId);
              const nextIds = included
                ? draft.memberIds.filter((m) => m !== profileId)
                : [...draft.memberIds, profileId];
              const nextGrants = { ...draft.memberGrants };
              if (included) delete nextGrants[profileId];
              else nextGrants[profileId] = { permission: 'read', inherit: false };
              setDraft({ ...draft, memberIds: nextIds, memberGrants: nextGrants });
            }}
            onGrantChange={(profileId, patch) => {
              const grant =
                draft.memberGrants[profileId] ?? { permission: 'read', inherit: false };
              setDraft({
                ...draft,
                memberGrants: { ...draft.memberGrants, [profileId]: { ...grant, ...patch } },
              });
            }}
          />
        )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!draft.name.trim() || guardando}>
            {guardando ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EntityEditDialog() {
  const ctx = useTareas();
  const target = ctx.editTarget;
  if (!target) return null;

  return (
    <EditDialogInner
      key={target.id}
      target={target}
      onClose={ctx.closeEdit}
      onUpdate={ctx.onUpdate}
      collaborators={ctx.collaborators}
      canEditVisibility={ctx.isAdmin}
    />
  );
}