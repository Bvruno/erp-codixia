'use client';

import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const MENCIONES: { simbolo: string; texto: string }[] = [
  { simbolo: '@', texto: 'Usuario' },
  { simbolo: '#', texto: 'Lista. Escribí # otra vez junto a la lista para elegir una tarea' },
  { simbolo: '&', texto: 'Documento' },
  { simbolo: '^', texto: 'Mapa mental' },
  { simbolo: '%', texto: 'TO-DO' },
];

const ATAJOS: { teclas: string; texto: string }[] = [
  { teclas: 'Ctrl+B / I / U', texto: 'Negrita · cursiva · subrayado' },
  { teclas: 'Ctrl+Z / Ctrl+Y', texto: 'Deshacer / rehacer' },
  { teclas: '↑ ↓ Enter Esc', texto: 'Navegar el selector de menciones' },
  { teclas: 'Tab / Shift+Tab', texto: 'Navegar celdas de tabla' },
];

export function AyudaMenciones() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Ayuda: menciones y atajos"
          aria-label="Ayuda: menciones y atajos"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CircleHelp className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Menciones
        </p>
        <ul className="mt-1.5 space-y-1">
          {MENCIONES.map((m) => (
            <li key={m.simbolo} className="flex items-start gap-2 text-xs">
              <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded border bg-muted font-mono text-[11px] font-semibold">
                {m.simbolo}
              </span>
              <span className="text-muted-foreground">{m.texto}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Atajos
        </p>
        <ul className="mt-1.5 space-y-1">
          {ATAJOS.map((a) => (
            <li key={a.teclas} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-[11px] text-foreground">{a.teclas}</span>
              <span className="text-right text-muted-foreground">{a.texto}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
