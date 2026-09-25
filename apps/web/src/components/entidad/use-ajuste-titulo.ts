'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// Ajuste proporcional del título de la cabecera: usa el tamaño máximo
// (text-2xl = 24px) y lo reduce de forma proporcional cuando el texto no
// cabe en el ancho disponible, con un mínimo legible. La medición usa canvas
// (no inserta texto extra en el DOM).

export const TAMANO_TITULO_MAX = 24;
const TAMANO_TITULO_MIN = 12;
const PESO_TITULO = 700;

function medirAncho(texto: string, contenedor: HTMLElement): number {
  if (!texto) return 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  const familia = getComputedStyle(contenedor).fontFamily;
  ctx.font = `${PESO_TITULO} ${TAMANO_TITULO_MAX}px ${familia}`;
  return ctx.measureText(texto).width;
}

export function useAjusteTitulo(texto: string) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [tamano, setTamano] = useState(TAMANO_TITULO_MAX);

  useLayoutEffect(() => {
    const recalcular = () => {
      const contenedor = contenedorRef.current;
      if (!contenedor) return;

      const disponible = contenedor.clientWidth;
      const ancho = medirAncho(texto, contenedor);
      if (!disponible || !ancho) {
        setTamano(TAMANO_TITULO_MAX);
        return;
      }

      const escala = ancho > disponible ? disponible / ancho : 1;
      setTamano(Math.max(TAMANO_TITULO_MIN, TAMANO_TITULO_MAX * escala));
    };

    recalcular();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', recalcular);
      return () => window.removeEventListener('resize', recalcular);
    }
    const observer = new ResizeObserver(recalcular);
    if (contenedorRef.current) observer.observe(contenedorRef.current);
    return () => observer.disconnect();
  }, [texto]);

  return { contenedorRef, tamano };
}
