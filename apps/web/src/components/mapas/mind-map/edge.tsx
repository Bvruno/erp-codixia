'use client';

import { useEffect, useRef } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react';
import { useEditor } from '@/components/mapas/mind-map-nodes';
import type { FlowEdge } from './flow';

/**
 * Conexión del mapa con estilos (curva/recta/escalón, punteada, flecha) y
 * etiqueta editable inline con doble clic.
 */
export function MapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  markerEnd,
}: EdgeProps<FlowEdge>) {
  const ctx = useEditor();
  const kind = data?.kind ?? 'bezier';
  const dashed = data?.dashed ?? false;
  const arrow = data?.arrow !== false;
  const params = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, labelX, labelY] =
    kind === 'straight'
      ? getStraightPath(params)
      : kind === 'step'
        ? getSmoothStepPath(params)
        : getBezierPath(params);

  const editando = ctx.edgeEditId === id;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editando) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editando]);

  const confirmar = () => {
    if (!editando) return;
    const valor = inputRef.current?.value.trim() ?? '';
    ctx.actualizarEdge(id, { label: valor || null });
    ctx.editarEdge(null);
  };

  const cancelar = () => {
    ctx.editarEdge(null);
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={arrow ? markerEnd : undefined}
        interactionWidth={24}
        style={dashed ? { strokeDasharray: '7 5' } : undefined}
      />
      <EdgeLabelRenderer>
        {editando ? (
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 30,
            }}
          >
            <input
              ref={inputRef}
              defaultValue={typeof label === 'string' ? label : ''}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmar();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelar();
                }
              }}
              onBlur={confirmar}
              placeholder="Etiqueta…"
              aria-label="Etiqueta de la conexión"
              className="h-7 w-40 rounded-md border bg-background px-2 text-xs shadow-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        ) : typeof label === 'string' && label ? (
          <button
            type="button"
            className="nodrag nopan rounded-md border bg-background/95 px-1.5 py-0.5 text-xs font-semibold shadow-sm hover:border-primary/50"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            title="Doble clic para editar la etiqueta"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (ctx.editable) ctx.editarEdge(id);
            }}
          >
            {label}
          </button>
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}

export const MIND_MAP_EDGE_TYPES = { mapa: MapEdge };
