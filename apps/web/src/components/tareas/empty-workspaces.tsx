'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { LayoutGrid, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VisibilityFields } from './workspace-nav';
import type { Profile, Visibility, EntityPermission } from '@/types';

export interface EmptyWorkspaceCreateInput {
  name: string;
  visibility: Visibility;
  memberIds: string[];
  memberGrants: Record<string, { permission: EntityPermission; inherit: boolean }>;
}

export function EmptyWorkspaces({
  canManage,
  collaborators,
  onCreate,
}: {
  canManage: boolean;
  collaborators: Profile[];
  onCreate: (
    input: EmptyWorkspaceCreateInput
  ) => Promise<{ error?: string } | undefined> | { error?: string } | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [creando, setCreando] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberGrants, setMemberGrants] = useState<Record<string, { permission: EntityPermission; inherit: boolean }>>({});

  const reset = () => {
    setName('');
    setVisibility('public');
    setMemberIds([]);
    setMemberGrants({});
  };

  const submit = async () => {
    if (!name.trim() || creando) return;
    setCreando(true);
    try {
      const result = await onCreate({
        name: name.trim(),
        visibility,
        memberIds,
        memberGrants,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      reset();
    } finally {
      setCreando(false);
    }
  };

  const toggleMember = (profileId: string) => {
    const included = memberIds.includes(profileId);
    const nextIds = included
      ? memberIds.filter((m) => m !== profileId)
      : [...memberIds, profileId];
    const nextGrants = { ...memberGrants };
    if (included) delete nextGrants[profileId];
    else nextGrants[profileId] = { permission: 'read', inherit: true };
    setMemberIds(nextIds);
    setMemberGrants(nextGrants);
  };

  const setGrant = (profileId: string, patch: Partial<{ permission: EntityPermission; inherit: boolean }>) => {
    const grant = memberGrants[profileId] ?? { permission: 'read', inherit: true };
    setMemberGrants({ ...memberGrants, [profileId]: { ...grant, ...patch } });
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 px-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-xl border bg-muted/40">
          <LayoutGrid className="size-7 text-blue-500" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">
            {canManage ? 'Crea tu primer área de trabajo' : 'Sin áreas de trabajo'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? 'Primero debes crear un área de trabajo. Dentro de ella podrás crear carpetas, listas y documentos.'
              : 'Aún no tienes áreas de trabajo disponibles. Solicita acceso al administrador.'}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setOpen(true)}>
            <LayoutGrid className="size-4" />
            Crear área de trabajo
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!o && creando) return; setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="size-4" />
              Nuevo área de trabajo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="empty-ws-name">Nombre</Label>
              <Input
                id="empty-ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del área de trabajo"
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                autoFocus
              />
            </div>
            <VisibilityFields
              visibility={visibility}
              onVisibilityChange={setVisibility}
              collaborators={collaborators}
              memberIds={memberIds}
              memberGrants={memberGrants}
              onToggleMember={toggleMember}
              onGrantChange={setGrant}
            />
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={!name.trim() || creando}>
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
    </div>
  );
}