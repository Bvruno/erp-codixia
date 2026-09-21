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
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { extensionesDocumento, getMarkdown, type TipoMencion } from './documento-editor';
import { ToolbarButton, ToolbarDivider } from './editor-toolbar';
import { AccionesTabla } from './tabla-acciones';
import { AyudaMenciones } from './ayuda-menciones';
import { crearSugerenciasMenciones } from './selector-menciones';
import { extraerMencionesUsuario } from './menciones-utils';
import {
  BookOpen,
  Plus,
  Trash2,
  FileText,
  Loader2,
  Check,
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
  Pencil,
  Eye,
  Maximize2,
  Minimize2,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTareas } from '@/components/tareas/tareas-context';
import { ShareButton } from '@/components/tareas/share-entity-dialog';
import { toast } from 'sonner';
import type { TaskDocument, DocumentPage } from '@/types';

export function DocumentView({ docId: paramDocId }: { docId: string }) {
  const ctx = useTareas();
  const docEntity = ctx.loading
    ? undefined
    : findEntityByParam(paramDocId, ctx.documents);
  const docId = docEntity?.id ?? (ctx.loading ? null : paramDocId);
  const canWrite = ctx.canWrite('document', docId ?? paramDocId);
  const [doc, setDoc] = useState<TaskDocument | null>(null);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [loading, setLoading] = useState(true);
  const [agregandoPagina, setAgregandoPagina] = useState(false);
  const [mode, setMode] = useState<'edit' | 'view'>('view');
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  const router = useRouter();
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef('');
  const dirtyRef = useRef(false);
  const dirtyPageRef = useRef<string | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctxRef = useRef(ctx);
  const mencionesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    ctxRef.current = ctx;
  });

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
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title, content: md } : p)));
    setSaveState('saved');
    notificarMencionesNuevas(id);
  }, [docId, editor, notificarMencionesNuevas]);

  const imprimir = async () => {
    await flushSave();
    window.print();
  };

  const updateDraft = useCallback((patch: { content?: string }) => {
    if (patch.content !== undefined) {
      dirtyRef.current = true;
      dirtyPageRef.current = currentIdRef.current;
      setSaveState('unsaved');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { flushSave(); }, 700);
    }
  }, [flushSave]);

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
    setPages(data.paginas);
    const initial = data.paginas.find((p) => p.is_main) || data.paginas[0];
    if (initial) {
      currentIdRef.current = initial.id;
      setCurrentId(initial.id);
      titleRef.current = initial.title;
      setTitle(initial.title);
    }
    setLoading(false);
  }, [docQuery.data]);
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

  const addPage = async () => {
    if (agregandoPagina) return;
    setAgregandoPagina(true);
    try {
      const res = await api.post<{ pagina: DocumentPage }>(`/documentos/${docId}/paginas`, {
        title: `Página ${pages.length + 1}`,
        content: '',
        position: pages.length,
      }).catch(() => null);
      if (!res?.pagina) {
        toast.error('No se pudo crear la página');
        return;
      }
      const page = res.pagina;
      setPages((prev) => [...prev, page]);
      setCurrentId(page.id);
    } finally {
      setAgregandoPagina(false);
    }
  };

  const deletePage = async (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (!page || page.is_main) return;
    await api.delete(`/documentos/${docId}/paginas/${id}`).catch(() => undefined);
    const remaining = pages.filter((p) => p.id !== id);
    setPages(remaining);
    if (currentId === id) {
      const next = remaining.find((p) => p.is_main) || remaining[0];
      if (next) setCurrentId(next.id);
    }
  };

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
    <div
      ref={contenedorRef}
      className={cn(
        'flex flex-col print:static print:block print:h-auto print:overflow-visible',
        pantallaCompleta
          ? 'fixed inset-0 z-50 overflow-auto bg-background p-4 sm:p-6'
          : 'h-[calc(100vh-3rem)]'
      )}
    >
      <div className="mb-3 flex items-center gap-2 print:hidden">
        <BookOpen className="size-5 text-indigo-500" />
        <h1 className="text-xl font-bold">{doc.name}</h1>
        <div className="ml-auto flex items-center gap-2">
          {docEntity && docId && ctx.isAdmin && (
            <ShareButton onClick={() => ctx.openShare('document', docEntity)} />
          )}
          <button
            onClick={() => void alternarPantallaCompleta()}
            aria-pressed={pantallaCompleta}
            title={pantallaCompleta ? 'Salir de pantalla completa' : 'Ver y editar a pantalla completa'}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {pantallaCompleta ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            <span className="hidden sm:inline">{pantallaCompleta ? 'Salir' : 'Pantalla completa'}</span>
          </button>
          <button
            onClick={() => void imprimir()}
            title="Imprimir la página actual"
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Printer className="size-3.5" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
          <button
            onClick={() => switchMode(mode === 'edit' ? 'view' : 'edit')}
            disabled={!canWrite}
            title={
              !canWrite
                ? 'Sin permisos de edición'
                : mode === 'edit'
                  ? 'Cambiar a modo visualización'
                  : 'Cambiar a modo edición'
            }
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              mode === 'edit'
                ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {mode === 'edit' ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
            {mode === 'edit' ? 'Editando' : 'Visualizando'}
          </button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground print:hidden">
            {saveState === 'saving' && <><Loader2 className="size-3.5 animate-spin" /> Guardando…</>}
            {saveState === 'saved' && <><Check className="size-3.5 text-emerald-500" /> Guardado</>}
            {saveState === 'unsaved' && <span>Sin guardar…</span>}
          </div>
        </div>
      </div>

      {/* Encabezado solo para impresión */}
      <div className="mb-4 hidden print:block">
        <p className="text-xs uppercase tracking-wide text-neutral-600">{doc.name}</p>
        <h1 className="text-xl font-bold text-black">{title || 'Documento'}</h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row print:block print:min-h-0">
        {/* Nav de páginas */}
        <aside className="flex w-full shrink-0 flex-col rounded-md border bg-background lg:w-48 print:hidden">
          <div className="flex items-center justify-between border-b px-2 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Páginas</span>
            {canWrite && mode === 'edit' && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={addPage}
                disabled={agregandoPagina}
                title="Nueva página"
                aria-busy={agregandoPagina}
              >
                {agregandoPagina ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              </Button>
            )}
          </div>
          <div className="flex flex-1 gap-0.5 space-y-0 overflow-x-auto p-1.5 lg:flex-col lg:space-y-0.5 lg:overflow-y-auto lg:overflow-x-hidden">
            {pages.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">Sin páginas</p>
            )}
            {pages.map((page) => {
              const active = page.id === currentId;
              return (
                <div key={page.id} className="group flex items-center">
                  <button
                    onClick={() => setCurrentId(page.id)}
                    className={cn(
                      'flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap transition-colors',
                      active
                        ? 'bg-primary/10 font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                    title={page.title}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="flex-1 truncate">{page.title}</span>
                    {page.is_main && <span className="text-[10px] text-muted-foreground/60">principal</span>}
                  </button>
                  {!page.is_main && canWrite && mode === 'edit' && (
                    <button
                      onClick={() => deletePage(page.id)}
                      className="text-muted-foreground transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                      title="Eliminar página"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Editor WYSIWYG */}
        <div className="flex min-w-0 flex-1 flex-col rounded-md border bg-background print:block print:h-auto print:overflow-visible print:rounded-none print:border-0">
          <div className="border-b p-3 print:hidden">
            <Input
              value={title}
              onChange={(e) => updateTitle(e.target.value)}
              readOnly={!canWrite || mode === 'view'}
              className="h-8 border-0 bg-transparent px-1 text-lg font-semibold focus-visible:ring-1"
              placeholder="Título de la página"
            />
          </div>

          {/* Barra de herramientas */}
          {canWrite && mode === 'edit' && (
          <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5 print:hidden">
            <ToolbarButton title="Deshacer" disabled={!editor?.can().undo()} onClick={t(() => editor!.chain().focus().undo().run())}>
              <Undo2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Rehacer" disabled={!editor?.can().redo()} onClick={t(() => editor!.chain().focus().redo().run())}>
              <Redo2 className="size-4" />
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton title="Título 1" active={editor?.isActive('heading', { level: 1 })} onClick={t(() => editor!.chain().focus().toggleHeading({ level: 1 }).run())}>
              <Heading1 className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Título 2" active={editor?.isActive('heading', { level: 2 })} onClick={t(() => editor!.chain().focus().toggleHeading({ level: 2 }).run())}>
              <Heading2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Título 3" active={editor?.isActive('heading', { level: 3 })} onClick={t(() => editor!.chain().focus().toggleHeading({ level: 3 }).run())}>
              <Heading3 className="size-4" />
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton title="Negrita" active={editor?.isActive('bold')} onClick={t(() => editor!.chain().focus().toggleBold().run())}>
              <Bold className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Cursiva" active={editor?.isActive('italic')} onClick={t(() => editor!.chain().focus().toggleItalic().run())}>
              <Italic className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Subrayado" active={editor?.isActive('underline')} onClick={t(() => editor!.chain().focus().toggleUnderline().run())}>
              <Underline className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Tachado" active={editor?.isActive('strike')} onClick={t(() => editor!.chain().focus().toggleStrike().run())}>
              <Strikethrough className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Limpiar formato"
              disabled={!editor?.can().unsetAllMarks()}
              onClick={t(() => editor!.chain().focus().unsetAllMarks().run())}
            >
              <RemoveFormatting className="size-4" />
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton title="Lista con viñetas" active={editor?.isActive('bulletList')} onClick={t(() => editor!.chain().focus().toggleBulletList().run())}>
              <List className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Lista numerada" active={editor?.isActive('orderedList')} onClick={t(() => editor!.chain().focus().toggleOrderedList().run())}>
              <ListOrdered className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Lista de tareas" active={editor?.isActive('taskList')} onClick={t(() => editor!.chain().focus().toggleTaskList().run())}>
              <ListChecks className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Cita" active={editor?.isActive('blockquote')} onClick={t(() => editor!.chain().focus().toggleBlockquote().run())}>
              <Quote className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Bloque de código" active={editor?.isActive('codeBlock')} onClick={t(() => editor!.chain().focus().toggleCodeBlock().run())}>
              <Code2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Separador" onClick={t(() => editor!.chain().focus().setHorizontalRule().run())}>
              <Minus className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="Enlace" active={editor?.isActive('link')} onClick={setLink}>
              <Link2 className="size-4" />
            </ToolbarButton>
            <ToolbarDivider />
            {editor && <AccionesTabla editor={editor} />}
            <ToolbarDivider />
            <AyudaMenciones />
          </div>
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
    </div>
  );
}
