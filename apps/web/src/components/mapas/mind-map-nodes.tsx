'use client';

import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Handle,
  NodeResizer,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  CheckCircle2,
  Circle,
  Copy,
  Diamond,
  ImagePlus,
  Pencil,
  Plus,
  Square,
  Trash2,
  Triangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE_WIDTH,
  NODE_COLORS,
  NODE_KINDS,
  SHAPE_OPTIONS,
  priorityColor,
  etiquetaPrioridad,
} from '@/lib/mindmap-config';
import type { MindMapHandleDirection } from '@/lib/mindmap';
import type { MapEdgeData } from '@/components/mapas/mind-map/flow';
import type { MindMapNodeData, MindMapNodeKind, MindMapShape } from '@/types';

const SHAPE_ICONS: Record<MindMapShape, typeof Square> = {
  rect: Square,
  ellipse: Circle,
  diamond: Diamond,
  triangle: Triangle,
};

/**
 * React Flow entrega `width/height` del nodo como 0 mientras no está medido
 * (`measured?.width ?? node.width ?? 0`). Un 0 no es tamaño de usuario: se
 * normaliza a undefined para poder caer al tamaño por defecto del tipo.
 */
export function dimensionUsuario(v: number | undefined): number | undefined {
  return typeof v === 'number' && v > 0 ? v : undefined;
}

/** SVG de la figura con viewBox 100×100; reutilizado por nodo y fantasma. */
export function FormaSVG({
  shape,
  color,
  className,
}: {
  shape: MindMapShape;
  color: string;
  className?: string;
}) {
  return (
    <svg
      className={cn('size-full overflow-visible', className)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {shape === 'rect' && (
        <rect x="1" y="1" width="98" height="98" rx="8" fill={`${color}14`} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      )}
      {shape === 'ellipse' && (
        <ellipse cx="50" cy="50" rx="49" ry="49" fill={`${color}14`} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      )}
      {shape === 'diamond' && (
        <polygon points="50,1 99,50 50,99 1,50" fill={`${color}14`} stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      )}
      {shape === 'triangle' && (
        <polygon points="50,2 98,98 2,98" fill={`${color}14`} stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

type MindMapFlowNode = Node<MindMapNodeData, MindMapNodeKind>;
type MindMapNodeProps = NodeProps<MindMapFlowNode>;

export type HerramientaMapa = 'select' | 'hand' | 'connector' | 'pencil' | 'text';

export type MindMapEditorContextValue = {
  editable: boolean;
  tool: HerramientaMapa;
  /** Nodo cuya etiqueta está en edición inline. */
  editId: string | null;
  /** Edge cuya etiqueta está en edición inline. */
  edgeEditId: string | null;
  updateNodeData: (id: string, patch: Partial<MindMapNodeData>) => void;
  uploadImage: (file: File) => Promise<string | null>;
  addConnected: (sourceId: string, dir: MindMapHandleDirection, editar?: boolean) => void;
  /** Abre el menú de tipos de nodo para crear en la dirección del handle “+”. */
  abrirCrear: (
    sourceId: string,
    dir: MindMapHandleDirection,
    pos: { x: number; y: number }
  ) => void;
  duplicar: (id: string) => void;
  eliminar: (id: string) => void;
  editarNodo: (id: string | null) => void;
  actualizarEdge: (id: string, patch: Partial<MapEdgeData> & { label?: string | null }) => void;
  editarEdge: (id: string | null) => void;
  iniciarResize: () => void;
  finResize: (id: string, width: number, height: number) => void;
};

const EditorContext = createContext<MindMapEditorContextValue | null>(null);

export function useEditor(): MindMapEditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor debe usarse dentro del canvas de mapas');
  return ctx;
}

function Handles() {
  const { editable, tool } = useEditor();
  const visible = editable && (tool === 'select' || tool === 'connector');
  // Los handles deben existir SIEMPRE en el DOM: son los anclajes de
  // los edges (paths y flechas). En lectura se mantienen invisibles
  // e inertes; en edición se muestran como puntos de conexión.
  const handleClass = visible
    ? '!size-2 !border-0 !bg-slate-400'
    : '!size-2 !border-0 !bg-slate-400 !opacity-0 !pointer-events-none';
  return (
    <>
      {(['source', 'target'] as const).flatMap((type) =>
        (['t', 'r', 'b', 'l'] as const).map((pos) => (
          <Handle
            key={`${type}-${pos}`}
            id={pos}
            type={type}
            position={pos === 't' ? Position.Top : pos === 'r' ? Position.Right : pos === 'b' ? Position.Bottom : Position.Left}
            className={handleClass}
          />
        ))
      )}
    </>
  );
}

function Tags({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l} className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs leading-none">
          {l}
        </span>
      ))}
    </div>
  );
}

const ADD_POSITION: Record<MindMapHandleDirection, Position> = {
  r: Position.Right,
  l: Position.Left,
  b: Position.Bottom,
  t: Position.Top,
};

function AddNodeButtons({ sourceId }: { sourceId: string }) {
  const ctx = useEditor();
  // Los handles "+" deben existir SIEMPRE en el DOM: React Flow mide los
  // anclajes (handleBounds) en el mount del nodo; si se montan solo en
  // modo edición, la conexión por arrastre falla (getHandle no los
  // encuentra). En lectura se mantienen invisibles e inertes.
  const visible = ctx.editable && (ctx.tool === 'select' || ctx.tool === 'connector');
  const hidden = visible ? '' : '!pointer-events-none !opacity-0';
  return (
    <>
      {(['r', 'l', 'b', 't'] as MindMapHandleDirection[]).map((dir) => (
        <AddHandle key={dir} sourceId={sourceId} dir={dir} hidden={hidden} />
      ))}
    </>
  );
}

function AddHandle({ sourceId, dir, hidden }: { sourceId: string; dir: MindMapHandleDirection; hidden: string }) {
  const ctx = useEditor();
  const pressRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  return (
    <Handle
      id={`+${dir}`}
      type="source"
      position={ADD_POSITION[dir]}
      className={cn(
        'z-10 grid !size-5 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-opacity duration-150 hover:border-primary hover:bg-primary hover:text-primary-foreground',
        hidden
      )}
      onPointerDown={(e) => {
        pressRef.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const p = pressRef.current;
        if (p && !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true;
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (pressRef.current?.moved) return;
        ctx.abrirCrear(sourceId, dir, { x: e.clientX, y: e.clientY });
      }}
      title={`Elegir nodo o forma a crear, o arrastrar para conectar (${dir === 'r' ? 'derecha' : dir === 'l' ? 'izquierda' : dir === 'b' ? 'abajo' : 'arriba'})`}
      aria-label={`Crear nodo conectado ${dir}`}
    >
      <Plus className="size-3.5" />
    </Handle>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  const color = priorityColor(priority);
  if (!color || !priority) return null;
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-xs font-medium leading-none text-white"
      style={{ backgroundColor: color }}
    >
      {etiquetaPrioridad(priority)}
    </span>
  );
}

/** Enfoca y selecciona el texto cuando el nodo entra en edición inline. */
function useFocoEdicion(id: string) {
  const ctx = useEditor();
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const editando = ctx.editId === id;
  useEffect(() => {
    if (!editando) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select?.();
  }, [editando]);
  return { editando, ref };
}

function useAtajosTitulo(id: string) {
  const ctx = useEditor();
  return {
    onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        ctx.editarNodo(null);
        return;
      }
      if (e.key === 'Enter' && (e.currentTarget.tagName !== 'TEXTAREA' || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        ctx.editarNodo(null);
        return;
      }
      if (e.key === 'Tab' && e.currentTarget.tagName !== 'TEXTAREA') {
        e.preventDefault();
        ctx.addConnected(id, e.shiftKey ? 'l' : 'r', true);
      }
    },
  };
}

export function MindMapNodeShell({
  id,
  data,
  selected,
  width,
  height,
  kind,
  children,
  resizable = true,
  marco = true,
  extraToolbar,
}: {
  id: string;
  data: MindMapNodeData;
  selected: boolean;
  width?: number;
  height?: number;
  kind: MindMapNodeKind;
  children: React.ReactNode;
  resizable?: boolean;
  /** `false` deja la figura sin caja contenedora (formas/texto). */
  marco?: boolean;
  /** Acciones adicionales en el toolbar flotante del nodo. */
  extraToolbar?: React.ReactNode;
}) {
  const ctx = useEditor();
  const dims = NODE_KINDS[kind];
  const anchoUsuario = dimensionUsuario(width);
  const altoUsuario = dimensionUsuario(height);
  return (
    <>
      {resizable && ctx.editable && (
        <NodeResizer
          isVisible={selected}
          minWidth={80}
          minHeight={40}
          color={data.color}
          onResizeStart={() => ctx.iniciarResize()}
          onResizeEnd={(_e, params) => ctx.finResize(id, params.width, params.height)}
          handleClassName="!size-2 !rounded-sm !border-border !bg-background"
          lineClassName="!border-primary/60"
        />
      )}
      <NodeToolbar position={Position.Top} offset={10}>
        {ctx.editable && (
          <div className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-md">
            {NODE_COLORS.slice(0, 8).map((c) => (
              <button
                key={c.key}
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.updateNodeData(id, { color: c.value });
                }}
                className="size-4 rounded-full border border-black/10 transition-transform hover:scale-110"
                style={{ backgroundColor: c.value }}
                title={`Color ${c.label}`}
              />
            ))}
            {extraToolbar ? (
              <>
                <div className="mx-0.5 h-4 w-px bg-border" />
                {extraToolbar}
              </>
            ) : null}
            <div className="mx-0.5 h-4 w-px bg-border" />
            <ToolbarBtn
              title="Editar texto"
              onClick={(e) => {
                e.stopPropagation();
                ctx.editarNodo(id);
              }}
            >
              <Pencil className="size-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Duplicar (Ctrl+D)"
              onClick={(e) => {
                e.stopPropagation();
                ctx.duplicar(id);
              }}
            >
              <Copy className="size-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Eliminar (Supr)"
              danger
              onClick={(e) => {
                e.stopPropagation();
                ctx.eliminar(id);
              }}
            >
              <Trash2 className="size-3.5" />
            </ToolbarBtn>
          </div>
        )}
      </NodeToolbar>
      <div
        className={cn(
          'group relative',
          marco
            ? selected
              ? 'rounded-xl border-2 shadow-lg ring-2 ring-primary/60'
              : 'rounded-xl border-2 shadow-md'
            : selected
              ? 'outline-2 outline-offset-2 outline-dashed outline-primary/70'
              : '',
          'transition-shadow'
        )}
        style={{
          ...(marco ? { borderColor: data.color, backgroundColor: `${data.color}14` } : {}),
          width: anchoUsuario ?? dims.width,
          ...(altoUsuario ? { height: altoUsuario } : {}),
        }}
      >
        <Handles />
        <AddNodeButtons sourceId={id} />
        {children}
      </div>
    </>
  );
}

function ToolbarBtn({
  children,
  title,
  onClick,
  danger,
  activo,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  activo?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        danger && 'hover:text-destructive',
        activo && 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
      )}
    >
      {children}
    </button>
  );
}

export function IdeaNode({ id, data, selected, width, height }: MindMapNodeProps) {
  const ctx = useEditor();
  const [showNotes, setShowNotes] = useState(!!data.notes);
  const { editando, ref } = useFocoEdicion(id);
  const atajos = useAtajosTitulo(id);
  return (
    <MindMapNodeShell id={id} data={data} selected={selected} width={width} height={height} kind="idea">
      <div className="px-3 py-2">
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={data.label}
          disabled={!ctx.editable}
          onChange={(e) => ctx.updateNodeData(id, { label: e.target.value })}
          onKeyDown={atajos.onKeyDown}
          onBlur={() => editando && ctx.editarNodo(null)}
          placeholder="Título"
          className="nodrag nopan w-full bg-transparent text-sm font-semibold outline-none placeholder:text-black/30"
        />
        {showNotes || data.notes ? (
          <textarea
            value={data.notes ?? ''}
            disabled={!ctx.editable}
            onChange={(e) => ctx.updateNodeData(id, { notes: e.target.value })}
            placeholder="Notas…"
            rows={2}
            className="nodrag nopan mt-1 w-full resize-none bg-transparent text-xs leading-snug outline-none placeholder:text-black/30"
          />
        ) : (
          ctx.editable && (
            <button
              onClick={() => setShowNotes(true)}
              className="nodrag nopan mt-1 text-xs text-black/40 hover:text-black/70"
            >
              + notas
            </button>
          )
        )}
        <Tags labels={data.labels} />
      </div>
    </MindMapNodeShell>
  );
}

export function TaskNode({ id, data, selected, width, height }: MindMapNodeProps) {
  const ctx = useEditor();
  const { editando, ref } = useFocoEdicion(id);
  const atajos = useAtajosTitulo(id);
  const toggle = () => ctx.updateNodeData(id, { done: !data.done });
  return (
    <MindMapNodeShell id={id} data={data} selected={selected} width={width} height={height} kind="task">
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          onClick={toggle}
          disabled={!ctx.editable}
          title={data.done ? 'Marcar pendiente' : 'Marcar completada'}
          className="nodrag nopan mt-0.5 shrink-0 text-black/50 hover:text-black"
          aria-label={data.done ? 'Marcar pendiente' : 'Marcar completada'}
        >
          {data.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            value={data.label}
            disabled={!ctx.editable}
            onChange={(e) => ctx.updateNodeData(id, { label: e.target.value })}
            onKeyDown={atajos.onKeyDown}
            onBlur={() => editando && ctx.editarNodo(null)}
            placeholder="Tarea"
            className={cn(
              'nodrag nopan w-full bg-transparent text-sm outline-none placeholder:text-black/30',
              data.done && 'text-black/40 line-through'
            )}
          />
          <div className="mt-1 flex items-center gap-1.5">
            <PriorityBadge priority={data.priority} />
            <Tags labels={data.labels} />
          </div>
        </div>
      </div>
    </MindMapNodeShell>
  );
}

export function DecisionNode({ id, data, selected, width, height }: MindMapNodeProps) {
  const ctx = useEditor();
  const { editando, ref } = useFocoEdicion(id);
  const atajos = useAtajosTitulo(id);
  return (
    <>
      {ctx.editable && (
        <NodeResizer
          isVisible={selected}
          minWidth={90}
          minHeight={90}
          color={data.color}
          onResizeStart={() => ctx.iniciarResize()}
          onResizeEnd={(_e, params) => ctx.finResize(id, params.width, params.height)}
        />
      )}
      <NodeToolbar position={Position.Top} offset={10}>
        {ctx.editable && (
          <div className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-md">
            <ToolbarBtn
              title="Editar texto"
              onClick={(e) => {
                e.stopPropagation();
                ctx.editarNodo(id);
              }}
            >
              <Pencil className="size-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Duplicar (Ctrl+D)"
              onClick={(e) => {
                e.stopPropagation();
                ctx.duplicar(id);
              }}
            >
              <Copy className="size-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Eliminar (Supr)"
              danger
              onClick={(e) => {
                e.stopPropagation();
                ctx.eliminar(id);
              }}
            >
              <Trash2 className="size-3.5" />
            </ToolbarBtn>
          </div>
        )}
      </NodeToolbar>
      <div
        className={cn(
          'group relative grid place-items-center rounded-xl',
          selected && 'ring-2 ring-primary/60'
        )}
        style={{
          width: dimensionUsuario(width) ?? NODE_KINDS.decision.width,
          height: dimensionUsuario(height) ?? NODE_KINDS.decision.height,
        }}
      >
        <Handles />
        <AddNodeButtons sourceId={id} />
        <div
          className="grid place-items-center rotate-45 rounded-lg border-2 shadow-md"
          style={{
            width: '62%',
            height: '62%',
            borderColor: data.color,
            backgroundColor: `${data.color}14`,
          }}
        >
          <div className="-rotate-45">
            <input
              ref={ref as React.RefObject<HTMLInputElement>}
              value={data.label}
              disabled={!ctx.editable}
              onChange={(e) => ctx.updateNodeData(id, { label: e.target.value })}
              onKeyDown={atajos.onKeyDown}
              onBlur={() => editando && ctx.editarNodo(null)}
              placeholder="?"
              className="nodrag nopan w-20 bg-transparent text-center text-xs font-bold outline-none placeholder:text-black/30"
            />
          </div>
        </div>
      </div>
    </>
  );
}

export function NoteNode({ id, data, selected, width, height }: MindMapNodeProps) {
  const ctx = useEditor();
  const { editando, ref } = useFocoEdicion(id);
  const atajos = useAtajosTitulo(id);
  return (
    <MindMapNodeShell id={id} data={data} selected={selected} width={width} height={height} kind="note">
      <div className="px-3 py-2">
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={data.label}
          disabled={!ctx.editable}
          onChange={(e) => ctx.updateNodeData(id, { label: e.target.value })}
          onKeyDown={atajos.onKeyDown}
          onBlur={() => editando && ctx.editarNodo(null)}
          placeholder="Título"
          className="nodrag nopan w-full bg-transparent text-xs font-bold uppercase tracking-wide outline-none placeholder:text-black/30"
        />
        <textarea
          value={data.notes ?? ''}
          disabled={!ctx.editable}
          onChange={(e) => ctx.updateNodeData(id, { notes: e.target.value })}
          placeholder="Escribe aquí…"
          rows={3}
          className="nodrag nopan mt-1 w-full resize-none bg-transparent text-xs leading-snug outline-none placeholder:text-black/30"
        />
        <Tags labels={data.labels} />
      </div>
    </MindMapNodeShell>
  );
}

export function ImageNode({ id, data, selected, width, height }: MindMapNodeProps) {
  const ctx = useEditor();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | null) => {
    if (!file || !ctx.editable || busy) return;
    setBusy(true);
    try {
      const url = await ctx.uploadImage(file);
      if (url) ctx.updateNodeData(id, { image: { url, alt: data.label } });
    } finally {
      setBusy(false);
    }
  };
  return (
    <MindMapNodeShell
      id={id}
      data={data}
      selected={selected}
      width={width}
      height={height}
      kind="image"
    >
      <div
        className="relative overflow-hidden rounded-[10px]"
        style={{
          width: '100%',
          height: height ?? NODE_KINDS.image.height,
        }}
      >
        {data.image?.url ? (
          <img
            src={data.image.url}
            alt={data.image.alt ?? data.label}
            className="size-full object-cover"
            draggable={false}
          />
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={!ctx.editable || busy}
            className="nodrag nopan grid size-full place-items-center gap-1 text-black/40 hover:text-black/70"
            title="Subir imagen"
          >
            <ImagePlus className="size-6" />
            <span className="text-xs">{busy ? 'Subiendo…' : 'Subir imagen'}</span>
          </button>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/40 px-2 py-1">
          <input
            value={data.label}
            disabled={!ctx.editable}
            onChange={(e) => ctx.updateNodeData(id, { label: e.target.value })}
            className="nodrag nopan w-full bg-transparent text-xs font-medium text-white outline-none placeholder:text-white/50"
            placeholder="Nombre"
          />
          {ctx.editable && data.image?.url && (
            <button
              onClick={() => inputRef.current?.click()}
              className="nodrag nopan shrink-0 text-white/70 hover:text-white"
              title="Cambiar imagen"
            >
              <ImagePlus className="size-3.5" />
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </div>
    </MindMapNodeShell>
  );
}

/** Formas básicas estilo Excalidraw (rect/elipse/rombo/triángulo). */
export function ShapeNode({ id, data, selected, width, height }: MindMapNodeProps) {
  const ctx = useEditor();
  const { editando, ref } = useFocoEdicion(id);
  const atajos = useAtajosTitulo(id);
  const anchoUsuario = dimensionUsuario(width);
  const altoUsuario = dimensionUsuario(height);
  const w = anchoUsuario ?? NODE_KINDS.shape.width;
  const h = altoUsuario ?? NODE_KINDS.shape.height;
  const shape = data.shape ?? 'rect';
  return (
    <MindMapNodeShell
      id={id}
      data={data}
      selected={selected}
      width={w}
      height={h}
      kind="shape"
      marco={false}
      extraToolbar={
        <>
          {SHAPE_OPTIONS.map((s) => {
            const Icon = SHAPE_ICONS[s.key];
            return (
              <ToolbarBtn
                key={s.key}
                title={`Forma: ${s.label}`}
                activo={shape === s.key}
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.updateNodeData(id, { shape: s.key });
                }}
              >
                <Icon className="size-3.5" />
              </ToolbarBtn>
            );
          })}
        </>
      }
    >
      <div className="relative grid size-full place-items-center" style={{ width: '100%', height: h }}>
        <FormaSVG
          shape={shape}
          color={data.color}
          className="pointer-events-none absolute inset-0"
        />
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={data.label}
          disabled={!ctx.editable}
          onChange={(e) => ctx.updateNodeData(id, { label: e.target.value })}
          onKeyDown={atajos.onKeyDown}
          onBlur={() => editando && ctx.editarNodo(null)}
          placeholder="Texto"
          className="nodrag nopan relative z-10 w-[80%] bg-transparent text-center text-sm font-medium outline-none placeholder:text-black/30"
        />
      </div>
    </MindMapNodeShell>
  );
}

/** Texto libre sin caja (estilo Excalidraw). */
export function TextNode({ id, data, selected, width, height }: MindMapNodeProps) {
  const ctx = useEditor();
  const { editando, ref } = useFocoEdicion(id);
  const atajos = useAtajosTitulo(id);
  const fontSize = data.fontSize ?? DEFAULT_FONT_SIZE;
  const anchoUsuario = dimensionUsuario(width);
  const altoUsuario = dimensionUsuario(height);
  return (
    <>
      {ctx.editable && (
        <NodeResizer
          isVisible={selected}
          minWidth={60}
          minHeight={30}
          onResizeStart={() => ctx.iniciarResize()}
          onResizeEnd={(_e, params) => ctx.finResize(id, params.width, params.height)}
        />
      )}
      <div
        className={cn(
          'group relative rounded-md border-2 border-transparent px-1 py-0.5',
          selected && 'border-dashed border-primary/60 ring-1 ring-primary/40'
        )}
        style={{ width: anchoUsuario ?? NODE_KINDS.text.width, ...(altoUsuario ? { height: altoUsuario } : {}) }}
      >
        <Handles />
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={data.label}
          disabled={!ctx.editable}
          onChange={(e) => ctx.updateNodeData(id, { label: e.target.value })}
          onKeyDown={atajos.onKeyDown}
          onBlur={() => editando && ctx.editarNodo(null)}
          placeholder="Texto…"
          rows={1}
          className="nodrag nopan w-full resize-none bg-transparent leading-snug outline-none placeholder:text-black/30"
          style={{ fontSize, color: data.color }}
        />
      </div>
    </>
  );
}

/** Trazo libre: puntos locales renderizados como SVG redondeado. */
export function DrawNode({ id, data, selected, width, height }: MindMapNodeProps) {
  const ctx = useEditor();
  const w = dimensionUsuario(width) ?? NODE_KINDS.draw.width;
  const h = dimensionUsuario(height) ?? NODE_KINDS.draw.height;
  const puntos = data.points ?? [];
  const color = data.color;
  const grosor = data.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  const d = puntos.length > 1
    ? puntos.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    : '';
  return (
    <>
      {ctx.editable && (
        <NodeResizer
          isVisible={selected}
          minWidth={40}
          minHeight={40}
          color={color}
          onResizeStart={() => ctx.iniciarResize()}
          onResizeEnd={(_e, params) => ctx.finResize(id, params.width, params.height)}
        />
      )}
      <NodeToolbar position={Position.Top} offset={10}>
        {ctx.editable && (
          <div className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-md">
            {NODE_COLORS.slice(0, 8).map((c) => (
              <button
                key={c.key}
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.updateNodeData(id, { color: c.value });
                }}
                className="size-4 rounded-full border border-black/10 transition-transform hover:scale-110"
                style={{ backgroundColor: c.value }}
                title={`Color ${c.label}`}
              />
            ))}
            <div className="mx-0.5 h-4 w-px bg-border" />
            <ToolbarBtn
              title="Duplicar (Ctrl+D)"
              onClick={(e) => {
                e.stopPropagation();
                ctx.duplicar(id);
              }}
            >
              <Copy className="size-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Eliminar (Supr)"
              danger
              onClick={(e) => {
                e.stopPropagation();
                ctx.eliminar(id);
              }}
            >
              <Trash2 className="size-3.5" />
            </ToolbarBtn>
          </div>
        )}
      </NodeToolbar>
      <div
        className={cn('group relative', selected && 'ring-2 ring-primary/50 rounded-md')}
        style={{ width: w, height: h }}
      >
        <Handles />
        <AddNodeButtons sourceId={id} />
        <svg className="size-full overflow-visible" viewBox={`0 0 ${w} ${h}`} aria-hidden>
          {d && (
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={grosor}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-auto"
            />
          )}
        </svg>
      </div>
    </>
  );
}

export function EditorContextProvider({
  value,
  children,
}: {
  value: MindMapEditorContextValue;
  children: React.ReactNode;
}) {
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export const MIND_MAP_NODE_TYPES = {
  idea: IdeaNode,
  task: TaskNode,
  decision: DecisionNode,
  note: NoteNode,
  image: ImageNode,
  shape: ShapeNode,
  text: TextNode,
  draw: DrawNode,
};
