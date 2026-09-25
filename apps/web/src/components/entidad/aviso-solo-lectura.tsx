'use client';

import { cn } from '@/lib/utils';
import { ETIQUETA } from './tipografia';

// Aviso de solo lectura: badge compacto (cabecera) o banner (cuerpo).

export function AvisoSoloLectura({
  variante = 'banner',
  mensaje = 'Tienes acceso de solo lectura: puedes ver el contenido, pero no editarlo.',
  className,
}: {
  variante?: 'badge' | 'banner';
  mensaje?: string;
  className?: string;
}) {
  if (variante === 'badge') {
    return (
      <span
        className={cn(
          'rounded-full bg-muted px-2 py-0.5 text-muted-foreground',
          ETIQUETA,
          className
        )}
      >
        Solo lectura
      </span>
    );
  }

  return (
    <p
      role="status"
      className={cn(
        'rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-warning',
        ETIQUETA,
        className
      )}
    >
      {mensaje}
    </p>
  );
}
