'use client';

import { cn } from '@/lib/utils';

// Barra de herramientas unificada (editor de documento, mapa mental y
// acciones con icono). Reemplaza a ToolbarButton/ToolbarDivider y al TOOL_BTN
// local del mapa.

export function BotonHerramienta({
  onClick,
  active = false,
  disabled = false,
  title,
  tamano = 'sm',
  className,
  children,
}: {
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  tamano?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'grid place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent',
        tamano === 'sm' ? 'size-7' : 'size-8',
        active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
        className
      )}
    >
      {children}
    </button>
  );
}

export function SeparadorHerramienta({ className }: { className?: string }) {
  return <div className={cn('mx-1 h-5 w-px bg-border', className)} />;
}

export function BarraHerramientas({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      className={cn('flex flex-wrap items-center gap-0.5', className)}
    >
      {children}
    </div>
  );
}
