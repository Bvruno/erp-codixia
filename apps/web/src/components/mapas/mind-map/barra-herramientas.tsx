'use client';

import {
  CheckSquare,
  Circle,
  Diamond,
  GitBranch,
  Hand,
  ImagePlus,
  Lightbulb,
  MousePointer2,
  Pencil,
  Shapes,
  Square,
  StickyNote,
  Triangle,
  Type,
  Waypoints,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { NODE_KINDS, SHAPE_OPTIONS } from '@/lib/mindmap-config';
import type { HerramientaMapa } from '@/components/mapas/mind-map-nodes';
import type { MindMapNodeKind, MindMapShape } from '@/types';

const HERRAMIENTAS: { key: HerramientaMapa; label: string; atajo: string; Icon: typeof MousePointer2 }[] = [
  { key: 'select', label: 'Seleccionar', atajo: 'V', Icon: MousePointer2 },
  { key: 'hand', label: 'Mover lienzo', atajo: 'H', Icon: Hand },
  { key: 'connector', label: 'Conectar', atajo: 'C', Icon: Waypoints },
  { key: 'pencil', label: 'Dibujar', atajo: 'P', Icon: Pencil },
  { key: 'text', label: 'Texto', atajo: 'T', Icon: Type },
];

const ANADIR: { key: MindMapNodeKind; Icon: typeof MousePointer2 }[] = [
  { key: 'idea', Icon: Lightbulb },
  { key: 'task', Icon: CheckSquare },
  { key: 'decision', Icon: GitBranch },
  { key: 'note', Icon: StickyNote },
  { key: 'image', Icon: ImagePlus },
];

const SHAPE_ICONS: Record<MindMapShape, typeof Square> = {
  rect: Square,
  ellipse: Circle,
  diamond: Diamond,
  triangle: Triangle,
};

/** Toolbar flotante estilo Excalidraw/Miro, sobre el lienzo. */
export function BarraHerramientas({
  tool,
  onTool,
  onAddKind,
  onAddShape,
  disabled,
}: {
  tool: HerramientaMapa;
  onTool: (t: HerramientaMapa) => void;
  onAddKind: (k: MindMapNodeKind) => void;
  onAddShape: (shape: MindMapShape) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-xl border bg-popover/95 p-1 shadow-lg backdrop-blur"
      role="toolbar"
      aria-label="Herramientas del mapa"
    >
      {HERRAMIENTAS.map(({ key, label, atajo, Icon }) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onTool(key)}
          title={`${label} (${atajo})`}
          aria-label={label}
          aria-pressed={tool === key}
          className={cn(
            'grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40',
            tool === key && 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
      <div className="mx-1 h-5 w-px bg-border" />
      {ANADIR.map(({ key, Icon }) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onAddKind(key)}
          title={`Añadir ${NODE_KINDS[key].label.toLowerCase()}`}
          aria-label={`Añadir ${NODE_KINDS[key].label.toLowerCase()}`}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Icon className="size-4" />
        </button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            title="Añadir forma"
            aria-label="Añadir forma"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Shapes className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="w-44">
          <DropdownMenuLabel>Forma</DropdownMenuLabel>
          {SHAPE_OPTIONS.map((s) => {
            const Icon = SHAPE_ICONS[s.key];
            return (
              <DropdownMenuItem
                key={s.key}
                onSelect={() => onAddShape(s.key)}
              >
                <Icon className="size-4" />
                {s.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
