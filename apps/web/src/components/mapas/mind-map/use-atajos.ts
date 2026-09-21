import { useEffect, useRef } from 'react';
import type { HerramientaMapa } from '@/components/mapas/mind-map-nodes';

// Atajos de teclado estilo Excalidraw/Miro. Se registran en window y
// respetan inputs/textareas: mientras se escribe texto no se disparan
// (salvo deshacer/rehacer, que siguen funcionando).

export type AccionesAtajos = {
  deshacer: () => void;
  rehacer: () => void;
  copiar: () => void;
  cortar: () => void;
  pegar: () => void;
  duplicar: () => void;
  seleccionarTodo: () => void;
  editarSeleccion: () => void;
  escape: () => void;
  mover: (dx: number, dy: number) => void;
  ayuda: () => void;
  herramienta: (t: HerramientaMapa) => void;
};

const TECLAS_HERRAMIENTA: Record<string, HerramientaMapa> = {
  v: 'select',
  h: 'hand',
  c: 'connector',
  p: 'pencil',
  t: 'text',
};

function esInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable === true
  );
}

export function useAtajosMapa(habilitado: boolean, acciones: AccionesAtajos) {
  const ref = useRef(acciones);
  useEffect(() => {
    ref.current = acciones;
  });

  useEffect(() => {
    if (!habilitado) return;
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const enInput = esInput(e.target);
      const a = ref.current;

      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) a.rehacer();
        else a.deshacer();
        return;
      }
      if (ctrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        a.rehacer();
        return;
      }

      if (enInput) return;

      if (ctrl && (e.key === 'c' || e.key === 'C')) {
        a.copiar();
        return;
      }
      if (ctrl && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        a.cortar();
        return;
      }
      if (ctrl && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        a.pegar();
        return;
      }
      if (ctrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        a.duplicar();
        return;
      }
      if (ctrl && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        a.seleccionarTodo();
        return;
      }

      if (e.key === 'Escape') {
        a.escape();
        return;
      }
      if (e.key === 'F2' || e.key === 'Enter') {
        a.editarSeleccion();
        return;
      }
      if (e.key.startsWith('Arrow')) {
        const paso = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -paso : e.key === 'ArrowRight' ? paso : 0;
        const dy = e.key === 'ArrowUp' ? -paso : e.key === 'ArrowDown' ? paso : 0;
        e.preventDefault();
        a.mover(dx, dy);
        return;
      }
      if (e.key === '?') {
        a.ayuda();
        return;
      }
      const herramienta = TECLAS_HERRAMIENTA[e.key.toLowerCase()];
      if (herramienta && !ctrl && !e.altKey) {
        a.herramienta(herramienta);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [habilitado]);
}
