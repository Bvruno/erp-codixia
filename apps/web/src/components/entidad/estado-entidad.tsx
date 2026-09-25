'use client';

import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import type { LucideIcon } from 'lucide-react';

// Estados estándar de entidad: vacío/error y esqueletos de carga.

export function EstadoEntidad({
  icono,
  titulo,
  descripcion,
  accion,
  className,
}: {
  icono?: LucideIcon;
  titulo: string;
  descripcion?: string;
  accion?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <EmptyState
      icon={icono}
      title={titulo}
      description={descripcion}
      action={accion}
      className={className}
    />
  );
}

export function EsqueletoEntidad({
  variante = 'tabla',
  filas = 5,
  columnas = 6,
}: {
  variante?: 'tabla' | 'editor' | 'detalle' | 'tablero';
  filas?: number;
  columnas?: number;
}) {
  if (variante === 'editor') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (variante === 'detalle') {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-[60vh] w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (variante === 'tablero') {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return <TableSkeleton rows={filas} cols={columnas} />;
}
