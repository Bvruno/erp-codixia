'use client';

import { useState } from 'react';
import { Palette, Square } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Editor } from '@tiptap/core';

/** Tonos translúcidos: funcionan en tema claro y oscuro sin tocar el texto. */
export const COLORES_CELDA: { nombre: string; valor: string }[] = [
  { nombre: 'Ámbar', valor: 'rgba(245, 158, 11, 0.28)' },
  { nombre: 'Naranja', valor: 'rgba(249, 115, 22, 0.28)' },
  { nombre: 'Rojo', valor: 'rgba(239, 68, 68, 0.26)' },
  { nombre: 'Rosa', valor: 'rgba(236, 72, 153, 0.26)' },
  { nombre: 'Violeta', valor: 'rgba(139, 92, 246, 0.28)' },
  { nombre: 'Índigo', valor: 'rgba(99, 102, 241, 0.28)' },
  { nombre: 'Cielo', valor: 'rgba(14, 165, 233, 0.28)' },
  { nombre: 'Cian', valor: 'rgba(6, 182, 212, 0.28)' },
  { nombre: 'Esmeralda', valor: 'rgba(16, 185, 129, 0.28)' },
  { nombre: 'Lima', valor: 'rgba(132, 204, 22, 0.28)' },
  { nombre: 'Slate', valor: 'rgba(100, 116, 139, 0.28)' },
  { nombre: 'Piedra', valor: 'rgba(120, 113, 108, 0.28)' },
];

export function ColorCeldaPicker({
  editor,
  tipo = 'fondo',
}: {
  editor: Editor;
  tipo?: 'fondo' | 'borde';
}) {
  const [open, setOpen] = useState(false);
  const esBorde = tipo === 'borde';
  const atributo = esBorde ? 'borderColor' : 'backgroundColor';
  const titulo = esBorde ? 'Color de borde' : 'Color de celda';
  const actual = (editor.getAttributes('tableCell')[atributo] ??
    editor.getAttributes('tableHeader')[atributo] ??
    null) as string | null;

  const aplicar = (color: string | null) => {
    editor.chain().focus().setCellAttribute(atributo, color).run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={titulo}
          aria-label={titulo}
          onMouseDown={(e) => e.preventDefault()}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span className="relative flex items-center justify-center">
            {esBorde ? <Square className="size-4" /> : <Palette className="size-4" />}
            {actual && (
              <span
                className="absolute -right-1 -bottom-1 size-2.5 rounded-full border border-background"
                style={{ backgroundColor: actual }}
              />
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {esBorde ? 'Color de borde' : 'Color de celda'}
        </p>
        <div className="grid grid-cols-6 gap-1.5">
          {COLORES_CELDA.map((c) => (
            <button
              key={c.valor}
              type="button"
              title={c.nombre}
              aria-label={c.nombre}
              onClick={() => aplicar(c.valor)}
              className={cn(
                'size-6 rounded-md border border-black/10 transition-transform hover:scale-110',
                actual === c.valor && 'ring-2 ring-ring ring-offset-1 ring-offset-background'
              )}
              style={{ backgroundColor: c.valor }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => aplicar(null)}
          className="mt-2 w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {esBorde ? 'Sin color de borde' : 'Sin color'}
        </button>
      </PopoverContent>
    </Popover>
  );
}
