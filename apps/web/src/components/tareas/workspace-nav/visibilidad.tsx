'use client';

import { Globe, Lock, Users } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Profile, Visibility, EntityPermission } from '@/types';
import type { EntityType } from './tipos';

// Campos de visibilidad + asignación de personal (compartidos entre el
// diálogo de creación y el de edición de entidades).

const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'public', label: 'Público', description: 'Visible para toda la organización', icon: <Globe className="size-3.5" /> },
  { value: 'private', label: 'Privado', description: 'Visible solo para administradores', icon: <Lock className="size-3.5" /> },
  { value: 'restricted', label: 'Restringido', description: 'Visible solo para personal asignado', icon: <Users className="size-3.5" /> },
];

export function VisibilityIcon({ visibility }: { visibility: Visibility }) {
  if (visibility === 'public') return null;
  return visibility === 'private'
    ? <Lock className="size-3 shrink-0 text-muted-foreground/60" />
    : <Users className="size-3 shrink-0 text-muted-foreground/60" />;
}

type VisibilityFieldsProps = {
  entityType?: EntityType;
  visibility: Visibility;
  onVisibilityChange: (v: Visibility) => void;
  collaborators: Profile[];
  memberIds: string[];
  memberGrants: Record<string, { permission: EntityPermission; inherit: boolean }>;
  onToggleMember: (profileId: string) => void;
  onGrantChange: (profileId: string, patch: Partial<{ permission: EntityPermission; inherit: boolean }>) => void;
};

/** Entidades sin contenido interno: el grant nunca hereda. */
export const NO_INHERIT_TYPES: ReadonlySet<EntityType> = new Set(['document', 'mindmap', 'todo', 'formulario']);

export function VisibilityFields({
  entityType,
  visibility,
  onVisibilityChange,
  collaborators,
  memberIds,
  memberGrants,
  onToggleMember,
  onGrantChange,
}: VisibilityFieldsProps) {
  const noInherit = entityType ? NO_INHERIT_TYPES.has(entityType) : false;
  return (
    <>
      <div className="space-y-2">
        <Label>Visibilidad</Label>
        <Select value={visibility} onValueChange={(v) => onVisibilityChange(v as Visibility)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {VISIBILITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  {opt.icon}
                  <div>
                    <p className="text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visibility === 'restricted' && (
        <div className="space-y-2">
          <Label>Personal asignado</Label>
          <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-2">
            {collaborators.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">Sin colaboradores disponibles</p>
            ) : (
              collaborators.map((c) => {
                const checked = memberIds.includes(c.id);
                const grant = memberGrants[c.id] ?? { permission: 'read', inherit: true };
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
                        onCheckedChange={() => onToggleMember(c.id)}
                        className="size-4"
                      />
                      <span className="flex-1 truncate">{c.full_name}</span>
                    </label>
                    {checked && (
                      <div className="mt-2 flex items-center gap-2 pl-6">
                        <Select
                          value={grant.permission}
                          onValueChange={(v) =>
                            onGrantChange(c.id, { permission: v as EntityPermission })
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
                          {!noInherit && (
                            <>
                              <Checkbox
                                checked={grant.inherit}
                                onCheckedChange={(val) => onGrantChange(c.id, { inherit: val === true })}
                                className="size-3.5"
                              />
                              Heredar al contenido público
                            </>
                          )}
                        </label>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {noInherit ? (
            <p className="text-xs text-muted-foreground">
              El acceso asignado es aislado: el colaborador verá solo este archivo.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              El heredar alcanza solo el contenido público y nunca permite eliminar.
            </p>
          )}
        </div>
      )}
    </>
  );
}
