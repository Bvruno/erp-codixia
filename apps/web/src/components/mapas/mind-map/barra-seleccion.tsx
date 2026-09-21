'use client';

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Check,
  Copy,
  MoveHorizontal,
  MoveVertical,
  Pencil,
  Trash2,
  Waypoints,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EDGE_KINDS, NODE_COLORS } from '@/lib/mindmap-config';
import type { ModoAlineacion } from '@/lib/mindmap-layout';
import type { MapEdgeData } from './flow';

export type EdgeSeleccionado = MapEdgeData & { id: string; label?: string };

/** Barra flotante para selección múltiple y conexiones. */
export function BarraSeleccion({
  cantidadNodos,
  edges,
  onColor,
  onAlinear,
  onDistribuir,
  onDuplicar,
  onEliminar,
  onEdgeKind,
  onEdgeDashed,
  onEdgeArrow,
  onEditarEtiquetaEdge,
}: {
  cantidadNodos: number;
  edges: EdgeSeleccionado[];
  onColor: (color: string) => void;
  onAlinear: (modo: ModoAlineacion) => void;
  onDistribuir: (eje: 'horizontal' | 'vertical') => void;
  onDuplicar: () => void;
  onEliminar: () => void;
  onEdgeKind: (kind: MapEdgeData['kind']) => void;
  onEdgeDashed: (dashed: boolean) => void;
  onEdgeArrow: (arrow: boolean) => void;
  onEditarEtiquetaEdge: () => void;
}) {
  const hayNodos = cantidadNodos > 1;
  const hayEdges = edges.length > 0;
  if (!hayNodos && !hayEdges) return null;

  const primerEdge = edges[0];
  const mismoTipo = edges.every((e) => e.kind === primerEdge?.kind);
  const mismasPunteadas = edges.every((e) => e.dashed === primerEdge?.dashed);
  const mismasFlechas = edges.every((e) => e.arrow === primerEdge?.arrow);

  return (
    <div
      className="pointer-events-auto absolute bottom-16 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border bg-popover/95 p-1.5 shadow-lg backdrop-blur"
      role="toolbar"
      aria-label="Acciones de selección"
    >
      {hayNodos && (
        <>
          <span className="px-1 text-[11px] font-medium text-muted-foreground">
            {cantidadNodos} nodos
          </span>
          <div className="mx-1 h-5 w-px bg-border" />
          <div className="flex items-center gap-0.5">
            {NODE_COLORS.slice(0, 8).map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onColor(c.value)}
                className="size-4 rounded-full border border-black/10 transition-transform hover:scale-110"
                style={{ backgroundColor: c.value }}
                title={`Color ${c.label}`}
              />
            ))}
          </div>
          <div className="mx-1 h-5 w-px bg-border" />
          <BotonBarra title="Alinear a la izquierda" onClick={() => onAlinear('izquierda')}>
            <AlignStartVertical className="size-4" />
          </BotonBarra>
          <BotonBarra title="Centrar horizontalmente" onClick={() => onAlinear('centro-h')}>
            <AlignCenterVertical className="size-4" />
          </BotonBarra>
          <BotonBarra title="Alinear a la derecha" onClick={() => onAlinear('derecha')}>
            <AlignEndVertical className="size-4" />
          </BotonBarra>
          <BotonBarra title="Alinear arriba" onClick={() => onAlinear('arriba')}>
            <AlignStartHorizontal className="size-4" />
          </BotonBarra>
          <BotonBarra title="Centrar verticalmente" onClick={() => onAlinear('centro-v')}>
            <AlignCenterHorizontal className="size-4" />
          </BotonBarra>
          <BotonBarra title="Alinear abajo" onClick={() => onAlinear('abajo')}>
            <AlignEndHorizontal className="size-4" />
          </BotonBarra>
          <div className="mx-1 h-5 w-px bg-border" />
          <BotonBarra title="Distribuir horizontalmente" onClick={() => onDistribuir('horizontal')}>
            <MoveHorizontal className="size-4" />
          </BotonBarra>
          <BotonBarra title="Distribuir verticalmente" onClick={() => onDistribuir('vertical')}>
            <MoveVertical className="size-4" />
          </BotonBarra>
        </>
      )}

      {hayEdges && (
        <>
          {hayNodos && <div className="mx-1 h-5 w-px bg-border" />}
          <span className="px-1 text-[11px] font-medium text-muted-foreground">
            {edges.length === 1 ? '1 conexión' : `${edges.length} conexiones`}
          </span>
          <div className="mx-1 h-5 w-px bg-border" />
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
            {EDGE_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => onEdgeKind(k.key)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] transition-colors hover:bg-muted',
                  mismoTipo && primerEdge?.kind === k.key && 'bg-primary/10 font-medium text-primary'
                )}
                aria-pressed={mismoTipo && primerEdge?.kind === k.key}
              >
                {k.label}
              </button>
            ))}
          </div>
          <BotonBarra
            title="Línea discontinua"
            activo={mismasPunteadas && primerEdge?.dashed === true}
            onClick={() => onEdgeDashed(!(mismasPunteadas && primerEdge?.dashed === true))}
          >
            <MoveHorizontal className="size-4" />
          </BotonBarra>
          <BotonBarra
            title="Flecha al final"
            activo={mismasFlechas && primerEdge?.arrow === true}
            onClick={() => onEdgeArrow(!(mismasFlechas && primerEdge?.arrow === true))}
          >
            <Waypoints className="size-4" />
          </BotonBarra>
          {edges.length === 1 && (
            <BotonBarra title="Editar etiqueta" onClick={onEditarEtiquetaEdge}>
              <Pencil className="size-4" />
            </BotonBarra>
          )}
        </>
      )}

      <div className="mx-1 h-5 w-px bg-border" />
      <BotonBarra title="Duplicar (Ctrl+D)" onClick={onDuplicar} disabled={!hayNodos}>
        <Copy className="size-4" />
      </BotonBarra>
      <BotonBarra title="Eliminar (Supr)" onClick={onEliminar} danger>
        <Trash2 className="size-4" />
      </BotonBarra>
      {hayEdges && (
        <span className="hidden items-center gap-1 px-1 text-[10px] text-muted-foreground sm:flex">
          <Check className="size-3" /> {edges.length === 1 ? 'conexión' : 'conexiones'}
        </span>
      )}
    </div>
  );
}

function BotonBarra({
  children,
  title,
  onClick,
  disabled,
  danger,
  activo,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  activo?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={activo}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40',
        danger && 'hover:text-destructive',
        activo && 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
      )}
    >
      {children}
    </button>
  );
}
