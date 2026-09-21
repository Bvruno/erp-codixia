import { useLayoutEffect, useRef, useState } from 'react';
import type { WorkspaceFolder } from '@/types';
import type { EntityType, ReorderKind, ReorderTarget } from './tipos';

// Drag & drop del árbol: reposicionar dentro de un contenedor o mover a otra
// carpeta/workspace. Mantiene estados de fantasma/preview y listeners de
// puntero; el render del ghost vive en el componente.

type PreviewInsert = { containerKey: string; beforeId: string | null } | null;

export function useArrastreNav({
  canManage,
  folders,
  onReorderTo,
  onMoveEntity,
}: {
  canManage: boolean;
  folders: WorkspaceFolder[];
  onReorderTo: (input: { type: 'workspace' | 'folder' | 'list' | 'document' | 'mindmap' | 'todo' | 'formulario'; id: string; targetId: string }) => void;
  onMoveEntity: (input: { type: EntityType; id: string; workspaceId: string; parentFolderId: string | null }) => Promise<{ error?: string } | undefined>;
}) {
  const [reorderEntity, setReorderEntity] = useState<ReorderKind | null>(null);
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget | null>(null);
  const [previewInsert, setPreviewInsert] = useState<PreviewInsert>(null);
  const [dragGhost, setDragGhost] = useState<ReorderKind | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });

  const previewInsertRef = useRef<PreviewInsert>(null);
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const prevRowPositions = useRef<Map<string, number> | null>(null);
  const dragRef = useRef<{ kind: ReorderKind; moved: boolean; startX: number; startY: number } | null>(null);

  const containerTypeOf = (key: string): string => {
    if (key === 'ws:all') return 'workspace';
    const t = key.split(':')[0];
    if (t === 'map') return 'mindmap';
    if (t === 'doc') return 'document';
    return t;
  };

  const containerKeyFor = (
    type: ReorderKind['type'],
    wsId: string,
    parentFolderId: string | null,
  ): string => {
    const f = parentFolderId ?? '';
    switch (type) {
      case 'folder':
        return `folder:${wsId}:${f}`;
      case 'list':
        return `list:${wsId}:${f}`;
      case 'document':
        return `doc:${wsId}:${f}`;
      case 'mindmap':
        return `map:${wsId}:${f}`;
      case 'todo':
        return `todo:${wsId}:${f}`;
      case 'formulario':
        return `formulario:${wsId}:${f}`;
      default:
        return 'ws:all';
    }
  };

  const orderFor = (containerKey: string, items: { id: string; position: number }[]): string[] => {
    const sorted = [...items].sort((a, b) => a.position - b.position).map((x) => x.id);
    const d = dragGhost;
    const pi = previewInsert;
    if (
      d &&
      pi &&
      pi.containerKey === containerKey &&
      containerTypeOf(containerKey) === d.type &&
      pi.beforeId !== d.id
    ) {
      if (pi.beforeId && sorted.includes(pi.beforeId)) {
        const di = sorted.indexOf(d.id);
        if (di !== -1) sorted.splice(di, 1);
        const bi = sorted.indexOf(pi.beforeId);
        if (bi !== -1) sorted.splice(bi, 0, d.id);
        else if (!sorted.includes(d.id)) sorted.push(d.id);
      } else if (!sorted.includes(d.id)) {
        sorted.push(d.id);
      }
    }
    return sorted;
  };

  const capturePositions = (): Map<string, number> => {
    const rows = document.querySelectorAll('[data-drop-row]');
    const m = new Map<string, number>();
    rows.forEach((el) => {
      const id = (el as HTMLElement).dataset.dropId;
      if (id) m.set(id, (el as HTMLElement).getBoundingClientRect().top);
    });
    return m;
  };

  const updatePreview = (e: PointerEvent) => {
    const d = dragRef.current;
    const ro = rowAtPoint(e.clientX, e.clientY);
    if (!d || !ro) {
      previewInsertRef.current = null;
      setPreviewInsert(null);
      setReorderTarget(null);
      return;
    }
    let targetKey: string;
    if (ro.type === 'workspace') {
      targetKey = containerKeyFor(d.kind.type, ro.id, null);
    } else if (ro.type === 'folder') {
      const wsId = folders.find((f) => f.id === ro.id)?.workspace_id;
      if (!wsId) {
        previewInsertRef.current = null;
        setPreviewInsert(null);
        setReorderTarget(null);
        return;
      }
      targetKey = containerKeyFor(d.kind.type, wsId, ro.id);
    } else if (ro.containerKey === d.kind.containerKey) {
      targetKey = ro.containerKey;
    } else {
      previewInsertRef.current = null;
      setPreviewInsert(null);
      setReorderTarget(ro);
      return;
    }
    const targetRows = Array.from(
      document.querySelectorAll(`[data-drop-container="${targetKey}"]`),
    ) as HTMLElement[];
    let beforeId: string | null = null;
    for (const el of targetRows) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        beforeId = el.dataset.dropId ?? null;
        break;
      }
    }
    if (targetKey === d.kind.containerKey && beforeId === d.kind.id) {
      // El cursor está sobre la fila del propio item (injectada en el
      // hueco o en su posición original): conserva el preview actual.
      setReorderTarget(ro);
      return;
    }
    prevRowPositions.current = capturePositions();
    const next = { containerKey: targetKey, beforeId };
    previewInsertRef.current = next;
    setPreviewInsert(next);
    setReorderTarget(ro);
  };

  useLayoutEffect(() => {
    if (!dragGhost || !ghostElRef.current) return;
    ghostElRef.current.style.transform = `translate(${ghostPos.x + 14}px, ${ghostPos.y + 10}px)`;
  }, [dragGhost, ghostPos]);

  useLayoutEffect(() => {
    const prev = prevRowPositions.current;
    if (!prev) return;
    const rows = Array.from(
      document.querySelectorAll('[data-drop-row]'),
    ) as HTMLElement[];
    const next = new Map<string, number>();
    rows.forEach((el) => {
      const id = el.dataset.dropId;
      if (id) next.set(id, el.getBoundingClientRect().top);
    });
    rows.forEach((el) => {
      const id = el.dataset.dropId;
      if (!id) return;
      const from = prev.get(id);
      const to = next.get(id);
      if (from === undefined || to === undefined || from === to) return;
      const dy = from - to;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      el.style.willChange = 'transform';
    });
    void document.body.offsetHeight;
    requestAnimationFrame(() => {
      rows.forEach((el) => {
        el.style.transition =
          'transform 320ms cubic-bezier(0.34, 1.3, 0.4, 1)';
        el.style.transform = '';
        el.style.willChange = '';
      });
    });
    prevRowPositions.current = next;
  }, [previewInsert]);

  const endDrag = () => {
    const d = dragRef.current;
    const pi = previewInsertRef.current;
    dragRef.current = null;
    previewInsertRef.current = null;
    setDragGhost(null);
    document.removeEventListener('pointermove', onDocPointerMove);
    document.removeEventListener('pointerup', endDrag);
    document.body.style.userSelect = ''; // eslint-disable-line react-hooks/immutability

    if (d && d.moved && pi) {
      suppressClickOnce();
      if (pi.containerKey === d.kind.containerKey) {
        if (pi.beforeId && pi.beforeId !== d.kind.id) {
          onReorderTo({ type: d.kind.type, id: d.kind.id, targetId: pi.beforeId });
        } else if (!pi.beforeId) {
          onReorderTo({ type: d.kind.type, id: d.kind.id, targetId: '' });
        }
      } else if (d.kind.type !== 'workspace') {
        const parts = pi.containerKey.split(':');
        const wsId = parts[1];
        const folderId = parts[2] || null;
        if (wsId) {
          onMoveEntity({ type: d.kind.type, id: d.kind.id, workspaceId: wsId, parentFolderId: folderId });
        }
      }
    }
    setReorderEntity(null);
    setReorderTarget(null);
    setPreviewInsert(null);
  };

  const rowAtPoint = (x: number, y: number): ReorderTarget | null => {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest?.('[data-drop-row]') as HTMLElement | null;
    if (!row) return null;
    const type = row.dataset.dropType as ReorderTarget['type'];
    const id = row.dataset.dropId;
    const containerKey = row.dataset.dropContainer;
    if (!id || !containerKey) return null;
    return { type, id, containerKey };
  };

  const onDocPointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (ghostElRef.current) {
      ghostElRef.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
    }
    if (!d.moved) {
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (dist < 6) return;
      d.moved = true;
      setReorderEntity(d.kind);
    }
    const ro = rowAtPoint(e.clientX, e.clientY);
    if (ro) {
      updatePreview(e);
    } else {
      setPreviewInsert(null);
      setReorderTarget(null);
    }
  };

  const suppressClickOnce = () => {
    const suppress = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      document.removeEventListener('click', suppress, true);
    };
    document.addEventListener('click', suppress, true);
  };

  const beginDrag = (e: React.PointerEvent, kind: ReorderKind, immediate: boolean) => {
    if (!canManage) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind, moved: immediate, startX: e.clientX, startY: e.clientY };
    setGhostPos({ x: e.clientX, y: e.clientY });
    setDragGhost(kind);
    setReorderEntity(kind);
    setReorderTarget(null);
    previewInsertRef.current = null;
    setPreviewInsert(null);
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onDocPointerMove);
    document.addEventListener('pointerup', endDrag);
  };

  const onGripPointerDown = (e: React.PointerEvent, kind: ReorderKind) => {
    beginDrag(e, kind, true);
  };

  const dropAttrs = (kind: ReorderKind): Record<string, string> => ({
    'data-drop-row': '1',
    'data-drop-type': kind.type,
    'data-drop-id': kind.id,
    'data-drop-container': kind.containerKey,
  });

  return {
    reorderEntity,
    reorderTarget,
    dragGhost,
    ghostPos,
    ghostElRef,
    onGripPointerDown,
    dropAttrs,
    orderFor,
  };
}
