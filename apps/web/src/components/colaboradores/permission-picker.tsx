'use client';

import { Check, Eye, PenLine, ShieldCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { EntityPermission } from '@/types';

const OPTIONS: {
  value: EntityPermission;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'read',
    label: 'Solo lectura',
    description: 'Ver el contenido',
    icon: <Eye className="size-4" />,
  },
  {
    value: 'write',
    label: 'Edición',
    description: 'Ver + crear y editar tareas y páginas',
    icon: <PenLine className="size-4" />,
  },
  {
    value: 'manage',
    label: 'Gestión completa',
    description: 'Todo + crear, renombrar y borrar carpetas, listas y documentos',
    icon: <ShieldCheck className="size-4" />,
  },
];

export function PermissionPicker({
  value,
  onChange,
  inherit,
  onInheritChange,
}: {
  value: EntityPermission;
  onChange: (permission: EntityPermission) => void;
  inherit: boolean;
  onInheritChange: (inherit: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
                selected
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 shrink-0',
                  selected ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {opt.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {opt.label}
                  {selected && <Check className="size-3.5 text-primary" />}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {opt.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2">
        <Checkbox
          checked={inherit}
          onCheckedChange={(v) => onInheritChange(v === true)}
          className="mt-0.5"
        />
        <span>
          <span className="text-sm font-medium">Heredar al contenido interno</span>
          <span className="text-muted-foreground block text-xs">
            {inherit
              ? 'El acceso aplica también a subcarpetas, listas y documentos dentro de la entidad.'
              : 'El acceso aplica solo a esta entidad; el contenido interno requiere accesos propios.'}
          </span>
        </span>
      </label>
    </div>
  );
}
