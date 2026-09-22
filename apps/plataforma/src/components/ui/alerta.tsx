import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Alerta({
  tipo = 'error',
  children,
  className,
}: {
  tipo?: 'error' | 'info' | 'exito';
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role={tipo === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-md p-3 text-sm',
        tipo === 'error' && 'bg-destructive/10 text-destructive',
        tipo === 'info' && 'bg-muted text-muted-foreground',
        tipo === 'exito' && 'bg-emerald-600/10 text-emerald-600 dark:text-emerald-400',
        className
      )}
    >
      {children}
    </p>
  );
}

export function Etiqueta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('text-muted-foreground text-xs font-medium uppercase tracking-wide', className)}>
      {children}
    </span>
  );
}

export function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Etiqueta>{etiqueta}</Etiqueta>
      <div className="text-sm">{children}</div>
    </div>
  );
}
