import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Divisor arrastrable para redimensionar paneles laterales. Actualiza la
// variable CSS del contenedor directamente durante el arrastre (sin
// re-render por frame) y confirma el ancho al soltar.

export const ANCHO_PAGINAS_DEFECTO = 192; // 12rem
export const ANCHO_PAGINAS_MIN = 160;
export const ANCHO_PAGINAS_MAX = 480;
export const PASO_TECLADO = 16;

export function clampAncho(
  ancho: number,
  min = ANCHO_PAGINAS_MIN,
  max = ANCHO_PAGINAS_MAX
): number {
  if (!Number.isFinite(ancho)) return ANCHO_PAGINAS_DEFECTO;
  return Math.min(max, Math.max(min, Math.round(ancho)));
}

/** Nuevo ancho tras una tecla de ajuste, o null si la tecla no aplica. */
export function anchoTrasTecla(
  ancho: number,
  tecla: string,
  paso = PASO_TECLADO
): number | null {
  switch (tecla) {
    case 'ArrowLeft':
      return clampAncho(ancho - paso);
    case 'ArrowRight':
      return clampAncho(ancho + paso);
    case 'Home':
      return ANCHO_PAGINAS_MIN;
    case 'End':
      return ANCHO_PAGINAS_MAX;
    default:
      return null;
  }
}

export function DivisorRedimensionable({
  ancho,
  onAncho,
  contenedorRef,
  variable = '--ancho-paginas',
  min = ANCHO_PAGINAS_MIN,
  max = ANCHO_PAGINAS_MAX,
  etiqueta = 'Redimensionar panel de páginas',
  className,
}: {
  ancho: number;
  onAncho: (ancho: number) => void;
  contenedorRef: React.RefObject<HTMLElement | null>;
  variable?: string;
  min?: number;
  max?: number;
  etiqueta?: string;
  className?: string;
}) {
  const [arrastrando, setArrastrando] = useState(false);
  const arrastrandoRef = useRef(false);
  const ultimoAnchoRef = useRef(ancho);

  const aplicar = (valor: number) => {
    ultimoAnchoRef.current = valor;
    contenedorRef.current?.style.setProperty(variable, `${valor}px`);
  };

  const alPresionar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    arrastrandoRef.current = true;
    setArrastrando(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastrandoRef.current) return;
    const el = contenedorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    aplicar(clampAncho(e.clientX - rect.left, min, max));
  };

  const alSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastrandoRef.current) return;
    arrastrandoRef.current = false;
    setArrastrando(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // el puntero ya se liberó
    }
    onAncho(ultimoAnchoRef.current);
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const siguiente = anchoTrasTecla(ancho, e.key, PASO_TECLADO);
    if (siguiente === null) return;
    e.preventDefault();
    aplicar(siguiente);
    onAncho(siguiente);
  };

  const restablecer = () => {
    aplicar(ANCHO_PAGINAS_DEFECTO);
    onAncho(ANCHO_PAGINAS_DEFECTO);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={etiqueta}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(ancho)}
      tabIndex={0}
      title="Arrastrá para cambiar el ancho · doble clic para restablecer"
      onPointerDown={alPresionar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onKeyDown={alTeclear}
      onDoubleClick={restablecer}
      className={cn(
        'group relative hidden w-1.5 shrink-0 cursor-col-resize touch-none select-none outline-none lg:block print:hidden',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full bg-border transition-colors',
          arrastrando
            ? 'bg-primary'
            : 'group-hover:bg-primary/60 group-focus-visible:bg-primary'
        )}
      />
    </div>
  );
}
