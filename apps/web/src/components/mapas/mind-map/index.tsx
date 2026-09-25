'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ViewportPortal,
  SelectionMode,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
  useOnSelectionChange,
  useReactFlow,
  MarkerType,
  ConnectionLineType,
  ConnectionMode,
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '@/components/mapas/mind-map.css';
import {
  Undo2,
  Redo2,
  Trash2,
  Loader2,
  LayoutTemplate,
  Info,
  Keyboard,
  Lightbulb,
  Shapes,
  Waypoints,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api/cliente';
import { findEntityByParam } from '@/lib/slugs';
import { useTareas } from '@/components/tareas/tareas-context';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MIND_MAP_NODE_TYPES,
  EditorContextProvider,
  FormaSVG,
  type HerramientaMapa,
  type MindMapEditorContextValue,
} from '@/components/mapas/mind-map-nodes';
import {
  connectedNodePosition,
  createDrawNode,
  createNode,
  handleDirectionBetween,
  nodeDimensions,
  oppositeHandle,
  parseSnapshot,
  type MindMapHandleDirection,
} from '@/lib/mindmap';
import { getTemplate, MIND_MAP_TEMPLATES } from '@/lib/mindmap-templates';
import { NODE_KINDS, PRIORITY_OPTIONS, etiquetaPrioridad, priorityColor } from '@/lib/mindmap-config';
import {
  alinearNodos,
  disposicionArbol,
  distribuirNodos,
  rectsDesdeSnapshot,
  type DireccionArbol,
  type GuiaMapa,
  type ModoAlineacion,
} from '@/lib/mindmap-layout';
import { RemoteCursorsLayer } from '@/components/mapas/remote-cursors';
import { ShareButton } from '@/components/tareas/share-entity-dialog';
import type {
  MindMapNodeData,
  MindMapNodeKind,
  MindMapShape,
  MindMapSnapshot,
} from '@/types';
import {
  DEFAULT_EDGE_DATA,
  snapshotFrom,
  toFlowEdges,
  toFlowNodes,
  type FlowEdge,
  type FlowNode,
  type MapEdgeData,
} from './flow';
import { MIND_MAP_EDGE_TYPES } from './edge';
import { usePersistenciaMapa } from './use-persistencia';
import { useHistorialMapa } from './use-historial';
import { useColaboracionMapa } from './use-colaboracion';
import { useAtajosMapa } from './use-atajos';
import { usePortapapelesMapa } from './use-portapapeles';
import { useGuiasAlineacion } from './use-guias';
import { BarraHerramientas } from './barra-herramientas';
import { BarraSeleccion, type EdgeSeleccionado } from './barra-seleccion';
import {
  BarraHerramientas as BarraHerramientasEntidad,
  BotonHerramienta,
  SeparadorHerramienta,
} from '@/components/entidad/barra-herramientas';
import { CabeceraEntidad } from '@/components/entidad/cabecera-entidad';
import { EntidadPagina } from '@/components/entidad/entidad-pagina';
import { ToggleModoEntidad } from '@/components/entidad/toggle-modo-entidad';
import { IndicadorGuardado } from '@/components/entidad/indicador-guardado';
import { AvisoSoloLectura } from '@/components/entidad/aviso-solo-lectura';
import {
  MenuContextualMapa,
  type AccionesMenuMapa,
  type FondoMapa,
  type MenuMapa,
} from './menu-contextual';

const TOOL_BTN =
  'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent';

const VARIANTE_FONDO: Record<Exclude<FondoMapa, 'none'>, BackgroundVariant> = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
};

export function MindMapCanvas({ mapId: paramMapId }: { mapId: string }) {
  const router = useRouter();
  const { setViewport, screenToFlowPosition, fitView } = useReactFlow();
  const ctx = useTareas();
  const map = ctx.loading ? undefined : findEntityByParam(paramMapId, ctx.mindmaps);
  const mapId = map?.id ?? (ctx.loading ? null : paramMapId);
  const canWrite = ctx.canWrite('mindmap', mapId ?? paramMapId);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const editable = canWrite && mode === 'edit';

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [tool, setTool] = useState<HerramientaMapa>('select');
  const [editId, setEditId] = useState<string | null>(null);
  const [edgeEditId, setEdgeEditId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuMapa | null>(null);
  const [fondo, setFondo] = useState<FondoMapa>('dots');
  const [guias, setGuias] = useState<GuiaMapa[]>([]);
  const [conectorOrigen, setConectorOrigen] = useState<string | null>(null);
  const [trazoPreview, setTrazoPreview] = useState<number[][] | null>(null);
  const [formaPendiente, setFormaPendiente] = useState<MindMapShape | null>(null);
  const [puntoFantasma, setPuntoFantasma] = useState<{ x: number; y: number } | null>(null);

  const nodesRef = useRef<FlowNode[]>([]);
  const edgesRef = useRef<FlowEdge[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const punteroRef = useRef<{ x: number; y: number } | null>(null);
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const trazoRef = useRef<number[][] | null>(null);
  const trazoLocalRef = useRef<number[][]>([]);
  const trazoRafRef = useRef<number | null>(null);
  const ultimoPushTextoRef = useRef(0);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const currentSnapshot = useCallback(
    () => snapshotFrom(nodesRef.current, edgesRef.current),
    []
  );

  const {
    saveState,
    dirtyRef,
    viewportRef,
    marcarSucio,
    programarGuardado,
    resetGuardado,
  } = usePersistenciaMapa({ mapId, currentSnapshot });

  const { pushHistory, undo, redo, canUndo, canRedo, resetHistorial } = useHistorialMapa({
    currentSnapshot,
    setNodes,
    setEdges,
    marcarSucio,
  });

  const onMapaEliminado = useCallback(() => {
    router.replace('/proyectos');
  }, [router]);

  const { emit, throttledEmit, remoteCursors } = useColaboracionMapa({
    mapId,
    currentUserId: ctx.currentUserId,
    collaborators: ctx.collaborators,
    setNodes,
    setEdges,
    onMapaEliminado,
  });

  /** Punto único de mutación estructural: historial + sucio. */
  const antesDeCambiar = useCallback(() => {
    pushHistory(currentSnapshot());
  }, [pushHistory, currentSnapshot]);

  const { calcularSnap } = useGuiasAlineacion({ nodesRef, setGuias });

  // Carga inicial: content fresco desde la BD (el contexto puede estar
  // stale tras navegación SPA entre vistas del árbol)
  useEffect(() => {
    if (!mapId) return;
    let cancelled = false;
    const load = async () => {
      const res = await apiFetch<{ contenido: unknown }>(`/mapas/${mapId}/contenido`).catch(() => null);
      if (cancelled) return;
      const snap = parseSnapshot(res?.contenido);
      setNodes(toFlowNodes(snap));
      setEdges(toFlowEdges(snap));
      setLoaded(true);
      viewportRef.current = snap.viewport;
      if (snap.viewport) {
        setViewport(snap.viewport);
      }
      resetHistorial();
      resetGuardado();
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [mapId, setViewport, resetHistorial, resetGuardado, viewportRef]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      // Snap magnético: solo con un único nodo seleccionado y herramienta
      // de selección (evita desincronizar arrastres múltiples). Se calcula
      // fuera del updater de estado: los updaters deben ser puros.
      const ajustados = changes.map((c) => {
        if (
          c.type === 'position' &&
          c.dragging === true &&
          c.position &&
          editable &&
          tool === 'select' &&
          selectedIdsRef.current.length === 1
        ) {
          const pos = calcularSnap(c.id, c.position);
          if (pos.x !== c.position.x || pos.y !== c.position.y) {
            return { ...c, position: pos };
          }
        }
        return c;
      });
      const enDrag = ajustados.some((c) => c.type === 'position' && c.dragging === true);
      if (!enDrag) setGuias([]);
      // Arrastre en vivo (broadcast con throttle) desde los cambios
      // de posición del propio drag.
      const dragging = ajustados.find(
        (c): c is Extract<NodeChange<FlowNode>, { type: 'position' }> =>
          c.type === 'position' && c.dragging === true
      );
      if (dragging && editable && dragging.position) {
        const pos = dragging.position;
        throttledEmit('drag', 50, () => ({ t: 'move', id: dragging.id, position: pos }));
      }
      const meaningful = ajustados.some(
        (c) => c.type === 'remove' || (c.type === 'position' && !c.dragging) || c.type === 'dimensions'
      );
      setNodes((nds) => applyNodeChanges(ajustados, nds));
      if (meaningful) marcarSucio();
    },
    [marcarSucio, editable, throttledEmit, tool, calcularSnap]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds) as FlowEdge[];
        const meaningful = changes.some((c) => c.type === 'remove');
        if (meaningful) {
          marcarSucio();
        }
        return next;
      });
    },
    [marcarSucio]
  );

  const crearEdge = useCallback(
    (source: string, target: string, sourceHandle: string | null, targetHandle: string | null): FlowEdge => ({
      id: `e-${crypto.randomUUID()}`,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: 'mapa',
      data: { ...DEFAULT_EDGE_DATA },
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    }),
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!editable || tool === 'hand' || tool === 'pencil') return;
      const source = connection.source ?? '';
      const target = connection.target ?? '';
      if (!source || !target) return;
      // Dedupe: un par de nodos solo se conecta una vez (en cualquier dirección)
      const alreadyConnected = edgesRef.current.some(
        (e) =>
          (e.source === source && e.target === target) ||
          (e.source === target && e.target === source)
      );
      if (alreadyConnected) return;
      const cleanHandle = (h: string | null | undefined) =>
        h?.startsWith('+') ? h.slice(1) : h ?? null;
      const newEdge = crearEdge(
        source,
        target,
        cleanHandle(connection.sourceHandle),
        cleanHandle(connection.targetHandle)
      );
      antesDeCambiar();
      setEdges((eds) => [...eds, newEdge]);
      emit({ t: 'edge-add', edge: newEdge });
      marcarSucio();
    },
    [antesDeCambiar, marcarSucio, emit, editable, tool, crearEdge]
  );

  const onReconnect = useCallback(
    (oldEdge: FlowEdge, connection: Connection) => {
      if (!editable) return;
      const cleanHandle = (h: string | null | undefined) =>
        h?.startsWith('+') ? h.slice(1) : h ?? null;
      const newEdge: FlowEdge = {
        ...oldEdge,
        source: connection.source,
        target: connection.target,
        sourceHandle: cleanHandle(connection.sourceHandle),
        targetHandle: cleanHandle(connection.targetHandle),
      };
      antesDeCambiar();
      setEdges((eds) => reconnectEdge(oldEdge, connection, eds));
      emit({ t: 'edge-del', ids: [oldEdge.id] });
      emit({ t: 'edge-add', edge: newEdge });
      marcarSucio();
    },
    [editable, antesDeCambiar, emit, marcarSucio]
  );

  const onNodeDragStart = useCallback(() => {
    if (!editable) return;
    antesDeCambiar();
  }, [editable, antesDeCambiar]);

  const onNodeDragStop = useCallback(() => {
    if (!editable) return;
    setGuias([]);
    marcarSucio();
  }, [editable, marcarSucio]);

  const onNodesDelete = useCallback(
    (deleted: FlowNode[]) => {
      if (!editable) return;
      antesDeCambiar();
      emit({ t: 'node-del', ids: deleted.map((n) => n.id) });
      marcarSucio();
    },
    [antesDeCambiar, marcarSucio, emit, editable]
  );

  const onEdgesDelete = useCallback(
    (deleted: FlowEdge[]) => {
      if (!editable) return;
      antesDeCambiar();
      emit({ t: 'edge-del', ids: deleted.map((e) => e.id) });
      marcarSucio();
    },
    [antesDeCambiar, marcarSucio, emit, editable]
  );

  const onMoveEnd = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
      viewportRef.current = viewport;
      if (!event) return;
      dirtyRef.current = true;
      programarGuardado();
    },
    [dirtyRef, viewportRef, programarGuardado]
  );

  useOnSelectionChange({
    onChange: ({ nodes: sel, edges: selEdges }) => {
      setSelectedIds(sel.map((n) => n.id));
      setSelectedEdgeIds(selEdges.map((e) => e.id));
    },
  });

  // Hover sobre nodo: resalta sus edges conectados (flujo animado)
  const highlightEdgesOf = useCallback(
    (nodeIds: Set<string>, on: boolean) => {
      setEdges((eds) =>
        eds.map((e) =>
          nodeIds.has(e.source) || nodeIds.has(e.target) ? { ...e, animated: on } : e
        )
      );
    },
    [setEdges]
  );

  const onNodeMouseEnter = useCallback(
    (_: unknown, node: { id: string }) => highlightEdgesOf(new Set([node.id]), true),
    [highlightEdgesOf]
  );

  const onNodeMouseLeave = useCallback(
    (_: unknown, node: { id: string }) => highlightEdgesOf(new Set([node.id]), false),
    [highlightEdgesOf]
  );

  const onEdgeMouseEnter = useCallback(
    (_: unknown, edge: { id: string }) => {
      setEdges((eds) => eds.map((e) => (e.id === edge.id ? { ...e, animated: true } : e)));
    },
    [setEdges]
  );

  const onEdgeMouseLeave = useCallback(
    (_: unknown, edge: { id: string }) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === edge.id && !e.selected ? { ...e, animated: false } : e))
      );
    },
    [setEdges]
  );

  const insertarSnapshot = useCallback(
    (snap: MindMapSnapshot, seleccionar: boolean) => {
      const nuevosNodos = toFlowNodes(snap).map((n) => ({ ...n, selected: seleccionar }));
      const nuevosEdges = toFlowEdges(snap);
      setNodes((nds) => [
        ...(seleccionar ? nds.map((n) => ({ ...n, selected: false })) : nds),
        ...nuevosNodos,
      ]);
      setEdges((eds) => [
        ...(seleccionar ? eds.map((e) => ({ ...e, selected: false })) : eds),
        ...nuevosEdges,
      ]);
      nuevosNodos.forEach((n) => emit({ t: 'node-add', node: n }));
      nuevosEdges.forEach((e) => emit({ t: 'edge-add', edge: e }));
      marcarSucio();
    },
    [emit, marcarSucio]
  );

  const eliminarSeleccion = useCallback(() => {
    if (!editable) return;
    const hasNodes = selectedIds.length > 0;
    const hasEdges = selectedEdgeIds.length > 0;
    if (!hasNodes && !hasEdges) return;
    antesDeCambiar();
    if (hasNodes) {
      setNodes((nds) => nds.filter((n) => !selectedIds.includes(n.id)));
      setEdges((eds) =>
        eds.filter((e) => !selectedIds.includes(e.source) && !selectedIds.includes(e.target))
      );
      emit({ t: 'node-del', ids: selectedIds });
    } else {
      setEdges((eds) => eds.filter((e) => !selectedEdgeIds.includes(e.id)));
      emit({ t: 'edge-del', ids: selectedEdgeIds });
    }
    marcarSucio();
  }, [
    selectedIds,
    selectedEdgeIds,
    editable,
    antesDeCambiar,
    marcarSucio,
    emit,
  ]);

  const eliminarNodo = useCallback(
    (id: string) => {
      if (!editable) return;
      antesDeCambiar();
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      emit({ t: 'node-del', ids: [id] });
      marcarSucio();
    },
    [editable, antesDeCambiar, marcarSucio, emit]
  );

  const {
    copiar,
    cortar,
    pegar,
    duplicarSeleccion,
    duplicarNodo,
    hayContenido,
  } = usePortapapelesMapa({
    snapshotActual: currentSnapshot,
    selectedIds,
    selectedEdgeIds,
    punteroRef,
    antesDeCambiar,
    insertarSnapshot,
    eliminarSeleccion,
  });

  const applyToSelected = useCallback(
    (patch: Partial<MindMapNodeData>) => {
      if (selectedIds.length === 0 || !editable) return;
      antesDeCambiar();
      setNodes((nds) =>
        nds.map((n) => (selectedIds.includes(n.id) ? { ...n, data: { ...n.data, ...patch } } : n))
      );
      selectedIds.forEach((id) => emit({ t: 'data', id, patch }));
      marcarSucio();
    },
    [selectedIds, editable, antesDeCambiar, marcarSucio, emit]
  );

  const updateNodeData = useCallback(
    (id: string, patch: Partial<MindMapNodeData>) => {
      // Coalesce de historial al escribir: máximo un snapshot por ráfaga.
      const ahora = Date.now();
      if (ahora - ultimoPushTextoRef.current > 800) {
        pushHistory(currentSnapshot());
        ultimoPushTextoRef.current = ahora;
      }
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
      );
      emit({ t: 'data', id, patch });
      marcarSucio();
    },
    [pushHistory, currentSnapshot, marcarSucio, emit]
  );

  const addNodeEn = useCallback(
    (
      kind: MindMapNodeKind,
      pos: { x: number; y: number },
      overrides?: Partial<MindMapNodeData>
    ) => {
      if (!editable) return;
      const id = crypto.randomUUID();
      const n = createNode(kind, id, pos.x, pos.y, overrides);
      const flowNode: FlowNode = {
        id,
        type: kind,
        position: { x: n.x, y: n.y },
        data: n.data,
        ...(kind === 'draw' ? { width: n.width, height: n.height } : {}),
      };
      antesDeCambiar();
      setNodes((nds) => [...nds, flowNode]);
      emit({ t: 'node-add', node: flowNode });
      marcarSucio();
      // Texto: entra directo a edición, como en Excalidraw.
      if (kind === 'text') {
        setTool('select');
        setEditId(id);
      }
    },
    [editable, antesDeCambiar, marcarSucio, emit]
  );

  const agregarNodoCentro = useCallback(
    (kind: MindMapNodeKind, overrides?: Partial<MindMapNodeData>) => {
      const centro = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      addNodeEn(kind, centro, overrides);
    },
    [addNodeEn, screenToFlowPosition]
  );

  const cambiarForma = useCallback(
    (id: string, shape: MindMapShape) => {
      if (!editable) return;
      antesDeCambiar();
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, shape } } : n))
      );
      emit({ t: 'data', id, patch: { shape } });
      marcarSucio();
    },
    [editable, antesDeCambiar, marcarSucio, emit]
  );

  const addConnected = useCallback(
    (
      sourceId: string,
      dir: MindMapHandleDirection,
      editar = false,
      kind?: MindMapNodeKind,
      overrides?: Partial<MindMapNodeData>
    ) => {
      if (!editable) return;
      const src = nodesRef.current.find((n) => n.id === sourceId);
      if (!src) return;
      const id = crypto.randomUUID();
      const tipoNuevo = kind ?? src.type;
      // El anclaje se calcula con la caja del nodo origen; el nuevo nodo se
      // centra en esa misma posición aunque su tipo tenga otras dimensiones.
      const pos = connectedNodePosition(src.type, src.position.x, src.position.y, dir);
      const dimsOrigen = nodeDimensions({ type: src.type, width: src.width, height: src.height });
      const n = createNode(
        tipoNuevo,
        id,
        pos.x + dimsOrigen.width / 2,
        pos.y + dimsOrigen.height / 2,
        overrides
      );
      const flowNode: FlowNode = {
        id,
        type: tipoNuevo,
        position: { x: n.x, y: n.y },
        data: n.data,
        selected: true,
      };
      const newEdge = crearEdge(sourceId, id, dir, dir);
      antesDeCambiar();
      setNodes((nds) => [...nds.map((x) => ({ ...x, selected: false })), flowNode]);
      setEdges((eds) => [...eds, newEdge]);
      emit({ t: 'node-add', node: flowNode });
      emit({ t: 'edge-add', edge: newEdge });
      marcarSucio();
      if (editar) setEditId(id);
    },
    [editable, antesDeCambiar, marcarSucio, emit, crearEdge]
  );

  const abrirCrear = useCallback(
    (sourceId: string, dir: MindMapHandleDirection, pos: { x: number; y: number }) => {
      setMenu({ tipo: 'crear', x: pos.x, y: pos.y, sourceId, dir });
    },
    []
  );

  const actualizarEdge = useCallback(
    (id: string, patch: Partial<MapEdgeData> & { label?: string | null }) => {
      if (!editable) return;
      antesDeCambiar();
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== id) return e;
          const data: MapEdgeData = {
            kind: patch.kind ?? e.data?.kind ?? 'bezier',
            dashed: patch.dashed ?? e.data?.dashed ?? false,
            arrow: patch.arrow ?? e.data?.arrow ?? true,
          };
          return {
            ...e,
            data,
            label: 'label' in patch ? patch.label ?? undefined : e.label,
            markerEnd: data.arrow
              ? { type: MarkerType.ArrowClosed, width: 18, height: 18 }
              : undefined,
          };
        })
      );
      emit({ t: 'edge-update', id, edgePatch: patch });
      marcarSucio();
    },
    [editable, antesDeCambiar, marcarSucio, emit]
  );

  const invertirEdge = useCallback(
    (id: string) => {
      if (!editable) return;
      const actual = edgesRef.current.find((e) => e.id === id);
      if (!actual) return;
      const nuevo: FlowEdge = {
        ...actual,
        source: actual.target,
        target: actual.source,
        sourceHandle: actual.targetHandle,
        targetHandle: actual.sourceHandle,
      };
      antesDeCambiar();
      setEdges((eds) => eds.map((e) => (e.id === id ? nuevo : e)));
      emit({ t: 'edge-del', ids: [id] });
      emit({ t: 'edge-add', edge: nuevo });
      marcarSucio();
    },
    [editable, antesDeCambiar, marcarSucio, emit]
  );

  const aplicarPosiciones = useCallback(
    (posiciones: Map<string, { x: number; y: number }>) => {
      if (posiciones.size === 0) return;
      antesDeCambiar();
      setNodes((nds) =>
        nds.map((n) => {
          const p = posiciones.get(n.id);
          return p ? { ...n, position: p } : n;
        })
      );
      emit({ t: 'nodes-pos', positions: Object.fromEntries(posiciones) });
      setGuias([]);
      marcarSucio();
    },
    [antesDeCambiar, marcarSucio, emit]
  );

  const alinear = useCallback(
    (modo: ModoAlineacion) => {
      const snap = currentSnapshot();
      const seleccionados = new Set(selectedIds);
      const rects = rectsDesdeSnapshot(snap.nodes).filter((r) => seleccionados.has(r.id));
      if (rects.length < 2) return;
      aplicarPosiciones(alinearNodos(rects, modo));
    },
    [currentSnapshot, selectedIds, aplicarPosiciones]
  );

  const distribuir = useCallback(
    (eje: 'horizontal' | 'vertical') => {
      const snap = currentSnapshot();
      const seleccionados = new Set(selectedIds);
      const rects = rectsDesdeSnapshot(snap.nodes).filter((r) => seleccionados.has(r.id));
      if (rects.length < 3) return;
      aplicarPosiciones(distribuirNodos(rects, eje));
    },
    [currentSnapshot, selectedIds, aplicarPosiciones]
  );

  const autoOrganizar = useCallback(
    (dir: DireccionArbol) => {
      const snap = currentSnapshot();
      if (snap.nodes.length === 0) return;
      const raiz =
        selectedIds.length === 1
          ? selectedIds[0]
          : undefined;
      const posiciones = disposicionArbol(rectsDesdeSnapshot(snap.nodes), snap.edges, {
        direccion: dir,
        raizId: raiz,
      });
      aplicarPosiciones(posiciones);
    },
    [currentSnapshot, selectedIds, aplicarPosiciones]
  );

  const moverSeleccion = useCallback(
    (dx: number, dy: number) => {
      if (!editable || selectedIds.length === 0) return;
      antesDeCambiar();
      const posiciones = new Map<string, { x: number; y: number }>();
      selectedIds.forEach((id) => {
        const n = nodesRef.current.find((x) => x.id === id);
        if (n) posiciones.set(id, { x: n.position.x + dx, y: n.position.y + dy });
      });
      setNodes((nds) =>
        nds.map((n) => {
          const p = posiciones.get(n.id);
          return p ? { ...n, position: p } : n;
        })
      );
      if (posiciones.size > 0) {
        emit({ t: 'nodes-pos', positions: Object.fromEntries(posiciones) });
      }
      marcarSucio();
    },
    [editable, selectedIds, antesDeCambiar, marcarSucio, emit]
  );

  const seleccionarTodo = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
  }, []);

  const escapar = useCallback(() => {
    setEditId(null);
    setEdgeEditId(null);
    setConectorOrigen(null);
    setFormaPendiente(null);
    setPuntoFantasma(null);
    setGuias([]);
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
  }, []);

  const traerFrente = useCallback((id: string) => {
    setNodes((nds) => {
      const max = Math.max(0, ...nds.map((n) => n.zIndex ?? 0));
      return nds.map((n) => (n.id === id ? { ...n, zIndex: max + 1 } : n));
    });
  }, []);

  const enviarFondo = useCallback((id: string) => {
    setNodes((nds) => {
      const min = Math.min(0, ...nds.map((n) => n.zIndex ?? 0));
      return nds.map((n) => (n.id === id ? { ...n, zIndex: min - 1 } : n));
    });
  }, []);

  const finResize = useCallback(
    (id: string, width: number, height: number) => {
      emit({ t: 'node-size', id, width, height });
      marcarSucio();
    },
    [emit, marcarSucio]
  );

  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      const form = new FormData();
      form.append('archivo', file);
      try {
        const res = await apiFetch<{ url: string }>('/storage/mindmap-imagenes', {
          method: 'POST',
          body: form,
        });
        return res.url;
      } catch {
        toast.error('No se pudo subir la imagen');
        return null;
      }
    },
    []
  );

  const editorValue: MindMapEditorContextValue = useMemo(
    () => ({
      editable,
      tool,
      editId,
      edgeEditId,
      updateNodeData,
      uploadImage,
      addConnected,
      abrirCrear,
      duplicar: duplicarNodo,
      eliminar: eliminarNodo,
      editarNodo: setEditId,
      actualizarEdge,
      editarEdge: setEdgeEditId,
      iniciarResize: antesDeCambiar,
      finResize,
    }),
    [
      editable,
      tool,
      editId,
      edgeEditId,
      updateNodeData,
      uploadImage,
      addConnected,
      abrirCrear,
      duplicarNodo,
      eliminarNodo,
      actualizarEdge,
      antesDeCambiar,
      finResize,
    ]
  );

  const applyEdgeLabel = useCallback(() => {
    if (selectedEdgeIds.length === 0) return;
    if (selectedEdgeIds.length === 1) {
      actualizarEdge(selectedEdgeIds[0], { label: labelInput.trim() || null });
    }
    setLabelInput('');
  }, [selectedEdgeIds, labelInput, actualizarEdge]);

  const clearEdgeLabel = useCallback(() => {
    if (selectedEdgeIds.length === 0) return;
    antesDeCambiar();
    setEdges((eds) =>
      eds.map((e) => (selectedEdgeIds.includes(e.id) ? { ...e, label: undefined } : e))
    );
    setLabelInput('');
    marcarSucio();
  }, [selectedEdgeIds, antesDeCambiar, marcarSucio]);

  const applyTemplate = useCallback(
    (templateId: string) => {
      const snap = getTemplate(templateId).build();
      antesDeCambiar();
      setNodes(toFlowNodes(snap));
      setEdges(toFlowEdges(snap));
      marcarSucio();
    },
    [antesDeCambiar, marcarSucio]
  );

  const addLabelToSelected = useCallback(() => {
    const label = labelInput.trim().toLowerCase();
    if (!label || selectedIds.length === 0) return;
    antesDeCambiar();
    setNodes((nds) =>
      nds.map((n) =>
        selectedIds.includes(n.id) && !n.data.labels.includes(label)
          ? { ...n, data: { ...n.data, labels: [...n.data.labels, label] } }
          : n
      )
    );
    setLabelInput('');
    marcarSucio();
  }, [labelInput, selectedIds, antesDeCambiar, marcarSucio]);

  const removeLabel = useCallback(
    (label: string) => {
      if (selectedIds.length === 0) return;
      antesDeCambiar();
      setNodes((nds) =>
        nds.map((n) =>
          selectedIds.includes(n.id)
            ? { ...n, data: { ...n.data, labels: n.data.labels.filter((l) => l !== label) } }
            : n
        )
      );
      marcarSucio();
    },
    [selectedIds, antesDeCambiar, marcarSucio]
  );

  const selectedLabels = useMemo(() => {
    const all = new Set<string>();
    nodes
      .filter((n) => selectedIds.includes(n.id))
      .forEach((n) => n.data.labels.forEach((l) => all.add(l)));
    return [...all];
  }, [nodes, selectedIds]);

  // Atajos de teclado
  useAtajosMapa(editable, {
    deshacer: undo,
    rehacer: redo,
    copiar,
    cortar,
    pegar,
    duplicar: () => (selectedIds.length === 1 ? duplicarNodo(selectedIds[0]) : duplicarSeleccion()),
    seleccionarTodo,
    editarSeleccion: () => {
      if (selectedIds.length === 1) setEditId(selectedIds[0]);
      else if (selectedEdgeIds.length === 1) setEdgeEditId(selectedEdgeIds[0]);
    },
    escape: escapar,
    mover: moverSeleccion,
    ayuda: () => setAyudaAbierta(true),
    herramienta: setTool,
  });

  // Trazo libre: overlay de dibujo (captura punteros sobre el lienzo)
  const overlayActivo = editable && tool === 'pencil';
  const puntoFlow = useCallback(
    (e: React.PointerEvent): [number, number] => {
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      return [p.x, p.y];
    },
    [screenToFlowPosition]
  );

  const onTrazoDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = puntoFlow(e);
      const rect = e.currentTarget.getBoundingClientRect();
      trazoRef.current = [p, p];
      trazoLocalRef.current = [
        [e.clientX - rect.left, e.clientY - rect.top],
        [e.clientX - rect.left, e.clientY - rect.top],
      ];
      setTrazoPreview([...trazoLocalRef.current]);
    },
    [puntoFlow]
  );

  const onTrazoMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const trazo = trazoRef.current;
      if (!trazo) return;
      const p = puntoFlow(e);
      const ultimo = trazo[trazo.length - 1];
      if (Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1]) < 3) return;
      const rect = e.currentTarget.getBoundingClientRect();
      trazo.push(p);
      trazoLocalRef.current.push([e.clientX - rect.left, e.clientY - rect.top]);
      if (trazoRafRef.current !== null) return;
      trazoRafRef.current = requestAnimationFrame(() => {
        trazoRafRef.current = null;
        setTrazoPreview([...trazoLocalRef.current]);
      });
    },
    [puntoFlow]
  );

  const onTrazoUp = useCallback(() => {
    const trazo = trazoRef.current;
    trazoRef.current = null;
    trazoLocalRef.current = [];
    if (trazoRafRef.current !== null) {
      cancelAnimationFrame(trazoRafRef.current);
      trazoRafRef.current = null;
    }
    setTrazoPreview(null);
    if (!trazo || trazo.length < 2 || !editable) return;
    // Un clic sin arrastre no genera trazo (evita nodos de 1px).
    const xs = trazo.map((p) => p[0]);
    const ys = trazo.map((p) => p[1]);
    if (Math.max(...xs) - Math.min(...xs) < 4 && Math.max(...ys) - Math.min(...ys) < 4) {
      return;
    }
    const id = crypto.randomUUID();
    const nodo = createDrawNode(id, trazo);
    if (!nodo) return;
    const flowNode: FlowNode = {
      id,
      type: 'draw',
      position: { x: nodo.x, y: nodo.y },
      width: nodo.width,
      height: nodo.height,
      data: nodo.data,
      selected: true,
    };
    antesDeCambiar();
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), flowNode]);
    emit({ t: 'node-add', node: flowNode });
    marcarSucio();
  }, [editable, antesDeCambiar, marcarSucio, emit]);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: { id: string }) => {
      if (!editable) return;
      // Forma pendiente: el clic (aunque sea sobre un nodo) la coloca aquí.
      if (formaPendiente) {
        const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNodeEn('shape', p, { shape: formaPendiente });
        setFormaPendiente(null);
        setPuntoFantasma(null);
        return;
      }
      if (tool !== 'connector') return;
      if (!conectorOrigen) {
        setConectorOrigen(node.id);
        return;
      }
      if (conectorOrigen === node.id) {
        setConectorOrigen(null);
        return;
      }
      const yaConectado = edgesRef.current.some(
        (e) =>
          (e.source === conectorOrigen && e.target === node.id) ||
          (e.source === node.id && e.target === conectorOrigen)
      );
      if (!yaConectado) {
        const a = nodesRef.current.find((n) => n.id === conectorOrigen);
        const b = nodesRef.current.find((n) => n.id === node.id);
        const dir = a && b ? handleDirectionBetween(a.position, b.position) : 'r';
        const nueva = crearEdge(conectorOrigen, node.id, dir, oppositeHandle(dir));
        antesDeCambiar();
        setEdges((eds) => [...eds, nueva]);
        emit({ t: 'edge-add', edge: nueva });
        marcarSucio();
      }
      setConectorOrigen(null);
    },
    [
      editable,
      formaPendiente,
      tool,
      conectorOrigen,
      screenToFlowPosition,
      addNodeEn,
      crearEdge,
      antesDeCambiar,
      marcarSucio,
      emit,
    ]
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      setMenu(null);
      setConectorOrigen(null);
      if (!editable) return;
      // Forma pendiente: se suelta donde el usuario hace clic.
      if (formaPendiente) {
        const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNodeEn('shape', p, { shape: formaPendiente });
        setFormaPendiente(null);
        setPuntoFantasma(null);
        return;
      }
      if (tool === 'text') {
        const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNodeEn('text', p);
      }
    },
    [editable, formaPendiente, tool, screenToFlowPosition, addNodeEn]
  );

  const nodeTypes: NodeTypes = MIND_MAP_NODE_TYPES;
  const edgeTypes: EdgeTypes = MIND_MAP_EDGE_TYPES;
  const selectedNodes = nodes.filter((n) => selectedIds.includes(n.id));
  const edgesSeleccionados: EdgeSeleccionado[] = useMemo(
    () =>
      edges
        .filter((e) => selectedEdgeIds.includes(e.id))
        .map((e) => ({
          ...(e.data ?? DEFAULT_EDGE_DATA),
          id: e.id,
          label: typeof e.label === 'string' ? e.label : undefined,
        })),
    [edges, selectedEdgeIds]
  );

  const accionesMenu: AccionesMenuMapa = useMemo(
    () => ({
      hayPortapapeles: hayContenido,
      haySeleccion: selectedIds.length > 0 || selectedEdgeIds.length > 0,
      editarNodo: setEditId,
      duplicarNodo,
      duplicarSeleccion,
      copiar,
      pegar,
      cambiarColorSeleccion: (color) => applyToSelected({ color }),
      agregarConectado: (id, dir, kind, overrides) =>
        addConnected(id, dir, true, kind, overrides),
      traerFrente,
      enviarFondo,
      eliminarSeleccion,
      alinear,
      distribuir,
      editarEtiquetaEdge: setEdgeEditId,
      cambiarEdge: actualizarEdge,
      invertirEdge,
      eliminarEdge: (id) => {
        if (!editable) return;
        antesDeCambiar();
        setEdges((eds) => eds.filter((e) => e.id !== id));
        emit({ t: 'edge-del', ids: [id] });
        marcarSucio();
      },
      seleccionarTodo,
      agregarNodoEn: addNodeEn,
      cambiarFormaNodo: cambiarForma,
      ajustarVista: () => {
        void fitView({ padding: 0.2, duration: 300 });
      },
      cambiarFondo: setFondo,
      autoOrganizar,
      abrirPlantillas: () => setConfirmTemplate(true),
    }),
    [
      hayContenido,
      selectedIds,
      selectedEdgeIds,
      duplicarNodo,
      duplicarSeleccion,
      copiar,
      pegar,
      applyToSelected,
      addConnected,
      traerFrente,
      enviarFondo,
      eliminarSeleccion,
      alinear,
      distribuir,
      actualizarEdge,
      invertirEdge,
      editable,
      antesDeCambiar,
      emit,
      marcarSucio,
      seleccionarTodo,
      addNodeEn,
      cambiarForma,
      fitView,
      autoOrganizar,
    ]
  );

  if (loaded && !map) {
    return (
      <div className="grid h-64 place-items-center text-sm text-muted-foreground">
        El mapa no existe o no tienes acceso.
      </div>
    );
  }

  if (!loaded || !map) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const haySeleccion = selectedIds.length > 0 || selectedEdgeIds.length > 0;

  return (
    <EditorContextProvider value={editorValue}>
      <EntidadPagina
        alto="completa"
        className="h-[calc(100dvh-6.5rem)] min-h-[480px]"
      >
        <CabeceraEntidad
          tipo="mindmap"
          titulo={map.name}
          estado={
            <>
              <IndicadorGuardado estado={saveState} formato="icono" />
              {!canWrite && <AvisoSoloLectura variante="badge" />}
            </>
          }
          acciones={
            <>
              <BarraHerramientasEntidad>
                <BotonHerramienta
                  onClick={undo}
                  disabled={!editable || !canUndo}
                  title="Deshacer (Ctrl+Z)"
                >
                  <Undo2 className="size-4" />
                </BotonHerramienta>
                <BotonHerramienta
                  onClick={redo}
                  disabled={!editable || !canRedo}
                  title="Rehacer (Ctrl+Shift+Z)"
                >
                  <Redo2 className="size-4" />
                </BotonHerramienta>
                <SeparadorHerramienta />
                <BotonHerramienta
                  onClick={() => setConfirmTemplate(true)}
                  disabled={!editable}
                  title="Aplicar plantilla"
                >
                  <LayoutTemplate className="size-4" />
                </BotonHerramienta>
                <BotonHerramienta
                  onClick={eliminarSeleccion}
                  disabled={!haySeleccion || !editable}
                  title={`Eliminar selección (${selectedIds.length + selectedEdgeIds.length})`}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </BotonHerramienta>
                <BotonHerramienta
                  onClick={() => setAyudaAbierta(true)}
                  title="Atajos de teclado (?)"
                >
                  <Keyboard className="size-4" />
                </BotonHerramienta>
                <BotonHerramienta
                  onClick={() => setGuiaAbierta(true)}
                  title="Cómo usar el mapa (información)"
                >
                  <Info className="size-4" />
                </BotonHerramienta>
              </BarraHerramientasEntidad>
              {map && ctx.isAdmin && (
                <ShareButton onClick={() => ctx.openShare('mindmap', map)} />
              )}
              <ToggleModoEntidad
                modo={mode === 'edit' ? 'editar' : 'ver'}
                onCambio={(m) => {
                  setMode(m === 'editar' ? 'edit' : 'view');
                  escapar();
                  setTool('select');
                }}
                disabled={!canWrite}
              />
            </>
          }
        />

        {/* Contenedor del lienzo */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        {/* Barra de formato (selección): prioridad y etiquetas */}
        {editable && haySeleccion && (
          <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-xs">
            <span className="text-muted-foreground">
              {selectedNodes.length > 0 ? `${selectedNodes.length} nodo(s)` : `${selectedEdgeIds.length} conexión(es)`}
            </span>
            {selectedNodes.length > 0 && (
              <>
                <div className="mx-1 h-4 w-px bg-border" />
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      applyToSelected({ priority: e.target.value });
                      e.target.value = '';
                    }
                  }}
                  className="h-7 rounded-md border bg-background px-2 text-xs"
                  aria-label="Prioridad"
                >
                  <option value="">Prioridad…</option>
                  {PRIORITY_OPTIONS.filter((p) => p.key !== 'none').map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {selectedNodes.some((n) => n.data.priority) && (
                  <button
                    onClick={() => applyToSelected({ priority: null })}
                    className="text-muted-foreground hover:text-foreground"
                    title="Quitar prioridad"
                  >
                    {selectedNodes
                      .map((n) => n.data.priority)
                      .filter(Boolean)
                      .map((p) => (
                        <span
                          key={p}
                          className="mr-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: priorityColor(p) ?? '#6b7280' }}
                        >
                          {etiquetaPrioridad(p)} <X className="size-3" aria-hidden="true" />
                        </span>
                      ))}
                  </button>
                )}
                <div className="mx-1 h-4 w-px bg-border" />
                <div className="flex items-center gap-1">
                  <input
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addLabelToSelected(); }}
                    placeholder="Etiqueta…"
                    className="h-7 w-28 rounded-md border bg-background px-2 text-xs"
                    aria-label="Nueva etiqueta"
                  />
                  <button
                    onClick={addLabelToSelected}
                    disabled={!labelInput.trim()}
                    className={TOOL_BTN}
                    title="Añadir etiqueta a la selección"
                  >
                    +
                  </button>
                </div>
                {selectedLabels.map((l) => (
                  <button
                    key={l}
                    onClick={() => removeLabel(l)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20"
                    title="Quitar etiqueta"
                  >
                    {l} <X className="size-3" aria-hidden="true" />
                  </button>
                ))}
              </>
            )}
            {selectedEdgeIds.length > 0 && (
              <>
                <div className="mx-1 h-4 w-px bg-border" />
                <input
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyEdgeLabel(); }}
                  placeholder="Etiqueta de la conexión…"
                  className="h-7 w-36 rounded-md border bg-background px-2 text-xs"
                  aria-label="Etiqueta de la conexión"
                />
                <button onClick={applyEdgeLabel} className={TOOL_BTN} title="Poner etiqueta">
                  +
                </button>
                {edges.some((e) => selectedEdgeIds.includes(e.id) && e.label) && (
                  <button
                    onClick={clearEdgeLabel}
                    className="text-muted-foreground hover:text-foreground"
                    title="Quitar etiqueta de la conexión"
                  >
                    Quitar
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Canvas */}
        <div
          ref={contenedorRef}
          className={cn('relative flex-1', formaPendiente && 'cursor-crosshair')}
          onPointerMove={(e) => {
            // El pane de React Flow no emite mousemove con `selectionOnDrag`
            // activo; el contenedor sí y además alimenta el fantasma y los
            // cursores remotos. Los eventos sobre toolbars también llegan:
            // solo se emite dentro del área del lienzo.
            if ((e.target as HTMLElement).closest('.react-flow') === null) return;
            const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            punteroRef.current = p;
            if (formaPendiente) setPuntoFantasma(p);
            throttledEmit('cursor', 80, () => ({ t: 'cursor', x: p.x, y: p.y }));
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onMoveEnd={onMoveEnd}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={(_, node) => editable && setEditId(node.id)}
            onPaneClick={onPaneClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onEdgeMouseEnter={onEdgeMouseEnter}
            onEdgeMouseLeave={onEdgeMouseLeave}
            onEdgeDoubleClick={(_, edge) => editable && setEdgeEditId(edge.id)}
            onNodeContextMenu={(e, node) => {
              e.preventDefault();
              if (!editable) return;
              // Selecciona el nodo apuntado para que las acciones de color
              // y estilo apliquen sobre él.
              setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === node.id })));
              setEdges((eds) => eds.map((ed) => (ed.selected ? { ...ed, selected: false } : ed)));
              setMenu({
                tipo: 'nodo',
                x: e.clientX,
                y: e.clientY,
                nodoId: node.id,
                tipoNodo: node.type,
              });
            }}
            onEdgeContextMenu={(e, edge) => {
              e.preventDefault();
              if (!editable) return;
              const completo = edgesRef.current.find((x) => x.id === edge.id);
              if (completo) {
                setMenu({ tipo: 'edge', x: e.clientX, y: e.clientY, edgeId: edge.id, edge: completo });
              }
            }}
            onPaneContextMenu={(e) => {
              e.preventDefault();
              if (!editable) return;
              const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
              setMenu({ tipo: 'lienzo', x: e.clientX, y: e.clientY, posicion: p });
            }}
            onSelectionContextMenu={(e) => {
              e.preventDefault();
              if (!editable) return;
              setMenu({
                tipo: 'seleccion',
                x: e.clientX,
                y: e.clientY,
                cantidad: selectedIdsRef.current.length,
              });
            }}
            defaultEdgeOptions={{
              type: 'mapa',
              markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            }}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '6 4' }}
            connectionRadius={30}
            connectionMode={ConnectionMode.Loose}
            isValidConnection={(c) => c.source !== c.target}
            deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
            nodesConnectable={editable && (tool === 'select' || tool === 'connector')}
            nodesDraggable={editable && tool === 'select' && !formaPendiente}
            elementsSelectable={tool !== 'hand'}
            panOnDrag={tool === 'hand' ? true : [1]}
            selectionOnDrag={editable && tool === 'select' && !formaPendiente}
            selectionMode={SelectionMode.Partial}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            {fondo !== 'none' && (
              <Background variant={VARIANTE_FONDO[fondo]} gap={24} size={1.5} />
            )}
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.data as MindMapNodeData).color ?? '#64748b'}
              className="!bg-background"
            />
            <Controls />
            <RemoteCursorsLayer cursors={remoteCursors} />
            {guias.length > 0 && (
              <ViewportPortal>
                {guias.map((g, i) =>
                  g.eje === 'x' ? (
                    <div
                      key={`${g.eje}-${i}`}
                      className="pointer-events-none absolute bg-primary/70"
                      style={{ left: g.posicion, top: g.desde, width: 1, height: g.hasta - g.desde }}
                    />
                  ) : (
                    <div
                      key={`${g.eje}-${i}`}
                      className="pointer-events-none absolute bg-primary/70"
                      style={{ left: g.desde, top: g.posicion, width: g.hasta - g.desde, height: 1 }}
                    />
                  )
                )}
              </ViewportPortal>
            )}
            {editable && formaPendiente && puntoFantasma && (
              <ViewportPortal>
                <div
                  className="pointer-events-none absolute opacity-60"
                  style={{
                    left: puntoFantasma.x,
                    top: puntoFantasma.y,
                    width: NODE_KINDS.shape.width,
                    height: NODE_KINDS.shape.height,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <FormaSVG shape={formaPendiente} color="#64748b" />
                </div>
              </ViewportPortal>
            )}
          </ReactFlow>

          {/* Overlay de dibujo a mano alzada */}
          {overlayActivo && (
            <div
              className="absolute inset-0 z-20 cursor-crosshair touch-none"
              onPointerDown={onTrazoDown}
              onPointerMove={onTrazoMove}
              onPointerUp={onTrazoUp}
              onPointerCancel={onTrazoUp}
              aria-label="Área de dibujo"
            >
              {trazoPreview && trazoPreview.length > 1 && (
                <svg className="pointer-events-none absolute inset-0 size-full">
                  <polyline
                    points={trazoPreview.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {!trazoPreview && (
                <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                  <span className="rounded-full border bg-popover/95 px-3 py-1 text-xs text-muted-foreground shadow-sm">
                    Dibuja con el mouse · P para salir
                  </span>
                </div>
              )}
            </div>
          )}

          {editable && (
            <BarraHerramientas
              tool={tool}
              onTool={(t) => {
                setTool(t);
                setConectorOrigen(null);
                setFormaPendiente(null);
                setPuntoFantasma(null);
              }}
              onAddKind={(kind) => agregarNodoCentro(kind)}
              onAddShape={(shape) => {
                setFormaPendiente(shape);
                setPuntoFantasma(punteroRef.current);
              }}
            />
          )}

          {editable && (selectedIds.length > 1 || selectedEdgeIds.length > 0) && (
            <BarraSeleccion
              cantidadNodos={selectedIds.length}
              edges={edgesSeleccionados}
              onColor={(color) => applyToSelected({ color })}
              onAlinear={alinear}
              onDistribuir={distribuir}
              onDuplicar={() =>
                selectedIds.length === 1 ? duplicarNodo(selectedIds[0]) : duplicarSeleccion()
              }
              onEliminar={eliminarSeleccion}
              onEdgeKind={(kind) => {
                selectedEdgeIds.forEach((id) => actualizarEdge(id, { kind }));
              }}
              onEdgeDashed={(dashed) => {
                selectedEdgeIds.forEach((id) => actualizarEdge(id, { dashed }));
              }}
              onEdgeArrow={(arrow) => {
                selectedEdgeIds.forEach((id) => actualizarEdge(id, { arrow }));
              }}
              onEditarEtiquetaEdge={() => {
                if (selectedEdgeIds.length === 1) setEdgeEditId(selectedEdgeIds[0]);
              }}
            />
          )}

          {conectorOrigen && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center">
              <span className="rounded-full border bg-popover/95 px-3 py-1 text-xs shadow-sm">
                Haz clic en otro nodo para conectar · Esc para cancelar
              </span>
            </div>
          )}

          {formaPendiente && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center">
              <span className="rounded-full border bg-popover/95 px-3 py-1 text-xs shadow-sm">
                Haz clic en el lienzo para colocar la forma · Esc para cancelar
              </span>
            </div>
          )}

          {menu && (
            <MenuContextualMapa
              menu={menu}
              acciones={accionesMenu}
              onCerrar={() => setMenu(null)}
            />
          )}
        </div>
        </div>
      </EntidadPagina>

      <Dialog open={confirmTemplate} onOpenChange={setConfirmTemplate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="size-4" />
              Aplicar plantilla
            </DialogTitle>
            <DialogDescription>
              Esto reemplazará el contenido actual del mapa. Puedes deshacerlo con el botón Deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {MIND_MAP_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  applyTemplate(t.id);
                  setConfirmTemplate(false);
                }}
                className="rounded-md border p-2 text-left transition-colors hover:bg-muted/60"
              >
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ayudaAbierta} onOpenChange={setAyudaAbierta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="size-4" />
              Atajos de teclado
            </DialogTitle>
          </DialogHeader>
          <ul className="grid grid-cols-1 gap-1.5 py-2 text-sm sm:grid-cols-2">
            {(
              [
                ['V / H / C', 'Seleccionar / Mano / Conectar'],
                ['P / T', 'Dibujar / Texto'],
                ['Ctrl+Z / Ctrl+Shift+Z', 'Deshacer / Rehacer'],
                ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copiar / Cortar / Pegar'],
                ['Ctrl+D', 'Duplicar selección'],
                ['Ctrl+A', 'Seleccionar todo'],
                ['Supr', 'Eliminar selección'],
                ['F2 / Enter', 'Editar texto del nodo'],
                ['Flechas (+Shift)', 'Mover 1px / 10px'],
                ['Espacio + arrastrar', 'Mover lienzo'],
                ['Doble clic nodo/edge', 'Editar texto/etiqueta'],
                ['?', 'Mostrar esta ayuda'],
              ] as const
            ).map(([tecla, accion]) => (
              <li key={tecla} className="flex items-center justify-between gap-3">
                <span className="truncate text-muted-foreground">{accion}</span>
                <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 text-xs font-semibold">
                  {tecla}
                </kbd>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={guiaAbierta} onOpenChange={setGuiaAbierta}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="size-4" />
              Cómo usar el mapa mental
            </DialogTitle>
            <DialogDescription>
              Guía rápida para plasmar y desarrollar tus ideas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-1 text-sm">
            <section>
              <h3 className="mb-1.5 flex items-center gap-2 font-semibold">
                <Lightbulb className="size-4 text-muted-foreground" />
                Empieza con una idea
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Escribe la idea central con <b>Idea</b> en la barra inferior, o elige{' '}
                  <b>Texto (T)</b> y haz clic en el lienzo.
                </li>
                <li>
                  Haz <b>doble clic</b> en un nodo para escribir su título y sus notas.
                </li>
                <li>
                  Con un nodo seleccionado pulsa <kbd className="rounded border bg-muted px-1 py-0.5 text-xs font-semibold">Tab</kbd>{' '}
                  para crear una idea conectada a la derecha.
                </li>
                <li>
                  ¿Punto de partida? Usa <b>Plantillas</b>: lluvia de ideas, DAFO, plan semanal…
                </li>
              </ul>
            </section>
            <section>
              <h3 className="mb-1.5 flex items-center gap-2 font-semibold">
                <Shapes className="size-4 text-muted-foreground" />
                Usa figuras
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  En la barra inferior pulsa <b>Forma</b> y elige rectángulo, elipse, rombo o
                  triángulo: un fantasma sigue al cursor y se suelta con un clic.
                </li>
                <li>
                  Los <b>+</b> de cada nodo abren la lista de qué crear conectado, incluidas las
                  figuras.
                </li>
                <li>
                  Cambia la figura desde la barra flotante del nodo o con clic derecho en Forma.
                </li>
                <li>
                  Arrastra las esquinas para redimensionar y el cuerpo para mover. El color se
                  cambia con la paleta del nodo.
                </li>
              </ul>
              <p className="mt-2 text-xs font-medium text-foreground">
                ¿Para qué sirve cada una?
              </p>
              <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(
                  [
                    ['rect', 'Rectángulo', 'Ideas, temas o pasos: el bloque base para agrupar conceptos.'],
                    ['ellipse', 'Elipse', 'Idea central, objetivo o inicio/fin de un flujo.'],
                    ['diamond', 'Rombo', 'Decisiones y condiciones: bifurca el camino (sí/no).'],
                    ['triangle', 'Triángulo', 'Alertas, riesgos, bloqueos o puntos que requieren atención.'],
                  ] as [MindMapShape, string, string][]
                ).map(([forma, nombre, significado]) => (
                  <div
                    key={forma}
                    className="flex items-start gap-2 rounded-md border bg-muted/30 p-2"
                  >
                    <span className="size-5 shrink-0 text-muted-foreground">
                      <FormaSVG shape={forma} color="#64748b" />
                    </span>
                    <p className="text-xs leading-snug text-muted-foreground">
                      <b className="text-foreground">{nombre}:</b> {significado}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-1.5 flex items-center gap-2 font-semibold">
                <Waypoints className="size-4 text-muted-foreground" />
                Desarrolla tus ideas
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Conecta arrastrando desde un <b>+</b> hasta otro nodo, o con la herramienta{' '}
                  <b>Conectar (C)</b>: clic en un nodo y luego en otro.
                </li>
                <li>
                  Doble clic en una conexión para etiquetarla; clic derecho para cambiar el
                  trazado, punteada, flecha o invertir.
                </li>
                <li>
                  Suma contexto con notas, imágenes, etiquetas y prioridad (barra superior de la
                  selección).
                </li>
                <li>
                  Duplica (<kbd className="rounded border bg-muted px-1 py-0.5 text-xs font-semibold">Ctrl+D</kbd>),
                  copia y pega, deshaz con{' '}
                  <kbd className="rounded border bg-muted px-1 py-0.5 text-xs font-semibold">Ctrl+Z</kbd>{' '}
                  y ordena todo con clic derecho en el lienzo → <b>Auto-organizar</b> (árbol
                  horizontal, vertical o radial).
                </li>
                <li>
                  Selecciona varios nodos (arrastre o Shift+clic) para alinear y distribuir.
                </li>
                <li>
                  Todo se guarda automáticamente y se sincroniza en vivo con tu equipo.
                </li>
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </EditorContextProvider>
  );
}

export function MindMapEditor({ mapId }: { mapId: string }) {
  return (
    <ReactFlowProvider>
      <MindMapCanvas mapId={mapId} />
    </ReactFlowProvider>
  );
}
