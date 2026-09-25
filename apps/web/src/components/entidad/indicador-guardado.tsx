'use client';

import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ETIQUETA } from './tipografia';

// Indicador de autosave inline para las cabeceras. Acepta tanto el
// vocabulario de lib/use-autoguardado como el local ('saving'|'saved'|'unsaved').

export type EstadoGuardadoUI = 'guardando' | 'guardado' | 'pendiente' | 'error';

type EstadoAceptado = EstadoGuardadoUI | 'saving' | 'saved' | 'unsaved';

function normalizar(estado: EstadoAceptado): EstadoGuardadoUI {
  switch (estado) {
    case 'saving':
      return 'guardando';
    case 'saved':
      return 'guardado';
    case 'unsaved':
      return 'pendiente';
    default:
      return estado;
  }
}

export function IndicadorGuardado({
  estado,
  formato = 'texto',
  className,
}: {
  estado: EstadoAceptado;
  formato?: 'texto' | 'icono';
  className?: string;
}) {
  const normalizado = normalizar(estado);
  const texto = normalizado === 'guardando' ? 'Guardando…' : normalizado === 'guardado' ? 'Guardado' : normalizado === 'error' ? 'Error al guardar' : 'Sin guardar…';

  return (
    <span
      role="status"
      aria-live="polite"
      title={texto}
      className={cn(
        'flex items-center gap-1.5',
        ETIQUETA,
        normalizado === 'error' ? 'text-destructive' : 'text-muted-foreground',
        className
      )}
    >
      {normalizado === 'guardando' && <Loader2 className="size-3.5 animate-spin" />}
      {normalizado === 'guardado' && <Check className="size-3.5 text-success" />}
      {formato === 'texto' && texto}
    </span>
  );
}
