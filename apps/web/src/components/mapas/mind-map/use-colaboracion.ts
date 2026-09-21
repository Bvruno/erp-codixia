import { useCallback, useEffect, useRef, useState } from 'react';
import { MarkerType } from '@xyflow/react';
import { canalRealtime, removerCanal, type CanalRealtime } from '@/lib/realtime';
import type { Profile } from '@/types';
import type { RemoteMsg, FlowNode, FlowEdge, MapEdgeData } from './flow';
import type { RemoteCursor } from '@/components/mapas/remote-cursors';

// Colaboración en vivo del mapa por canal broadcast: emitir cambios
// locales (con throttle), aplicar remotos y cursores remotos.

export function useColaboracionMapa({
  mapId,
  currentUserId,
  collaborators,
  setNodes,
  setEdges,
  onMapaEliminado,
}: {
  mapId: string | null;
  currentUserId: string | null;
  collaborators: Profile[];
  setNodes: (fn: FlowNode[] | ((prev: FlowNode[]) => FlowNode[])) => void;
  setEdges: (fn: FlowEdge[] | ((prev: FlowEdge[]) => FlowEdge[])) => void;
  onMapaEliminado: () => void;
}) {
  const channelRef = useRef<CanalRealtime | null>(null);
  const lastEmitRef = useRef<Record<string, number>>({});
  const cursorTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});

  const meName =
    collaborators.find((c) => c.id === currentUserId)?.full_name ?? 'Usuario';

  const emit = useCallback(
    (msg: Omit<RemoteMsg, 'u' | 'n'>) => {
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'mm',
        payload: { u: currentUserId, n: meName, ...msg },
      });
    },
    [currentUserId, meName]
  );

  const throttledEmit = useCallback(
    (key: string, ms: number, make: () => Omit<RemoteMsg, 'u' | 'n'>) => {
      const now = Date.now();
      if (now - (lastEmitRef.current[key] ?? 0) < ms) return;
      lastEmitRef.current[key] = now;
      emit(make());
    },
    [emit]
  );

  const aplicarEdgePatch = useCallback(
    (id: string, patch: Partial<MapEdgeData> & { label?: string | null }) => {
      setEdges((es) =>
        es.map((e) => {
          if (e.id !== id) return e;
          const data: MapEdgeData = {
            kind: patch.kind ?? e.data?.kind ?? 'bezier',
            dashed: patch.dashed ?? e.data?.dashed ?? false,
            arrow: patch.arrow ?? e.data?.arrow ?? true,
          };
          const label = 'label' in patch ? patch.label ?? undefined : e.label;
          return {
            ...e,
            data,
            label,
            markerEnd: data.arrow
              ? { type: MarkerType.ArrowClosed, width: 18, height: 18 }
              : undefined,
          };
        })
      );
    },
    [setEdges]
  );

  const applyRemote = useCallback(
    (m: RemoteMsg) => {
      switch (m.t) {
        case 'move':
          if (m.id && m.position) {
            setNodes((ns) =>
              ns.map((n) => (n.id === m.id ? { ...n, position: m.position! } : n))
            );
          }
          break;
        case 'nodes-pos':
          if (m.positions) {
            const posiciones = m.positions;
            setNodes((ns) =>
              ns.map((n) => (posiciones[n.id] ? { ...n, position: posiciones[n.id] } : n))
            );
          }
          break;
        case 'node-size':
          if (m.id && typeof m.width === 'number' && typeof m.height === 'number') {
            const { width, height } = m;
            setNodes((ns) => ns.map((n) => (n.id === m.id ? { ...n, width, height } : n)));
          }
          break;
        case 'data':
          if (m.id && m.patch) {
            setNodes((ns) =>
              ns.map((n) =>
                n.id === m.id ? { ...n, data: { ...n.data, ...m.patch! } } : n
              )
            );
          }
          break;
        case 'node-add':
          if (m.node) {
            setNodes((ns) => (ns.some((n) => n.id === m.node!.id) ? ns : [...ns, m.node!]));
          }
          break;
        case 'node-del':
          if (m.ids) {
            setNodes((ns) => ns.filter((n) => !m.ids!.includes(n.id)));
          }
          break;
        case 'edge-add': {
          if (!m.edge) break;
          const e = m.edge;
          setEdges((es) => {
            const dup = es.some(
              (x) =>
                (x.source === e.source && x.target === e.target) ||
                (x.source === e.target && x.target === e.source)
            );
            if (dup) return es;
            return [
              ...es,
              {
                ...e,
                type: 'mapa',
                markerEnd:
                  e.data?.arrow === false
                    ? undefined
                    : { type: MarkerType.ArrowClosed, width: 18, height: 18 },
              },
            ];
          });
          break;
        }
        case 'edge-del':
          if (m.ids) {
            setEdges((es) => es.filter((e) => !m.ids!.includes(e.id)));
          }
          break;
        case 'edge-update':
          if (m.id && m.edgePatch) {
            aplicarEdgePatch(m.id, m.edgePatch);
          }
          break;
        case 'cursor':
          if (m.u && typeof m.x === 'number' && typeof m.y === 'number') {
            const nombre = m.n ?? 'Usuario';
            setRemoteCursors((prev) => ({ ...prev, [m.u!]: { x: m.x!, y: m.y!, nombre } }));
            const timer = cursorTimersRef.current[m.u!];
            if (timer) clearTimeout(timer);
            cursorTimersRef.current[m.u!] = setTimeout(() => {
              setRemoteCursors((prev) => {
                const next = { ...prev };
                delete next[m.u!];
                return next;
              });
              delete cursorTimersRef.current[m.u!];
            }, 4000);
          }
          break;
      }
    },
    [setNodes, setEdges, aplicarEdgePatch]
  );

  // Canal broadcast del mapa: cambios en vivo (sin pasar por la BD).
  // El postgres_changes UPDATE se descarta: el payload solo trae la PK.
  useEffect(() => {
    if (!mapId) return;
    const channel = canalRealtime(`mindmap-${mapId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;
    channel
      .on('broadcast', { event: 'mm' }, (payload) => {
        applyRemote(payload.payload as RemoteMsg);
      })
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'mind_maps', filter: `id=eq.${mapId}` },
        () => {
          onMapaEliminado();
        }
      )
      .subscribe();
    return () => {
      channelRef.current = null;
      void removerCanal(channel);
    };
  }, [mapId, applyRemote, onMapaEliminado]);

  return { emit, throttledEmit, remoteCursors };
}

// Re-export del tipo de nodo para consumidores del hook.
export type { FlowNode, FlowEdge, MapEdgeData };
