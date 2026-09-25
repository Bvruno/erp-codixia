'use client';

import { cn } from '@/lib/utils';

// Contenedor estándar de una vista de entidad: espaciado uniforme y modo
// altura completa para vistas tipo editor/canvas.

export function EntidadPagina({
  children,
  alto = 'auto',
  className,
  ref,
}: {
  children: React.ReactNode;
  alto?: 'auto' | 'completa';
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        alto === 'completa'
          ? 'flex h-[calc(100dvh-3rem)] min-h-0 flex-col gap-3'
          : 'space-y-4',
        alto === 'completa' && 'print:block print:h-auto print:overflow-visible',
        className
      )}
    >
      {children}
    </div>
  );
}
