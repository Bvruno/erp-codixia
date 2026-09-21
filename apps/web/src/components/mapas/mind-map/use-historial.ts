import { useCallback, useRef, useState } from 'react';
import type { MindMapSnapshot } from '@/types';
import { toFlowEdges, toFlowNodes, type FlowEdge, type FlowNode } from './flow';

// Historial de deshacer/rehacer del mapa (snapshots).

export function useHistorialMapa({
  currentSnapshot,
  setNodes,
  setEdges,
  marcarSucio,
}: {
  currentSnapshot: () => MindMapSnapshot;
  setNodes: (fn: FlowNode[] | ((prev: FlowNode[]) => FlowNode[])) => void;
  setEdges: (fn: FlowEdge[] | ((prev: FlowEdge[]) => FlowEdge[])) => void;
  marcarSucio: () => void;
}) {
  const historyRef = useRef<MindMapSnapshot[]>([]);
  const futureRef = useRef<MindMapSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = useCallback((snap: MindMapSnapshot) => {
    historyRef.current.push(snap);
    if (historyRef.current.length > 100) historyRef.current.shift();
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(currentSnapshot());
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
    setNodes(toFlowNodes(prev));
    setEdges(toFlowEdges(prev));
    marcarSucio();
  }, [currentSnapshot, setNodes, setEdges, marcarSucio]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(currentSnapshot());
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
    setNodes(toFlowNodes(next));
    setEdges(toFlowEdges(next));
    marcarSucio();
  }, [currentSnapshot, setNodes, setEdges, marcarSucio]);

  const resetHistorial = useCallback(() => {
    historyRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  return { pushHistory, undo, redo, canUndo, canRedo, resetHistorial };
}
