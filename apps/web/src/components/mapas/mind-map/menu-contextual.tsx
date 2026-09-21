'use client';

import type { ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  CheckSquare,
  Circle,
  CircleDot,
  ClipboardPaste,
  Columns3,
  Copy,
  CornerDownRight,
  Diamond,
  GitBranch,
  Grid3x3,
  ImagePlus,
  LayoutGrid,
  LayoutTemplate,
  Lightbulb,
  Maximize2,
  MoveHorizontal,
  MoveVertical,
  Palette,
  Pencil,
  PencilRuler,
  Rows3,
  Shapes,
  Square,
  StickyNote,
  Trash2,
  Triangle,
  Waypoints,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EDGE_KINDS, NODE_COLORS, NODE_KINDS, SHAPE_OPTIONS } from '@/lib/mindmap-config';
import type { ModoAlineacion, DireccionArbol } from '@/lib/mindmap-layout';
import type { MindMapHandleDirection } from '@/lib/mindmap';
import type { FlowEdge, MapEdgeData } from './flow';
import type { MindMapNodeData, MindMapNodeKind, MindMapShape } from '@/types';

const SHAPE_ICONS: Record<MindMapShape, typeof Square> = {
  rect: Square,
  ellipse: Circle,
  diamond: Diamond,
  triangle: Triangle,
};

export type FondoMapa = 'dots' | 'lines' | 'cross' | 'none';

export type MenuMapa =
  | { tipo: 'nodo'; x: number; y: number; nodoId: string; tipoNodo: MindMapNodeKind }
  | { tipo: 'seleccion'; x: number; y: number; cantidad: number }
  | { tipo: 'edge'; x: number; y: number; edgeId: string; edge: FlowEdge }
  | { tipo: 'lienzo'; x: number; y: number; posicion: { x: number; y: number } }
  | {
      tipo: 'crear';
      x: number;
      y: number;
      sourceId: string;
      dir: MindMapHandleDirection;
    };

export type AccionesMenuMapa = {
  hayPortapapeles: boolean;
  haySeleccion: boolean;
  editarNodo: (id: string) => void;
  duplicarNodo: (id: string) => void;
  duplicarSeleccion: () => void;
  copiar: () => void;
  pegar: () => void;
  cambiarColorSeleccion: (color: string) => void;
  agregarConectado: (
    id: string,
    dir: MindMapHandleDirection,
    kind?: MindMapNodeKind,
    overrides?: Partial<MindMapNodeData>
  ) => void;
  traerFrente: (id: string) => void;
  enviarFondo: (id: string) => void;
  eliminarSeleccion: () => void;
  alinear: (modo: ModoAlineacion) => void;
  distribuir: (eje: 'horizontal' | 'vertical') => void;
  editarEtiquetaEdge: (id: string) => void;
  cambiarEdge: (id: string, patch: Partial<MapEdgeData>) => void;
  invertirEdge: (id: string) => void;
  eliminarEdge: (id: string) => void;
  seleccionarTodo: () => void;
  agregarNodoEn: (
    kind: MindMapNodeKind,
    pos: { x: number; y: number },
    overrides?: Partial<MindMapNodeData>
  ) => void;
  cambiarFormaNodo: (id: string, shape: MindMapShape) => void;
  ajustarVista: () => void;
  cambiarFondo: (variante: FondoMapa) => void;
  autoOrganizar: (dir: DireccionArbol) => void;
  abrirPlantillas: () => void;
};

function ColorSubmenu({
  onColor,
  children = 'Color',
}: {
  onColor: (color: string) => void;
  children?: ReactNode;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette className="size-4" />
        {children}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-40">
        {NODE_COLORS.map((c) => (
          <DropdownMenuItem key={c.key} onSelect={() => onColor(c.value)}>
            <span
              className="size-3.5 rounded-full border border-black/10"
              style={{ backgroundColor: c.value }}
            />
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ContenidoNodo({
  nodoId,
  tipoNodo,
  a,
}: {
  nodoId: string;
  tipoNodo: MindMapNodeKind;
  a: AccionesMenuMapa;
}) {
  return (
    <>
      <DropdownMenuItem onSelect={() => a.editarNodo(nodoId)}>
        <Pencil className="size-4" /> Editar texto
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => a.duplicarNodo(nodoId)}>
        <Copy className="size-4" /> Duplicar
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => a.copiar()}>
        <ClipboardPaste className="size-4" /> Copiar
      </DropdownMenuItem>
      <ColorSubmenu onColor={a.cambiarColorSeleccion} />
      {tipoNodo === 'shape' && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Shapes className="size-4" /> Forma
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {SHAPE_OPTIONS.map((s) => {
              const Icon = SHAPE_ICONS[s.key];
              return (
                <DropdownMenuItem
                  key={s.key}
                  onSelect={() => a.cambiarFormaNodo(nodoId, s.key)}
                >
                  <Icon className="size-4" /> {s.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Waypoints className="size-4" /> Conectar…
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-44">
          {(
            [
              ['r', 'Nodo a la derecha'],
              ['l', 'Nodo a la izquierda'],
              ['b', 'Nodo abajo'],
              ['t', 'Nodo arriba'],
            ] as [MindMapHandleDirection, string][]
          ).map(([dir, label]) => (
            <DropdownMenuItem key={dir} onSelect={() => a.agregarConectado(nodoId, dir)}>
              <CornerDownRight className="size-4" /> {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => a.traerFrente(nodoId)}>
        <ArrowUpToLine className="size-4" /> Traer al frente
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => a.enviarFondo(nodoId)}>
        <ArrowDownToLine className="size-4" /> Enviar al fondo
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => a.eliminarSeleccion()}>
        <Trash2 className="size-4" /> Eliminar
      </DropdownMenuItem>
    </>
  );
}

function ContenidoSeleccion({ a }: { a: AccionesMenuMapa }) {
  return (
    <>
      <DropdownMenuLabel>Selección</DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => a.duplicarSeleccion()}>
        <Copy className="size-4" /> Duplicar
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <AlignStartVertical className="size-4" /> Alinear
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-44">
          <DropdownMenuItem onSelect={() => a.alinear('izquierda')}>
            <AlignStartVertical className="size-4" /> Izquierda
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.alinear('centro-h')}>
            <AlignCenterVertical className="size-4" /> Centro horizontal
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.alinear('derecha')}>
            <AlignEndVertical className="size-4" /> Derecha
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => a.alinear('arriba')}>
            <AlignStartHorizontal className="size-4" /> Arriba
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.alinear('centro-v')}>
            <AlignCenterHorizontal className="size-4" /> Centro vertical
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.alinear('abajo')}>
            <AlignEndHorizontal className="size-4" /> Abajo
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <MoveHorizontal className="size-4" /> Distribuir
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-40">
          <DropdownMenuItem onSelect={() => a.distribuir('horizontal')}>
            <Columns3 className="size-4" /> Horizontal
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.distribuir('vertical')}>
            <Rows3 className="size-4" /> Vertical
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <ColorSubmenu onColor={a.cambiarColorSeleccion} />
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => a.copiar()}>
        <ClipboardPaste className="size-4" /> Copiar
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => a.eliminarSeleccion()}>
        <Trash2 className="size-4" /> Eliminar
      </DropdownMenuItem>
    </>
  );
}

function ContenidoEdge({ edgeId, edge, a }: { edgeId: string; edge: FlowEdge; a: AccionesMenuMapa }) {
  const data = edge.data ?? { kind: 'bezier', dashed: false, arrow: true };
  return (
    <>
      <DropdownMenuItem onSelect={() => a.editarEtiquetaEdge(edgeId)}>
        <Pencil className="size-4" /> Editar etiqueta
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Trazado</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={data.kind}
        onValueChange={(v) => a.cambiarEdge(edgeId, { kind: v as MapEdgeData['kind'] })}
      >
        {EDGE_KINDS.map((k) => (
          <DropdownMenuRadioItem key={k.key} value={k.key}>
            {k.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        checked={data.dashed}
        onCheckedChange={(v) => a.cambiarEdge(edgeId, { dashed: v === true })}
      >
        <MoveHorizontal className="size-4" /> Línea discontinua
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={data.arrow}
        onCheckedChange={(v) => a.cambiarEdge(edgeId, { arrow: v === true })}
      >
        <Waypoints className="size-4" /> Flecha
      </DropdownMenuCheckboxItem>
      <DropdownMenuItem onSelect={() => a.invertirEdge(edgeId)}>
        <MoveVertical className="size-4" /> Invertir dirección
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => a.eliminarEdge(edgeId)}>
        <Trash2 className="size-4" /> Eliminar conexión
      </DropdownMenuItem>
    </>
  );
}

const KINDS_CREAR: [MindMapNodeKind, typeof Lightbulb][] = [
  ['idea', Lightbulb],
  ['task', CheckSquare],
  ['decision', GitBranch],
  ['note', StickyNote],
  ['text', PencilRuler],
  ['image', ImagePlus],
];

function ContenidoCrear({
  sourceId,
  dir,
  a,
}: {
  sourceId: string;
  dir: MindMapHandleDirection;
  a: AccionesMenuMapa;
}) {
  return (
    <>
      <DropdownMenuLabel>Crear conectado</DropdownMenuLabel>
      {KINDS_CREAR.map(([kind, Icon]) => (
        <DropdownMenuItem
          key={kind}
          onSelect={() => a.agregarConectado(sourceId, dir, kind)}
        >
          <Icon className="size-4" /> {NODE_KINDS[kind].label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Formas</DropdownMenuLabel>
      {SHAPE_OPTIONS.map((s) => {
        const Icon = SHAPE_ICONS[s.key];
        return (
          <DropdownMenuItem
            key={s.key}
            onSelect={() => a.agregarConectado(sourceId, dir, 'shape', { shape: s.key })}
          >
            <Icon className="size-4" /> {s.label}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

function ContenidoLienzo({ posicion, a }: { posicion: { x: number; y: number }; a: AccionesMenuMapa }) {
  return (
    <>
      <DropdownMenuItem onSelect={() => a.pegar()} disabled={!a.hayPortapapeles}>
        <ClipboardPaste className="size-4" /> Pegar
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => a.seleccionarTodo()}>
        <LayoutGrid className="size-4" /> Seleccionar todo
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Shapes className="size-4" /> Añadir nodo aquí
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-44">
          {(
            [
              ['idea', 'Idea', Lightbulb],
              ['task', 'Tarea', CheckSquare],
              ['decision', 'Decisión', GitBranch],
              ['note', 'Nota', StickyNote],
              ['text', 'Texto', PencilRuler],
              ['image', 'Imagen', ImagePlus],
            ] as [MindMapNodeKind, string, typeof Lightbulb][]
          ).map(([kind, label, Icon]) => (
            <DropdownMenuItem key={kind} onSelect={() => a.agregarNodoEn(kind, posicion)}>
              <Icon className="size-4" /> {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Shapes className="size-4" /> Forma
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              {SHAPE_OPTIONS.map((s) => {
                const Icon = SHAPE_ICONS[s.key];
                return (
                  <DropdownMenuItem
                    key={s.key}
                    onSelect={() => a.agregarNodoEn('shape', posicion, { shape: s.key })}
                  >
                    <Icon className="size-4" /> {s.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Grid3x3 className="size-4" /> Fondo
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-36">
          <DropdownMenuItem onSelect={() => a.cambiarFondo('dots')}>
            <CircleDot className="size-4" /> Puntos
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.cambiarFondo('lines')}>
            <Rows3 className="size-4" /> Líneas
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.cambiarFondo('cross')}>
            <Grid3x3 className="size-4" /> Cruces
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.cambiarFondo('none')}>
            <Maximize2 className="size-4" /> Sin fondo
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <LayoutGrid className="size-4" /> Auto-organizar
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-44">
          <DropdownMenuItem onSelect={() => a.autoOrganizar('horizontal')}>
            <Columns3 className="size-4" /> Árbol horizontal
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.autoOrganizar('vertical')}>
            <Rows3 className="size-4" /> Árbol vertical
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.autoOrganizar('radial')}>
            <Shapes className="size-4" /> Radial
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem onSelect={() => a.ajustarVista()}>
        <Maximize2 className="size-4" /> Ajustar vista
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => a.abrirPlantillas()}>
        <LayoutTemplate className="size-4" /> Aplicar plantilla…
      </DropdownMenuItem>
    </>
  );
}

/** Menú contextual (clic derecho) para nodo, selección, edge o lienzo. */
export function MenuContextualMapa({
  menu,
  acciones,
  onCerrar,
}: {
  menu: MenuMapa;
  acciones: AccionesMenuMapa;
  onCerrar: () => void;
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed z-50 size-px"
          style={{ left: menu.x, top: menu.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={2}
        collisionPadding={8}
        className="w-60"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {menu.tipo === 'nodo' && (
          <ContenidoNodo nodoId={menu.nodoId} tipoNodo={menu.tipoNodo} a={acciones} />
        )}
        {menu.tipo === 'seleccion' && <ContenidoSeleccion a={acciones} />}
        {menu.tipo === 'edge' && (
          <ContenidoEdge edgeId={menu.edgeId} edge={menu.edge} a={acciones} />
        )}
        {menu.tipo === 'lienzo' && (
          <ContenidoLienzo posicion={menu.posicion} a={acciones} />
        )}
        {menu.tipo === 'crear' && (
          <ContenidoCrear sourceId={menu.sourceId} dir={menu.dir} a={acciones} />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
