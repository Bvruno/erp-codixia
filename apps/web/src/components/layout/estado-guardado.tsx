import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EstadoGuardado } from '@/lib/use-autoguardado';

// Barra sticky de estado de guardado para páginas con autosave. Reemplaza al
// botón de guardar: muestra qué está pasando y ofrece reintento si falló.
export function BarraEstadoGuardado({
  estado,
  onReintentar,
  mensajeError = 'No se pudo guardar',
  className,
}: {
  estado: EstadoGuardado;
  onReintentar: () => void;
  mensajeError?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'sticky bottom-4 z-20 mt-6 flex items-center justify-end gap-2 rounded-xl border bg-background/85 p-3 text-sm shadow-lg backdrop-blur',
        estado === 'error' && 'border-destructive/40',
        className,
      )}
    >
      {estado === 'guardando' && (
        <>
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Guardando…</span>
        </>
      )}
      {estado === 'pendiente' && (
        <span className="text-muted-foreground">Sin guardar…</span>
      )}
      {estado === 'guardado' && (
        <>
          <Check className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Guardado</span>
        </>
      )}
      {estado === 'error' && (
        <>
          <AlertCircle className="size-4 text-destructive" />
          <span className="text-destructive">{mensajeError}</span>
          <Button variant="outline" size="sm" onClick={onReintentar}>
            Reintentar
          </Button>
        </>
      )}
    </div>
  );
}
