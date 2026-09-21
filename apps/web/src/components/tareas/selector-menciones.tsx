'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { AtSign, BookOpen, List, ListChecks, ListTodo, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ItemMencion, SugerenciaMencion, TipoMencion } from './documento-editor';
import { filtrarMenciones, listaVigente } from './menciones-utils';

type IconoTipo = typeof AtSign;

const ICONO_POR_TIPO: Record<TipoMencion, IconoTipo> = {
  usuario: AtSign,
  lista: List,
  tarea: ListTodo,
  documento: BookOpen,
  mapa: Network,
  todo: ListChecks,
};

export type HandleListaMenciones = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

export const ListaMenciones = forwardRef<
  HandleListaMenciones,
  SuggestionProps<ItemMencion, ItemMencion>
>(function ListaMenciones({ items, command, loading }, ref) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    setIndice(0);
  }, [items]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === 'ArrowUp') {
          setIndice((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setIndice((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          const item = items[indice];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }),
    [items, indice, command]
  );

  if (loading && items.length === 0) {
    return (
      <div className="w-72 rounded-lg border bg-popover p-3 text-xs text-muted-foreground shadow-popover">
        Buscando…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="w-72 rounded-lg border bg-popover p-3 text-xs text-muted-foreground shadow-popover">
        Sin resultados
      </div>
    );
  }

  return (
    <div className="max-h-72 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-popover">
      {items.map((item, i) => {
        const Icono = ICONO_POR_TIPO[item.tipo] ?? AtSign;
        return (
          <button
            key={`${item.tipo}:${item.id}`}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command(item)}
            onMouseEnter={() => setIndice(i)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
              i === indice ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'
            )}
          >
            <Icono className="size-3.5 shrink-0" />
            <span className="truncate">{item.label}</span>
            {item.tipo === 'tarea' && (
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">tarea</span>
            )}
          </button>
        );
      })}
    </div>
  );
});

type PropsListaMenciones = SuggestionProps<ItemMencion, ItemMencion>;

function renderMenciones() {
  let componente: ReactRenderer<HandleListaMenciones, PropsListaMenciones> | null = null;
  let desmontar: (() => void) | null = null;

  return {
    onStart: (props: PropsListaMenciones) => {
      componente = new ReactRenderer<HandleListaMenciones, PropsListaMenciones>(ListaMenciones, {
        editor: props.editor,
        props,
      });
      desmontar = props.mount(componente.element);
    },
    onUpdate: (props: PropsListaMenciones) => {
      componente?.updateProps(props);
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') return false;
      return componente?.ref?.onKeyDown(props) ?? false;
    },
    onExit: () => {
      desmontar?.();
      componente?.destroy();
      componente = null;
      desmontar = null;
    },
  };
}

export type DatosMenciones = {
  usuarios: () => ItemMencion[];
  listas: () => ItemMencion[];
  documentos: () => ItemMencion[];
  mapas: () => ItemMencion[];
  todos: () => ItemMencion[];
  tareasDeLista: (listaId: string, query: string) => Promise<ItemMencion[]>;
};

/**
 * Prefijos válidos: espacio normal y espacio duro (el navegador/ProseMirror
 * inserta `\u00a0` al escribir junto a una mención, y el default `[' ']` del
 * plugin rechazaría el trigger).
 */
const PREFIJOS_VALIDOS = [' ', '\u00a0'];

/** Sugerencias por símbolo: @ usuario · # lista (y luego tarea de esa lista) · & documento · ^ mapa · % TO-DO. */
export function crearSugerenciasMenciones(datos: DatosMenciones): SugerenciaMencion[] {
  return [
    {
      char: '@',
      allowSpaces: true,
      allowedPrefixes: PREFIJOS_VALIDOS,
      items: ({ query }) => filtrarMenciones(datos.usuarios(), query),
      render: renderMenciones,
    },
    {
      char: '&',
      allowSpaces: true,
      allowedPrefixes: PREFIJOS_VALIDOS,
      items: ({ query }) => filtrarMenciones(datos.documentos(), query),
      render: renderMenciones,
    },
    {
      char: '^',
      allowSpaces: true,
      allowedPrefixes: PREFIJOS_VALIDOS,
      items: ({ query }) => filtrarMenciones(datos.mapas(), query),
      render: renderMenciones,
    },
    {
      char: '%',
      allowSpaces: true,
      allowedPrefixes: PREFIJOS_VALIDOS,
      items: ({ query }) => filtrarMenciones(datos.todos(), query),
      render: renderMenciones,
    },
    {
      char: '#',
      allowSpaces: true,
      allowedPrefixes: PREFIJOS_VALIDOS,
      debounce: 250,
      items: async ({ editor, query }) => {
        const lista = listaVigente(editor);
        if (!lista) return filtrarMenciones(datos.listas(), query);
        return datos.tareasDeLista(lista.id, query);
      },
      render: renderMenciones,
    },
  ];
}
