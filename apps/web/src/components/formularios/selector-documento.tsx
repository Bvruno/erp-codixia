'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, FilePlus2, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { TaskDocument } from '@/types';

// Selector de documento con búsqueda por nombre o ruta. Muestra la ruta
// completa (Espacio › Carpeta) y permite saltar a "crear documento nuevo".

export function SelectorDocumento({
  documentos,
  valor,
  onSeleccion,
  onCrearNuevo,
  rutaDe,
}: {
  documentos: TaskDocument[];
  valor: string;
  onSeleccion: (id: string) => void;
  onCrearNuevo: () => void;
  rutaDe: (doc: TaskDocument) => string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('');

  const opciones = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return documentos
      .map((doc) => ({ doc, ruta: rutaDe(doc) }))
      .filter(
        ({ doc, ruta }) =>
          !q || doc.name.toLowerCase().includes(q) || ruta.toLowerCase().includes(q)
      );
  }, [documentos, filtro, rutaDe]);

  const seleccionado = documentos.find((d) => d.id === valor);

  const cerrar = (abrir: boolean) => {
    setAbierto(abrir);
    if (!abrir) setFiltro('');
  };

  return (
    <Popover open={abierto} onOpenChange={cerrar}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between gap-2 font-normal"
          aria-expanded={abierto}
        >
          <span className={cn('truncate', !seleccionado && 'text-muted-foreground')}>
            {seleccionado ? seleccionado.name : 'Elegir documento…'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[90vw] p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar por nombre o carpeta…"
              className="h-8 pl-8 text-sm"
              aria-label="Buscar documento"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {opciones.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Sin resultados.
            </p>
          ) : (
            opciones.map(({ doc, ruta }) => {
              const activo = doc.id === valor;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    onSeleccion(doc.id);
                    cerrar(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent',
                    activo && 'bg-primary-soft'
                  )}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{doc.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {ruta}
                    </span>
                  </span>
                  {activo && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })
          )}
        </div>
        <div className="border-t p-1">
          <button
            type="button"
            onClick={() => {
              cerrar(false);
              onCrearNuevo();
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent"
          >
            <FilePlus2 className="size-4 text-primary" />
            Crear documento nuevo
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
