'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { effectiveAccessEntries } from '@/lib/access';
import type { EntityPermission } from '@/types';
import { EntityScopePicker } from '@/components/colaboradores/entity-scope-picker';
import { PermissionPicker } from '@/components/colaboradores/permission-picker';
import { entityName, grantPath, PERMISSION_LABELS, SCOPE_LABELS, type ArbolColaboradores } from './presentacion';
import type { GrantsColaboradores } from './use-grants';

// Diálogo de accesos específicos de un colaborador.

export function DialogoAccesos({
  tree,
  grants,
}: {
  tree: ArbolColaboradores;
  grants: GrantsColaboradores;
}) {
  const {
    accessMember,
    setAccessMember,
    accessGrants,
    accessLoading,
    agregandoAcceso,
    accessAdd,
    setAccessAdd,
    saveGrant,
    removeGrant,
    addGrant,
  } = grants;

  const effectiveEntries = accessMember
    ? effectiveAccessEntries(accessGrants, tree)
    : [];

  return (
    <Dialog open={!!accessMember} onOpenChange={(open) => { if (!open && agregandoAcceso) return; if (!open) setAccessMember(null); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Accesos de {accessMember?.full_name}
            <Badge variant="outline" className="text-xs">
              {accessGrants.length} específico(s)
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>Accesos específicos</Label>
            {accessLoading ? (
              <p className="text-muted-foreground text-xs">Cargando...</p>
            ) : accessGrants.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Sin accesos específicos. Solo ve lo público de la organización.
              </p>
            ) : (
              <div className="space-y-2">
                {accessGrants.map((g) => (
                  <div key={`${g.entity_type}:${g.entity_id}`} className="rounded-md border p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {SCOPE_LABELS[g.entity_type]}: {entityName(tree, g.entity_type, g.entity_id)}
                        </p>
                        <p className="text-muted-foreground text-xs truncate">
                          {grantPath(tree, g.entity_type, g.entity_id)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          title="Quitar acceso"
                          onClick={() => removeGrant(accessMember!.id, g.entity_type, g.entity_id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={g.permission}
                        onValueChange={(v) =>
                          saveGrant(accessMember!.id, g.entity_type, g.entity_id, v as EntityPermission, g.inherit)
                        }
                      >
                        <SelectTrigger className="h-7 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">Solo lectura</SelectItem>
                          <SelectItem value="write">Lectura y escritura</SelectItem>
                          <SelectItem value="manage">Gestión completa</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={g.inherit}
                          onCheckedChange={(v) =>
                            saveGrant(accessMember!.id, g.entity_type, g.entity_id, g.permission, v === true)
                          }
                          className="size-3.5"
                        />
                        Heredar
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label>Acceso efectivo (incluye herencia)</Label>
            {accessLoading ? (
              <p className="text-muted-foreground text-xs">Cargando...</p>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-1.5">
                {effectiveEntries.filter((e) => !e.explicit).length === 0 ? (
                  <p className="px-2 py-2 text-center text-xs text-muted-foreground">
                    Sin accesos por herencia
                  </p>
                ) : (
                  effectiveEntries
                    .filter((e) => !e.explicit)
                    .map((e) => (
                      <div
                        key={`${e.type}:${e.id}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
                      >
                        <Badge variant="outline" className="text-xs shrink-0">
                          {PERMISSION_LABELS[e.level]}
                        </Badge>
                        <span className="truncate">{e.path}</span>
                        <span className="text-muted-foreground shrink-0 text-xs ml-auto">
                          heredado de {e.source.name}
                        </span>
                      </div>
                    ))
                )}
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Además de lo público de la organización.
            </p>
          </div>

          <div className="space-y-3 border-t pt-3">
            <Label>Agregar acceso</Label>
            <EntityScopePicker
              tree={tree}
              type={accessAdd.type}
              onTypeChange={(t) => setAccessAdd((prev) => ({ ...prev, type: t, selection: null }))}
              value={accessAdd.selection}
              onChange={(sel) => setAccessAdd((prev) => ({ ...prev, selection: sel }))}
            />
            <PermissionPicker
              value={accessAdd.permission}
              onChange={(p) => setAccessAdd((prev) => ({ ...prev, permission: p }))}
              inherit={accessAdd.inherit}
              onInheritChange={(inh) => setAccessAdd((prev) => ({ ...prev, inherit: inh }))}
            />
            <Button size="sm" className="w-full" onClick={addGrant} disabled={!accessAdd.selection || agregandoAcceso}>
              {agregandoAcceso ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Agregando…
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Agregar acceso
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
