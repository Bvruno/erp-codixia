'use client';

import { useReactFlow } from '@xyflow/react';
import { avatarColor, getInitials } from '@/components/tareas/assignee-select';

export type RemoteCursor = {
  x: number;
  y: number;
  nombre: string;
};

/**
 * Capa de cursores remotos: posiciona el cursor de cada miembro
 * conectado al canal del mapa usando el viewport local (cada quien
 * mantiene su propia vista).
 */
export function RemoteCursorsLayer({ cursors }: { cursors: Record<string, RemoteCursor> }) {
  const { flowToScreenPosition } = useReactFlow();

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      {Object.entries(cursors).map(([userId, c]) => {
        const p = flowToScreenPosition({ x: c.x, y: c.y });
        const color = avatarColor(userId);
        return (
          <div
            key={userId}
            className="absolute flex items-center gap-1.5"
            style={{ left: p.x, top: p.y, transform: 'translate(-4px, -4px)' }}
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm"
              style={{ backgroundColor: color.bg, borderColor: color.border, color: color.text }}
              title={c.nombre}
            >
              {getInitials(c.nombre)}
            </span>
          </div>
        );
      })}
    </div>
  );
}