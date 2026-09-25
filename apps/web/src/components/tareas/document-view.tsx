'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { sesionActual } from '@/lib/auth/sesion';
import { api, apiFetch } from '@/lib/api/cliente';
import { entitySlug, findEntityByParam, shortUid } from '@/lib/slugs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DivisorRedimensionable, ANCHO_PAGINAS_DEFECTO, clampAncho } from '@/components/ui/divisor-redimensionable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { contarPalabras, formatearConteoPalabras, moverElemento } from '@erp/shared';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { extensionesDocumento, getMarkdown, type TipoMencion } from './documento-editor';
import { BotonHerramienta, SeparadorHerramienta, BarraHerramientas } from '@/components/entidad/barra-herramientas';
import { AccionesTabla } from './tabla-acciones';
import { AyudaMenciones } from './ayuda-menciones';
import { crearSugerenciasMenciones } from './selector-menciones';
import { extraerMencionesUsuario } from './menciones-utils';
import {
  Plus,
  Trash2,
  FileText,
  Loader2,
  Undo2,
  Redo2,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  RemoveFormatting,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Minus,
  Link2,
  Maximize2,
  Minimize2,
  Printer,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Copy,
  MoreHorizontal,
  GripVertical,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTareas } from '@/components/tareas/tareas-context';
import { ShareButton } from '@/components/tareas/share-entity-dialog';
import { AccionEntidad } from '@/components/entidad/accion-entidad';
import { CabeceraEntidad } from '@/components/entidad/cabecera-entidad';
import { ToggleModoEntidad } from '@/components/entidad/toggle-modo-entidad';
import { IndicadorGuardado } from '@/components/entidad/indicador-guardado';
import { PanelEntidad } from '@/components/entidad/panel-entidad';
import { EntidadPagina } from '@/components/entidad/entidad-pagina';
import { toast } from 'sonner';
import type { TaskDocument, DocumentPage } from '@/types';

const ESPERA_REORDEN_MS = 150;

export function DocumentView({ docId: paramDocId }: { docId: string }) {
  const ctx = useTareas();
  const docEntity = ctx.loading
    ? undefined
    : findEntityByParam(paramDocId, ctx.documents);
  const docId = docEntity?.id ?? (ctx.loading ? null : paramDocId);
  const canWrite = ctx.canWrite('document', docId ?? paramDocId);
  const [doc, setDoc] = useState<TaskDocument | null>(null);
  const [pages, setPagesState] = useState<DocumentPage[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [loading, setLoading] = useState(true);
  const [agregandoPagina, setAgregandoPagina] = useState(false);
  const [mode, setMode] = useState<'edit' | 'view'>('view');
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [anchoPaginas, setAnchoPaginas] = useState(ANCHO_PAGINAS_DEFECTO);
  const [paginasColapsadas, setPaginasColapsadas] = useState(false);
  const [filtroPaginas, setFiltroPaginas] = useState('');
  const [paginasPendientes, setPaginasPendientes] = useState<Set<string>>(() => new Set());
  const [edicionTitulo, setEdicionTitulo] = useState<{ id: string; valor: string } | null>(null);
  const [paginaAEliminar, setPaginaAEliminar] = useState<DocumentPage | null>(null);
  const [eliminandoPagina, setEliminandoPagina] = useState(false);
  const [duplicandoPagina, setDuplicandoPagina] = useState<string | null>(null);
  const [paginaArrastrada, setPaginaArrastrada] = useState<string | null>(null);

  const router = useRouter();
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef('');
  const dirtyRef = useRef(false);
  const dirtyPageRef = useRef<string | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctxRef = useRef(ctx);
  const mencionesRef = useRef<Set<string>>(new Set());
  const paginasRef = useRef<DocumentPage[]>([]);
  const itemsPaginaRef = useRef(new Map<string, HTMLButtonElement>());
  const arrastreRef = useRef<{ id: string; original: DocumentPage[]; actual: DocumentPage[] } | null>(
    null
  );
  const colaOrdenRef = useRef<Promise<void>>(Promise.resolve());
  const versionOrdenRef = useRef(0);
  const pendienteOrdenRef = useRef<{ lista: DocumentPage[]; revertirA?: DocumentPage[] } | null>(
    null
  );
  const timerOrdenRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esperasOrdenRef = useRef<Array<() => void>>([]);
  const soltadoRef = useRef(false);
  const renombrandoRef = useRef(false);

  // El ref de páginas es la fuente de verdad en flujos imperativos (arrastre,
  // atajos, duplicado): se actualiza junto al estado para que `dragend` no lea
  // una lista desactualizada por efectos pasivos aún sin correr.
  const aplicarPaginas = useCallback(
    (siguiente: DocumentPage[] | ((prev: DocumentPage[]) => DocumentPage[])) => {
      const lista =
        typeof siguiente === 'function' ? siguiente(paginasRef.current) : siguiente;
      paginasRef.current = lista;
      setPagesState(lista);
      return lista;
    },
    []
  );

  useEffect(() => {
    ctxRef.current = ctx;
  });

  const paginasVisibles = useMemo(() => {
    const q = filtroPaginas.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.title.toLowerCase().includes(q));
  }, [pages, filtroPaginas]);

  const palabrasPaginaActiva = useMemo(() => {
    const page = pages.find((p) => p.id === currentId);
    return page ? contarPalabras(page.content) : 0;
  }, [pages, currentId]);

  // Preferencias del panel (lectura SSR-safe post-mount).
  useEffect(() => {
    try {
      const anchoGuardado = Number(window.localStorage.getItem('documento-ancho-paginas'));
      if (Number.isFinite(anchoGuardado) && anchoGuardado > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Lectura post-mount de localStorage (ver dashboard-layout.tsx)
        setAnchoPaginas(clampAncho(anchoGuardado));
      }
      setPaginasColapsadas(window.localStorage.getItem('documento-paginas-colapsado') === '1');
    } catch {
      // almacenamiento no disponible
    }
  }, []);

  // Cancelar el debounce de reorden al desmontar.
  useEffect(() => {
    return () => {
      if (timerOrdenRef.current) clearTimeout(timerOrdenRef.current);
    };
  }, []);

  // Mantiene visible la página activa al cambiar con atajos o al vuelo.
  useEffect(() => {
    if (!currentId) return;
    const el = itemsPaginaRef.current.get(currentId);
    if (!el?.scrollIntoView) return;
    const reducido =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', behavior: reducido ? 'auto' : 'smooth' });
  }, [currentId, paginasVisibles.length]);

  // Sugerencias de menciones: los callbacks leen `ctxRef` para no capturar
  // datos viejos (los plugins se crean una sola vez con el editor). El acceso
  // al ref ocurre al invocar los getters, no durante el render.
  /* eslint-disable react-hooks/refs -- getters estables para plugins de Tiptap */
  const sugerencias = useMemo(
    () =>
      crearSugerenciasMenciones({
        usuarios: () =>
          ctxRef.current.collaborators.map((c) => ({
            id: c.id,
            label: c.full_name,
            tipo: 'usuario' as const,
          })),
        listas: () =>
          ctxRef.current.lists.map((l) => ({ id: l.id, label: l.name, tipo: 'lista' as const })),
        documentos: () =>
          ctxRef.current.documents.map((d) => ({
            id: d.id,
            label: d.name,
            tipo: 'documento' as const,
          })),
        mapas: () =>
          ctxRef.current.mindmaps.map((m) => ({ id: m.id, label: m.name, tipo: 'mapa' as const })),
        todos: () =>
          ctxRef.current.todos.map((t) => ({ id: t.id, label: t.name, tipo: 'todo' as const })),
        tareasDeLista: async (listaId, query) => {
          const res = await apiFetch<{ tasks: { id: string; title: string }[] }>(
            `/tareas?list_id=${encodeURIComponent(listaId)}&q=${encodeURIComponent(query)}&limit=20`
          ).catch(() => null);
          return (res?.tasks ?? []).map((t) => ({
            id: t.id,
            label: t.title,
            tipo: 'tarea' as const,
            lista: listaId,
          }));
        },
      }),
    []
  );
  const extensiones = useMemo(() => extensionesDocumento({ sugerencias }), [sugerencias]);
  /* eslint-enable react-hooks/refs */

  const editor = useEditor({
    extensions: extensiones,
    content: '',
    editable: canWrite && mode === 'edit',
    onUpdate: ({ editor: ed }) => {
      updateDraft({ content: getMarkdown(ed) });
    },
  });

  const switchMode = (next: 'edit' | 'view') => {
    if (next === mode) return;
    if (dirtyRef.current) flushSave();
    setMode(next);
    if (next === 'edit') {
      requestAnimationFrame(() => editor?.commands.focus());
    }
  };

  // Pantalla completa: API nativa sobre el contenedor del documento; si el
  // navegador no la soporta, overlay CSS equivalente.
  const alternarPantallaCompleta = async () => {
    if (pantallaCompleta) {
      setPantallaCompleta(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      return;
    }
    const el = contenedorRef.current;
    if (el?.requestFullscreen) {
      try {
        await el.requestFullscreen();
        setPantallaCompleta(true);
        return;
      } catch {
        // sin soporte/permiso: cae al overlay
      }
    }
    setPantallaCompleta(true);
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setPantallaCompleta(document.fullscreenElement === contenedorRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Salida con Escape y bloqueo del scroll de fondo solo en el overlay
  // (en fullscreen nativo el navegador ya maneja ambos).
  useEffect(() => {
    if (!pantallaCompleta || document.fullscreenElement) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPantallaCompleta(false);
    };
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflowPrevio;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pantallaCompleta]);

  // Menciones de usuario agregadas en esta sesión: se notifican una sola vez
  // (el API dedupe por página+usuario por si hay reintentos o varias pestañas).
  const notificarMencionesNuevas = useCallback(
    (paginaId: string) => {
      if (!editor || !docId) return;
      const actuales = extraerMencionesUsuario(editor.state.doc);
      const nuevas = actuales.filter((uid) => !mencionesRef.current.has(uid));
      if (nuevas.length === 0) return;
      nuevas.forEach((uid) => mencionesRef.current.add(uid));
      void api
        .post(`/documentos/${docId}/menciones`, { pagina_id: paginaId, usuario_ids: nuevas })
        .catch(() => undefined);
    },
    [docId, editor]
  );

  const marcarPaginaPendiente = useCallback((id: string | null) => {
    if (!id) return;
    setPaginasPendientes((prev) => {
      if (prev.has(id)) return prev;
      const siguiente = new Set(prev);
      siguiente.add(id);
      return siguiente;
    });
  }, []);

  const desmarcarPaginaPendiente = useCallback((id: string) => {
    setPaginasPendientes((prev) => {
      if (!prev.has(id)) return prev;
      const siguiente = new Set(prev);
      siguiente.delete(id);
      return siguiente;
    });
  }, []);

  const flushSave = useCallback(async () => {
    const id = dirtyPageRef.current;
    if (!id || !dirtyRef.current) return;
    dirtyRef.current = false;
    dirtyPageRef.current = null;
    setSaveState('saving');
    const md = getMarkdown(editor);
    const title = titleRef.current;
    try {
      await api.put(`/documentos/${docId}/paginas/${id}`, { title, content: md });
    } catch {
      toast.error('No se pudo guardar el documento');
      dirtyRef.current = true;
      dirtyPageRef.current = id;
      setSaveState('unsaved');
      return;
    }
    // Sincronizar el estado local para que al cambiar de página se muestre el
    // contenido guardado y no se vuelva a escribir encima con datos obsoletos.
    aplicarPaginas((prev) => prev.map((p) => (p.id === id ? { ...p, title, content: md } : p)));
    desmarcarPaginaPendiente(id);
    setSaveState('saved');
    notificarMencionesNuevas(id);
  }, [docId, editor, notificarMencionesNuevas, desmarcarPaginaPendiente, aplicarPaginas]);

  const imprimir = async () => {
    await flushSave();
    window.print();
  };

  const updateDraft = useCallback((patch: { content?: string }) => {
    if (patch.content !== undefined) {
      dirtyRef.current = true;
      dirtyPageRef.current = currentIdRef.current;
      marcarPaginaPendiente(currentIdRef.current);
      setSaveState('unsaved');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { flushSave(); }, 700);
    }
  }, [flushSave, marcarPaginaPendiente]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flushSave();
    };
  }, [flushSave]);

  const updateTitle = (value: string) => {
    titleRef.current = value;
    setTitle(value);
    dirtyRef.current = true;
    dirtyPageRef.current = currentIdRef.current;
    marcarPaginaPendiente(currentIdRef.current);
    setSaveState('unsaved');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { flushSave(); }, 700);
  };

  const docQuery = useQuery({
    queryKey: ['documento', 'detalle', docId],
    queryFn: async () => {
      const sesion = await sesionActual();
      if (!sesion) return null;
      if (!docId) return null;
      const [docRes, pagesRes] = await Promise.all([
        apiFetch<{ documento: TaskDocument | null }>(`/documentos/${docId}`).catch(() => null),
        apiFetch<{ paginas: DocumentPage[] }>(`/documentos/${docId}/paginas`).catch(() => null),
      ]);
      return { documento: docRes?.documento ?? null, paginas: pagesRes?.paginas ?? [] };
    },
    enabled: !!docId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    const data = docQuery.data;
    if (!data) return;
    setDoc(data.documento);
    aplicarPaginas(data.paginas);
    setPaginasPendientes(new Set());
    setEdicionTitulo(null);
    setFiltroPaginas('');
    const initial = data.paginas.find((p) => p.is_main) || data.paginas[0];
    if (initial) {
      currentIdRef.current = initial.id;
      setCurrentId(initial.id);
      titleRef.current = initial.title;
      setTitle(initial.title);
    }
    setLoading(false);
  }, [docQuery.data, aplicarPaginas]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Cambio de página: guardar pendiente y cargar nueva en el editor
  useEffect(() => {
    const page = pages.find((p) => p.id === currentId);
    if (!page) return;
    currentIdRef.current = page.id;
    if (dirtyRef.current) flushSave();
    titleRef.current = page.title;
    setTitle(page.title); // eslint-disable-line react-hooks/set-state-in-effect
    dirtyRef.current = false;
    dirtyPageRef.current = null;
    if (editor) {
      // emitUpdate:false evita que setContent marque la página como pendiente
      // y programe un guardado con contenido aún sin cargar.
      editor.commands.setContent(page.content, { emitUpdate: false });
      // Las menciones ya guardadas no deben re-notificar al reabrir.
      mencionesRef.current = new Set(extraerMencionesUsuario(editor.state.doc));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, editor]);

  // Tiptap v3 no reaplica `editable` en re-render (useEditor preserva el valor
  // actual), así que lo sincronizamos explícitamente con el modo y los
  // permisos. `emitUpdate: false` evita que el cambio dispare onUpdate → dirty
  // → autosave espurio (y el "Sin guardar…" al abrir el documento).
  useEffect(() => {
    editor?.setEditable(!!canWrite && mode === 'edit', false);
  }, [editor, canWrite, mode]);

  const cambiarAnchoPaginas = useCallback((valor: number) => {
    const siguiente = clampAncho(valor);
    setAnchoPaginas(siguiente);
    try {
      window.localStorage.setItem('documento-ancho-paginas', String(siguiente));
    } catch {
      // almacenamiento no disponible
    }
  }, []);

  const alternarPaginas = useCallback(() => {
    setPaginasColapsadas((prev) => {
      const siguiente = !prev;
      try {
        window.localStorage.setItem('documento-paginas-colapsado', siguiente ? '1' : '0');
      } catch {
        // almacenamiento no disponible
      }
      return siguiente;
    });
  }, []);

  const addPage = useCallback(async () => {
    if (agregandoPagina) return;
    setAgregandoPagina(true);
    try {
      const lista = paginasRef.current;
      const res = await api.post<{ pagina: DocumentPage }>(`/documentos/${docId}/paginas`, {
        title: `Página ${lista.length + 1}`,
        content: '',
        position: lista.length,
      }).catch(() => null);
      if (!res?.pagina) {
        toast.error('No se pudo crear la página');
        return;
      }
      const page = res.pagina;
      aplicarPaginas((prev) => [...prev, page]);
      setFiltroPaginas('');
      setCurrentId(page.id);
    } finally {
      setAgregandoPagina(false);
    }
  }, [agregandoPagina, docId, aplicarPaginas]);

  // Reórdenes rápidos (teclado/drag) se agrupan: se persiste el último orden
  // con un solo PATCH, serializado para no pisar escrituras en vuelo.
  const volcarOrden = useCallback(() => {
    const pendiente = pendienteOrdenRef.current;
    if (!pendiente) return;
    pendienteOrdenRef.current = null;
    const version = versionOrdenRef.current + 1;
    versionOrdenRef.current = version;
    const tarea = colaOrdenRef.current.then(async () => {
      try {
        await api.patch(`/documentos/${docId}/paginas/reordenar`, {
          orden: pendiente.lista.map((p) => p.id),
        });
      } catch {
        if (pendiente.revertirA && versionOrdenRef.current === version) {
          aplicarPaginas(pendiente.revertirA);
        }
        toast.error('No se pudo reordenar las páginas');
      } finally {
        const esperas = esperasOrdenRef.current;
        esperasOrdenRef.current = [];
        esperas.forEach((resolver) => resolver());
      }
    });
    colaOrdenRef.current = tarea.catch(() => undefined);
  }, [docId, aplicarPaginas]);

  const persistirOrden = useCallback(
    (lista: DocumentPage[], revertirA?: DocumentPage[]) => {
      aplicarPaginas(lista);
      pendienteOrdenRef.current = { lista, revertirA };
      const espera = new Promise<void>((resolve) => {
        esperasOrdenRef.current.push(resolve);
      });
      if (timerOrdenRef.current) clearTimeout(timerOrdenRef.current);
      timerOrdenRef.current = setTimeout(() => {
        timerOrdenRef.current = null;
        volcarOrden();
      }, ESPERA_REORDEN_MS);
      return espera;
    },
    [volcarOrden, aplicarPaginas]
  );

  const moverPagina = useCallback(
    (desde: number, hasta: number) => {
      if (desde === hasta) return;
      const anterior = paginasRef.current;
      void persistirOrden(moverElemento(anterior, desde, hasta), anterior);
    },
    [persistirOrden]
  );

  const borrarPagina = useCallback(
    async (id: string) => {
      const page = paginasRef.current.find((p) => p.id === id);
      if (!page || page.is_main || !docId) return;
      if (currentIdRef.current === id) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        dirtyRef.current = false;
        dirtyPageRef.current = null;
      }
      const ok = await api
        .delete(`/documentos/${docId}/paginas/${id}`)
        .then(() => true)
        .catch(() => false);
      if (!ok) {
        toast.error('No se pudo eliminar la página');
        return;
      }
      const remaining = paginasRef.current.filter((p) => p.id !== id);
      aplicarPaginas(remaining);
      desmarcarPaginaPendiente(id);
      if (currentIdRef.current === id) {
        const next = remaining.find((p) => p.is_main) || remaining[0];
        if (next) {
          setCurrentId(next.id);
        } else {
          currentIdRef.current = null;
          setCurrentId(null);
          titleRef.current = '';
          setTitle('');
        }
      }
    },
    [docId, desmarcarPaginaPendiente, aplicarPaginas]
  );

  const confirmarEliminarPagina = async () => {
    if (!paginaAEliminar) return;
    setEliminandoPagina(true);
    await borrarPagina(paginaAEliminar.id);
    setEliminandoPagina(false);
    setPaginaAEliminar(null);
  };

  // Contenido más reciente de una página: si es la activa y tiene cambios
  // pendientes, primero se vuelca al servidor y se serializa el editor.
  const contenidoActualDe = useCallback(
    async (page: DocumentPage) => {
      if (page.id === currentIdRef.current && dirtyRef.current) await flushSave();
      return page.id === currentIdRef.current && editor ? getMarkdown(editor) : page.content;
    },
    [editor, flushSave]
  );

  const confirmarRenombrarPagina = useCallback(async () => {
    const edicion = edicionTitulo;
    if (!edicion || renombrandoRef.current) return;
    renombrandoRef.current = true;
    setEdicionTitulo(null);
    try {
      const page = paginasRef.current.find((p) => p.id === edicion.id);
      const nuevo = edicion.valor.trim();
      if (!page || !nuevo || nuevo === page.title || !docId) return;
      const contenido = await contenidoActualDe(page);
      await api.put(`/documentos/${docId}/paginas/${page.id}`, { title: nuevo, content: contenido });
      aplicarPaginas((prev) =>
        prev.map((p) => (p.id === page.id ? { ...p, title: nuevo, content: contenido } : p))
      );
      if (page.id === currentIdRef.current) {
        titleRef.current = nuevo;
        setTitle(nuevo);
      }
    } catch {
      toast.error('No se pudo renombrar la página');
    } finally {
      renombrandoRef.current = false;
    }
  }, [edicionTitulo, docId, contenidoActualDe, aplicarPaginas]);

  const duplicarPagina = useCallback(
    async (page: DocumentPage) => {
      if (!docId || duplicandoPagina) return;
      setDuplicandoPagina(page.id);
      try {
        const original = paginasRef.current;
        const indice = original.findIndex((p) => p.id === page.id);
        if (indice < 0) return;
        const contenido = await contenidoActualDe(page);
        const res = await api
          .post<{ pagina: DocumentPage }>(`/documentos/${docId}/paginas`, {
            title: `${page.title} (copia)`,
            content: contenido,
            position: indice + 1,
          })
          .catch(() => null);
        if (!res?.pagina) {
          toast.error('No se pudo duplicar la página');
          return;
        }
        const creada = res.pagina;
        const lista = [...original.slice(0, indice + 1), creada, ...original.slice(indice + 1)];
        setFiltroPaginas('');
        setCurrentId(creada.id);
        await persistirOrden(lista);
      } finally {
        setDuplicandoPagina(null);
      }
    },
    [docId, duplicandoPagina, contenidoActualDe, persistirOrden]
  );

  const enfocarPagina = useCallback((id: string) => {
    requestAnimationFrame(() => itemsPaginaRef.current.get(id)?.focus());
  }, []);

  const alTeclearPagina = (e: React.KeyboardEvent, page: DocumentPage) => {
    if (e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const lista = paginasRef.current;
      const desde = lista.findIndex((p) => p.id === page.id);
      const hasta = e.key === 'ArrowUp' ? desde - 1 : desde + 1;
      if (desde < 0 || hasta < 0 || hasta >= lista.length) return;
      moverPagina(desde, hasta);
      enfocarPagina(page.id);
      return;
    }
    const visibles = paginasVisibles;
    const indice = visibles.findIndex((p) => p.id === page.id);
    let destino: DocumentPage | undefined;
    if (e.key === 'ArrowDown') destino = visibles[indice + 1];
    else if (e.key === 'ArrowUp') destino = visibles[indice - 1];
    else if (e.key === 'Home') destino = visibles[0];
    else if (e.key === 'End') destino = visibles[visibles.length - 1];
    else return;
    e.preventDefault();
    if (destino) {
      setCurrentId(destino.id);
      enfocarPagina(destino.id);
    }
  };

  const alSoltarPagina = (destino: DocumentPage) => {
    const arrastre = arrastreRef.current;
    if (!arrastre) return;
    const desde = arrastre.actual.findIndex((p) => p.id === arrastre.id);
    const hasta = arrastre.actual.findIndex((p) => p.id === destino.id);
    if (desde < 0 || hasta < 0 || desde === hasta) return;
    arrastre.actual = moverElemento(arrastre.actual, desde, hasta);
    aplicarPaginas(arrastre.actual);
  };

  const alTerminarArrastre = () => {
    setPaginaArrastrada(null);
    const arrastre = arrastreRef.current;
    arrastreRef.current = null;
    if (!arrastre) return;
    const { original, actual } = arrastre;
    if (!soltadoRef.current) {
      aplicarPaginas(original);
      return;
    }
    const mismoOrden =
      actual.length === original.length && actual.every((p, i) => p.id === original[i]?.id);
    if (!mismoOrden) void persistirOrden(actual, original);
  };

  // Atajos globales: Alt+↑/↓ cambia de página y Alt+N crea una nueva.
  // ProseMirror ya usa Alt+flechas dentro del editor (join), así que los
  // eventos con defaultPrevented se ignoran.
  useEffect(() => {
    const alTeclearVentana = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const lista = paginasRef.current;
        const indice = lista.findIndex((p) => p.id === currentIdRef.current);
        if (indice < 0) return;
        const siguiente = lista[e.key === 'ArrowUp' ? indice - 1 : indice + 1];
        if (!siguiente) return;
        e.preventDefault();
        setCurrentId(siguiente.id);
      } else if (e.key.toLowerCase() === 'n' && canWrite && mode === 'edit') {
        e.preventDefault();
        void addPage();
      }
    };
    window.addEventListener('keydown', alTeclearVentana);
    return () => window.removeEventListener('keydown', alTeclearVentana);
  }, [canWrite, mode, addPage]);

  const setLink = () => {
    if (!editor) return;
    const prev = (editor.getAttributes('link').href as string) || '';
    const url = window.prompt('URL del enlace', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const rutaDeLista = (listaId: string): string | null => {
    const c = ctxRef.current;
    const lista = c.lists.find((l) => l.id === listaId);
    if (!lista) return null;
    const ws = c.workspaces.find((w) => w.id === lista.workspace_id);
    if (!ws) return null;
    const folder = lista.folder_id ? c.folders.find((f) => f.id === lista.folder_id) : undefined;
    return `/proyectos/${entitySlug(ws, c.workspaces)}/${folder ? entitySlug(folder, c.folders) : 'raiz'}/${entitySlug(lista, c.lists)}`;
  };

  const rutaDeContenido = (
    id: string,
    tipo: 'documento' | 'mapa' | 'todo'
  ): string | null => {
    const c = ctxRef.current;
    const pool =
      tipo === 'documento' ? c.documents : tipo === 'mapa' ? c.mindmaps : c.todos;
    const entidad = pool.find((e) => e.id === id);
    if (!entidad) return null;
    const ws = c.workspaces.find((w) => w.id === entidad.workspace_id);
    if (!ws) return null;
    const folder = entidad.folder_id
      ? c.folders.find((f) => f.id === entidad.folder_id)
      : undefined;
    const segmento = tipo === 'documento' ? 'documento' : tipo === 'mapa' ? 'mapa' : 'todo';
    return `/proyectos/${entitySlug(ws, c.workspaces)}/${folder ? entitySlug(folder, c.folders) : 'raiz'}/${segmento}/${entitySlug(entidad, pool)}`;
  };

  const manejarClickEditor = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('span[data-type="mencion"]') as HTMLElement | null;
    if (!el) return;
    e.preventDefault();
    const tipo = el.getAttribute('data-tipo') as TipoMencion | null;
    const id = el.getAttribute('data-id');
    const lista = el.getAttribute('data-lista');
    if (!tipo || !id) return;

    let ruta: string | null = null;
    if (tipo === 'usuario') ruta = '/colaboradores';
    else if (tipo === 'lista') ruta = rutaDeLista(id);
    else if (tipo === 'tarea') ruta = lista ? rutaDeLista(lista) : null;
    else ruta = rutaDeContenido(id, tipo);
    if (tipo === 'tarea' && ruta) ruta = `${ruta}/tarea/${shortUid(id)}`;

    if (!ruta) {
      toast.error('La mención ya no existe o no tenés acceso');
      return;
    }
    router.push(ruta);
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3rem)] gap-4">
        <Skeleton className="w-48 rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );
  }

  if (!doc) {
    return <p className="text-muted-foreground">Documento no encontrado</p>;
  }

  const t = (cmd: () => void) => () => editor && cmd();

  return (
    <EntidadPagina
      ref={contenedorRef}
      alto="completa"
      className={cn(
        'print:static print:block print:h-auto print:overflow-visible',
        pantallaCompleta
          ? 'fixed inset-0 z-50 h-auto overflow-auto bg-background p-4 sm:p-6'
          : 'h-[calc(100vh-3rem)]'
      )}
    >
      <CabeceraEntidad
        tipo="document"
        titulo={doc.name}
        className="print:hidden"
        estado={<IndicadorGuardado estado={saveState} />}
        acciones={
          <>
            {docEntity && docId && ctx.isAdmin && (
              <ShareButton onClick={() => ctx.openShare('document', docEntity)} />
            )}
            <AccionEntidad
              icono={pantallaCompleta ? Minimize2 : Maximize2}
              pressed={pantallaCompleta}
              onClick={() => void alternarPantallaCompleta()}
              title={pantallaCompleta ? 'Salir de pantalla completa' : 'Ver y editar a pantalla completa'}
            >
              <span className="hidden sm:inline">{pantallaCompleta ? 'Salir' : 'Pantalla completa'}</span>
            </AccionEntidad>
            <AccionEntidad
              icono={Printer}
              onClick={() => void imprimir()}
              title="Imprimir la página actual"
            >
              <span className="hidden sm:inline">Imprimir</span>
            </AccionEntidad>
            <ToggleModoEntidad
              modo={mode === 'edit' ? 'editar' : 'ver'}
              onCambio={(m) => switchMode(m === 'editar' ? 'edit' : 'view')}
              disabled={!canWrite}
            />
          </>
        }
      />

      {/* Encabezado solo para impresión */}
      <div className="mb-4 hidden print:block">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{doc.name}</p>
        <h1 className="text-base font-bold text-black">{title || 'Documento'}</h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row print:block print:min-h-0">
        {/* Nav de páginas */}
        <PanelEntidad
          ref={panelRef}
          style={{ '--ancho-paginas': `${anchoPaginas}px` } as React.CSSProperties}
          titulo="Páginas"
          tituloClassName="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          className={cn(
            'w-full shrink-0 gap-0 rounded-md py-0 lg:w-[var(--ancho-paginas)] print:hidden',
            paginasColapsadas && 'lg:hidden'
          )}
          cabeceraClassName="items-center border-b px-2 py-2"
          contenidoClassName="flex flex-1 gap-0.5 space-y-0 overflow-x-auto p-1.5 lg:flex-col lg:space-y-0.5 lg:overflow-y-auto lg:overflow-x-hidden"
          acciones={
            <div className="flex items-center gap-0.5">
              {canWrite && mode === 'edit' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={addPage}
                  disabled={agregandoPagina}
                  title="Nueva página (Alt+N)"
                  aria-busy={agregandoPagina}
                >
                  {agregandoPagina ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="hidden size-6 lg:inline-flex"
                onClick={alternarPaginas}
                title="Ocultar panel de páginas"
                aria-label="Ocultar panel de páginas"
              >
                <PanelLeftClose className="size-3.5" />
              </Button>
            </div>
          }
        >
          {pages.length > 6 && (
            <div className="relative hidden w-full shrink-0 px-0.5 pb-0.5 lg:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filtroPaginas}
                onChange={(e) => setFiltroPaginas(e.target.value)}
                placeholder="Buscar página"
                aria-label="Buscar página"
                className="h-7 pl-7 text-xs"
              />
            </div>
          )}
          {paginasVisibles.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {pages.length === 0 ? 'Sin páginas' : 'Sin resultados'}
            </p>
          )}
          {paginasVisibles.map((page) => {
            const active = page.id === currentId;
            const enEdicion = edicionTitulo?.id === page.id;
            const pendiente = paginasPendientes.has(page.id);
            const puedeGestionar = canWrite && mode === 'edit';
            const arrastrable = puedeGestionar && !filtroPaginas.trim() && !enEdicion;
            const conFoco =
              active || (!paginasVisibles.some((p) => p.id === currentId) && paginasVisibles[0]?.id === page.id);
            return (
              <div
                key={page.id}
                draggable={arrastrable}
                onDragStart={(e) => {
                  arrastreRef.current = {
                    id: page.id,
                    original: paginasRef.current,
                    actual: paginasRef.current,
                  };
                  soltadoRef.current = false;
                  setPaginaArrastrada(page.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', page.id);
                }}
                onDragOver={(e) => {
                  if (!arrastreRef.current || arrastreRef.current.id === page.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  alSoltarPagina(page);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  soltadoRef.current = true;
                }}
                onDragEnd={alTerminarArrastre}
                className={cn(
                  'group flex items-center gap-0.5 rounded-md',
                  paginaArrastrada === page.id && 'opacity-40'
                )}
              >
                {arrastrable && (
                  <span
                    aria-hidden
                    className="hidden cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground lg:block"
                  >
                    <GripVertical className="size-3.5" />
                  </span>
                )}
                {enEdicion ? (
                  <Input
                    autoFocus
                    value={edicionTitulo.valor}
                    onChange={(e) => setEdicionTitulo({ id: page.id, valor: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void confirmarRenombrarPagina();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEdicionTitulo(null);
                      }
                    }}
                    onBlur={() => void confirmarRenombrarPagina()}
                    className="h-7 flex-1 px-1.5 text-sm"
                    aria-label={`Renombrar ${page.title}`}
                  />
                ) : (
                  <button
                    ref={(el) => {
                      if (el) itemsPaginaRef.current.set(page.id, el);
                      else itemsPaginaRef.current.delete(page.id);
                    }}
                    onClick={() => setCurrentId(page.id)}
                    onDoubleClick={() =>
                      puedeGestionar && setEdicionTitulo({ id: page.id, valor: page.title })
                    }
                    onKeyDown={(e) => alTeclearPagina(e, page)}
                    tabIndex={conFoco ? 0 : -1}
                    aria-current={active ? 'page' : undefined}
                    title={`${page.title} · ${formatearConteoPalabras(contarPalabras(page.content))}`}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap transition-colors',
                      active
                        ? 'bg-primary/10 font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="flex-1 truncate">{page.title}</span>
                    {pendiente && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-warning"
                        title="Cambios sin guardar"
                        aria-label="Cambios sin guardar"
                      />
                    )}
                    {page.is_main && <span className="text-xs text-muted-foreground/60">principal</span>}
                  </button>
                )}
                {puedeGestionar && !enEdicion && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                        title={`Acciones de ${page.title}`}
                        aria-label={`Acciones de ${page.title}`}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-40">
                      <DropdownMenuItem
                        disabled={!!duplicandoPagina}
                        onSelect={() => setEdicionTitulo({ id: page.id, valor: page.title })}
                      >
                        <Pencil className="size-3.5" /> Renombrar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!!duplicandoPagina}
                        onSelect={() => void duplicarPagina(page)}
                      >
                        <Copy className="size-3.5" /> Duplicar
                      </DropdownMenuItem>
                      {!page.is_main && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!!duplicandoPagina}
                            variant="destructive"
                            onSelect={() => setPaginaAEliminar(page)}
                          >
                            <Trash2 className="size-3.5" /> Eliminar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </PanelEntidad>

        <DivisorRedimensionable
          ancho={anchoPaginas}
          onAncho={cambiarAnchoPaginas}
          contenedorRef={panelRef}
          className={cn(paginasColapsadas && 'lg:hidden')}
        />

        {/* Editor WYSIWYG */}
        <div className="flex min-w-0 flex-1 flex-col rounded-md border bg-background print:block print:h-auto print:overflow-visible print:rounded-none print:border-0">
          <div className="flex items-center gap-1 border-b p-3 print:hidden">
            {paginasColapsadas && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden size-7 shrink-0 lg:inline-flex"
                onClick={alternarPaginas}
                title="Mostrar panel de páginas"
                aria-label="Mostrar panel de páginas"
              >
                <PanelLeftOpen className="size-4" />
              </Button>
            )}
            <Input
              value={title}
              onChange={(e) => updateTitle(e.target.value)}
              readOnly={!canWrite || mode === 'view'}
              className="h-8 flex-1 border-0 bg-transparent px-1 text-base font-semibold focus-visible:ring-1"
              placeholder="Título de la página"
            />
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {formatearConteoPalabras(palabrasPaginaActiva)}
            </span>
          </div>

          {/* Barra de herramientas */}
          {canWrite && mode === 'edit' && (
          <BarraHerramientas className="border-b px-2 py-1.5 print:hidden">
            <BotonHerramienta title="Deshacer" disabled={!editor?.can().undo()} onClick={t(() => editor!.chain().focus().undo().run())}>
              <Undo2 className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Rehacer" disabled={!editor?.can().redo()} onClick={t(() => editor!.chain().focus().redo().run())}>
              <Redo2 className="size-4" />
            </BotonHerramienta>
            <SeparadorHerramienta />
            <BotonHerramienta title="Título 1" active={editor?.isActive('heading', { level: 1 })} onClick={t(() => editor!.chain().focus().toggleHeading({ level: 1 }).run())}>
              <Heading1 className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Título 2" active={editor?.isActive('heading', { level: 2 })} onClick={t(() => editor!.chain().focus().toggleHeading({ level: 2 }).run())}>
              <Heading2 className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Título 3" active={editor?.isActive('heading', { level: 3 })} onClick={t(() => editor!.chain().focus().toggleHeading({ level: 3 }).run())}>
              <Heading3 className="size-4" />
            </BotonHerramienta>
            <SeparadorHerramienta />
            <BotonHerramienta title="Negrita" active={editor?.isActive('bold')} onClick={t(() => editor!.chain().focus().toggleBold().run())}>
              <Bold className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Cursiva" active={editor?.isActive('italic')} onClick={t(() => editor!.chain().focus().toggleItalic().run())}>
              <Italic className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Subrayado" active={editor?.isActive('underline')} onClick={t(() => editor!.chain().focus().toggleUnderline().run())}>
              <Underline className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Tachado" active={editor?.isActive('strike')} onClick={t(() => editor!.chain().focus().toggleStrike().run())}>
              <Strikethrough className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta
              title="Limpiar formato"
              disabled={!editor?.can().unsetAllMarks()}
              onClick={t(() => editor!.chain().focus().unsetAllMarks().run())}
            >
              <RemoveFormatting className="size-4" />
            </BotonHerramienta>
            <SeparadorHerramienta />
            <BotonHerramienta title="Lista con viñetas" active={editor?.isActive('bulletList')} onClick={t(() => editor!.chain().focus().toggleBulletList().run())}>
              <List className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Lista numerada" active={editor?.isActive('orderedList')} onClick={t(() => editor!.chain().focus().toggleOrderedList().run())}>
              <ListOrdered className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Lista de tareas" active={editor?.isActive('taskList')} onClick={t(() => editor!.chain().focus().toggleTaskList().run())}>
              <ListChecks className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Cita" active={editor?.isActive('blockquote')} onClick={t(() => editor!.chain().focus().toggleBlockquote().run())}>
              <Quote className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Bloque de código" active={editor?.isActive('codeBlock')} onClick={t(() => editor!.chain().focus().toggleCodeBlock().run())}>
              <Code2 className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Separador" onClick={t(() => editor!.chain().focus().setHorizontalRule().run())}>
              <Minus className="size-4" />
            </BotonHerramienta>
            <BotonHerramienta title="Enlace" active={editor?.isActive('link')} onClick={setLink}>
              <Link2 className="size-4" />
            </BotonHerramienta>
            <SeparadorHerramienta />
            {editor && <AccionesTabla editor={editor} />}
            <SeparadorHerramienta />
            <AyudaMenciones />
          </BarraHerramientas>
          )}

          <EditorContent
            editor={editor}
            onClick={manejarClickEditor}
            className="md-body min-h-0 flex-1 overflow-y-auto print:h-auto print:overflow-visible"
          />

          {/* Menú flotante sobre la celda activa */}
          {editor && canWrite && mode === 'edit' && (
            <BubbleMenu
              editor={editor}
              shouldShow={({ editor: ed }) => ed.isEditable && ed.isActive('table')}
              options={{ placement: 'top', offset: 8 }}
              className="flex max-w-[min(94vw,760px)] flex-wrap items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-popover"
            >
              <AccionesTabla editor={editor} />
            </BubbleMenu>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!paginaAEliminar}
        onOpenChange={(open) => {
          if (!open) setPaginaAEliminar(null);
        }}
        title="Eliminar página"
        description={
          paginaAEliminar
            ? `Se eliminará «${paginaAEliminar.title}» y su contenido. Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={eliminandoPagina}
        onConfirm={() => void confirmarEliminarPagina()}
      />
    </EntidadPagina>
  );
}
