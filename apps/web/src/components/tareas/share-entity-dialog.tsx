'use client';

import { useState } from 'react';
import { useTareas, type ShareTarget, type ShareGrant } from './tareas-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Share2, Link2, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { createInvitation } from '@/lib/auth/actions';
import { cn } from '@/lib/utils';
import { AccionEntidad } from '@/components/entidad/accion-entidad';
import type { EntityPermission, EntityType } from '@/types';

const INHERIT_TYPES: ReadonlySet<EntityType> = new Set(['workspace', 'folder', 'list']);

const PERMISSION_OPTIONS: { value: EntityPermission; label: string }[] = [
  { value: 'read', label: 'Solo lectura' },
  { value: 'write', label: 'Lectura y escritura' },
  { value: 'manage', label: 'Gestión completa' },
];

/** Botón estándar de Compartir (mismo estilo y posición en todas las vistas). */
export function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <AccionEntidad
      icono={Share2}
      onClick={onClick}
      title="Compartir: generar link o asignar personal"
    >
      Compartir
    </AccionEntidad>
  );
}

function ShareDialogInner({ target, ctx }: { target: ShareTarget; ctx: ReturnType<typeof useTareas> }) {
  const key = `${target.type}:${target.id}`;
  const initialMembers = (() => {
    const m: Record<string, { permission: EntityPermission; inherit: boolean }> = {};
    (ctx.members[key] || []).forEach((profileId) => {
      const g = ctx.grants.find(
        (x) =>
          x.entity_type === target.type &&
          x.entity_id === target.id &&
          x.profile_id === profileId
      );
      m[profileId] = {
        permission: g?.permission ?? 'read',
        inherit: g?.inherit ?? (INHERIT_TYPES.has(target.type) ? true : false),
      };
    });
    return m;
  })();

  const [members, setMembers] = useState(initialMembers);
  const [permission, setPermission] = useState<EntityPermission>('read');
  const [linkBusy, setLinkBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleMember = (profileId: string) => {
    setMembers((prev) => {
      const next = { ...prev };
      if (profileId in next) delete next[profileId];
      else next[profileId] = { permission: 'read', inherit: INHERIT_TYPES.has(target.type) };
      return next;
    });
  };

  const setGrant = (profileId: string, patch: Partial<{ permission: EntityPermission; inherit: boolean }>) => {
    setMembers((prev) => ({
      ...prev,
      [profileId]: { ...prev[profileId], ...patch },
    }));
  };

  const generateLink = async () => {
    setLinkBusy(true);
    try {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const res = await createInvitation({
        role: 'collaborator',
        expiresAt,
        entityType: target.type,
        entityId: target.id,
        permission,
        inherit: INHERIT_TYPES.has(target.type) ? true : false,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      const link = res.link || `${window.location.origin}/invite/${res.token}`;
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado — el invitado verá solo lo compartido');
    } catch {
      toast.error('No se pudo generar la invitación');
    } finally {
      setLinkBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const grants: ShareGrant[] = Object.entries(members).map(([profileId, g]) => ({
      profileId,
      permission: g.permission,
      inherit: g.inherit,
    }));
    const removedIds = Object.keys(initialMembers).filter((pid) => !(pid in members));
    const res = await ctx.saveShareGrants({
      type: target.type,
      id: target.id,
      grants,
      removedIds,
    });
    if (res?.error) {
      toast.error(res.error);
      setSaving(false);
      return;
    }
    toast.success('Accesos actualizados');
    ctx.closeShare();
  };

  const collaborators = ctx.collaborators.filter((c) => !c.is_owner);

  return (
    <Dialog open onOpenChange={(open) => !open && ctx.closeShare()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" />
            Compartir &quot;{target.name}&quot;
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Link de invitación */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Link2 className="size-3.5" />
              Link de invitación (expira en 24 h)
            </Label>
            <div className="flex items-center gap-2">
              <Select value={permission} onValueChange={(v) => setPermission(v as EntityPermission)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERMISSION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={generateLink} disabled={linkBusy} className="flex-1">
                {linkBusy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                Generar y copiar link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              El invitado verá solo lo compartido (acceso aislado).
            </p>
          </div>

          <div className="h-px bg-border" />

          {/* Personal existente */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <UserPlus className="size-3.5" />
              Personal con acceso
            </Label>
            <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-2">
              {collaborators.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">Sin colaboradores disponibles</p>
              ) : (
                collaborators.map((c) => {
                  const grant = members[c.id];
                  const checked = !!grant;
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'rounded-md border p-2 transition-colors',
                        checked ? 'border-primary/30 bg-primary/5' : 'opacity-60'
                      )}
                    >
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleMember(c.id)}
                          className="size-4"
                        />
                        <span className="flex-1 truncate">{c.full_name}</span>
                        {c.role === 'admin' && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                            Admin
                          </span>
                        )}
                      </label>
                      {checked && (
                        <div className="mt-2 flex items-center gap-2 pl-6">
                          <Select
                            value={grant.permission}
                            onValueChange={(v) =>
                              setGrant(c.id, { permission: v as EntityPermission })
                            }
                          >
                            <SelectTrigger className="h-7 w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PERMISSION_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {INHERIT_TYPES.has(target.type) && (
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                              <Checkbox
                                checked={grant.inherit}
                                onCheckedChange={(val) => setGrant(c.id, { inherit: val === true })}
                                className="size-3.5"
                              />
                              Heredar al contenido interno
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {!INHERIT_TYPES.has(target.type) ? (
              <p className="text-xs text-muted-foreground">
                El acceso asignado es aislado: el colaborador verá solo este archivo.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                El heredar alcanza el contenido interno salvo lo privado y nunca permite eliminar.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Guardar accesos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShareEntityDialog() {
  const ctx = useTareas();
  const target = ctx.shareTarget;
  if (!target) return null;
  return <ShareDialogInner key={target.id} target={target} ctx={ctx} />;
}