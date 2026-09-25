'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ItemRutaEntidad {
  etiqueta: string;
  href?: string;
}

// Ruta de navegación estándar de entidades (espacio > carpeta > lista > tarea).
export function RutaEntidad({
  items,
  ariaLabel = 'Ruta de la entidad',
  className,
}: {
  items: ItemRutaEntidad[];
  ariaLabel?: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className={cn('flex min-w-0 items-center gap-1 text-xs text-muted-foreground', className)}
    >
      {items.map((item, i) => (
        <span key={`${item.etiqueta}-${i}`} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight className="size-3 shrink-0" />}
          {item.href ? (
            <Link
              href={item.href}
              className="flex min-w-0 items-center gap-1 hover:text-foreground"
            >
              {i === 0 && <ArrowLeft className="size-3.5 shrink-0" />}
              <span className="max-w-[220px] truncate">{item.etiqueta}</span>
            </Link>
          ) : (
            <span className="max-w-[220px] truncate">{item.etiqueta}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
