'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ETIQUETA } from './tipografia';

// Botón estándar de acción de entidad: mismo tamaño, borde y tipografía en
// las cabeceras de las 8 vistas (Compartir, Imprimir, modo, etc.).

export function AccionEntidad({
  icono: Icono,
  onClick,
  disabled = false,
  title,
  pressed,
  className,
  children,
}: {
  icono?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  pressed?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
        ETIQUETA,
        pressed && 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary',
        className
      )}
    >
      {Icono && <Icono className="size-3.5 shrink-0" />}
      {children}
    </button>
  );
}

export function AccionesEntidad({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('ml-auto flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}
