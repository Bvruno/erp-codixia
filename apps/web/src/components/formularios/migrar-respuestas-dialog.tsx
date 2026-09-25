'use client';

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronRight,
  Columns3,
  FilePlus2,
  FileText,
  Folder,
  Loader2,
  Rows3,
  Table2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, apiFetch } from '@/lib/api/cliente';
import { entitySlug } from '@/lib/slugs';
import { useTareas } from '@/components/tareas/tareas-context';
import {
  columnasDeFormulario,
  construirFilasTabla,
  tablaRespuestasMarkdown,
  valorColumna,
} from '@erp/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SelectorDocumento } from './selector-documento';
import { VistaPreviaTabla } from './vista-previa-tabla';
import type { DocumentPage, Formulario, FormularioRespuesta, TaskDocument } from '@/types';

// Diálogo "Migrar respuestas": elegir filas/columnas y destino, con vista
// previa real. Panel dividido (datos | destino) sin scroll anidado: la
// grilla y el panel derecho scrollean por separado dentro de un modal fijo.

const SIN_CARPETA = '__raiz__';

function alternarEnConjunto(
  setConjunto: Dispatch<SetStateAction<Set<string>>>,
  id: string
) {
  setConjunto((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function MigrarRespuestasDialog({
  abierto,
  onOpenChange,
  formulario,
  respuestas,
}: {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  formulario: Formulario;
  respuestas: FormularioRespuesta[];
}) {
  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      {abierto && (
        <Contenido
          formulario={formulario}
          respuestas={respuestas}
          onCerrar={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function Contenido({
  formulario,
  respuestas,
  onCerrar,
}: {
  formulario: Formulario;
  respuestas: FormularioRespuesta[];
  onCerrar: () => void;
}) {
  const ctx = useTareas();
  const router = useRouter();
  const { documents, canWrite } = ctx;
  const nombreRef = useRef<HTMLInputElement>(null);

  const formatoFecha = useMemo(
    () =>
      new Intl.DateTimeFormat('es', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );
  const columnas = useMemo(
    () => columnasDeFormulario(formulario.esquema),
    [formulario.esquema]
  );
  const filas = useMemo(
    () =>
      construirFilasTabla(formulario.esquema, respuestas, {
        formatearFecha: (iso) => formatoFecha.format(new Date(iso)),
      }),
    [formulario.esquema, respuestas, formatoFecha]
  );

  const [columnasActivas, setColumnasActivas] = useState<Set<string>>(
    () => new Set(columnas.map((c) => c.id))
  );
  const [filasActivas, setFilasActivas] = useState<Set<string>>(
    () => new Set(filas.map((f) => f.id))
  );

  const [destino, setDestino] = useState<'nuevo' | 'existente'>('nuevo');
  const [nombreDoc, setNombreDoc] = useState(`${formulario.name} — respuestas`);
  const [workspaceId, setWorkspaceId] = useState(formulario.workspace_id);
  const [folderId, setFolderId] = useState<string | null>(formulario.folder_id);
  const [docDestinoId, setDocDestinoId] = useState('');
  const [tituloPagina, setTituloPagina] = useState(`Respuestas — ${formulario.name}`);
  const [migrando, setMigrando] = useState(false);

  const columnasSel = useMemo(
    () => columnas.filter((c) => columnasActivas.has(c.id)),
    [columnas, columnasActivas]
  );
  const filasSel = useMemo(
    () => filas.filter((f) => filasActivas.has(f.id)),
    [filas, filasActivas]
  );
  const markdown = useMemo(
    () => tablaRespuestasMarkdown(columnasSel, filasSel),
    [columnasSel, filasSel]
  );

  const carpetasDelWorkspace = useMemo(
    () => ctx.folders.filter((f) => f.workspace_id === workspaceId),
    [ctx.folders, workspaceId]
  );

  const docsEditables = useMemo(
    () => documents.filter((d) => canWrite('document', d.id)),
    [documents, canWrite]
  );

  const rutaDoc = (doc: TaskDocument): string => {
    const ws = ctx.workspaces.find((w) => w.id === doc.workspace_id);
    const folder = doc.folder_id
      ? ctx.folders.find((f) => f.id === doc.folder_id)
      : undefined;
    return `${ws?.name ?? 'Espacio'}${folder ? ` › ${folder.name}` : ''}`;
  };

  const todoFilas = filas.length > 0 && filasActivas.size === filas.length;
  const parteFilas = filasActivas.size > 0 && !todoFilas;
  const todoColumnas = columnas.length > 0 && columnasActivas.size === columnas.length;

  const docSeleccionado = documents.find((d) => d.id === docDestinoId);
  const wsNombre = ctx.workspaces.find((w) => w.id === workspaceId)?.name ?? 'Espacio';
  const folderNombre = folderId
    ? ctx.folders.find((f) => f.id === folderId)?.name
    : undefined;
  const docNombre =
    destino === 'nuevo'
      ? nombreDoc.trim() || 'Documento nuevo'
      : docSeleccionado?.name ?? 'Elegir documento';

  const destinoIncompleto =
    destino === 'nuevo' ? !nombreDoc.trim() || !workspaceId : !docDestinoId;

  const esControlClickeado = (e: React.MouseEvent) =>
    (e.target as HTMLElement).closest('label,button,a,input') !== null;

  const irAlDocumento = (
    docId: string,
    workspaceIdBase: string,
    folderIdBase: string | null
  ) => {
    const doc = documents.find((d) => d.id === docId);
    const ws = ctx.workspaces.find((w) => w.id === (doc?.workspace_id ?? workspaceIdBase));
    if (!ws) {
      router.push('/proyectos');
      return;
    }
    const folderIdFinal = doc?.folder_id ?? folderIdBase;
    const folder = folderIdFinal
      ? ctx.folders.find((f) => f.id === folderIdFinal)
      : undefined;
    const segmento = doc ? entitySlug(doc, documents) : docId;
    router.push(
      `/proyectos/${entitySlug(ws, ctx.workspaces)}/${folder ? entitySlug(folder, ctx.folders) : 'raiz'}/documento/${segmento}`
    );
  };

  const migrar = async () => {
    if (migrando || !markdown || destinoIncompleto) return;
    setMigrando(true);
    try {
      let docId = docDestinoId;
      let workspaceBase = workspaceId;
      let folderBase: string | null = folderId;

      if (destino === 'nuevo') {
        const position = documents.filter(
          (d) => d.workspace_id === workspaceId && (d.folder_id ?? null) === folderId
        ).length;
        const res = await api.post<{ id: string }>('/entidades', {
          type: 'document',
          workspace_id: workspaceId,
          folder_id: folderId,
          organization_id: ctx.organizationId,
          name: nombreDoc.trim(),
          position,
          visibility: 'private',
        });
        docId = res.id;
      } else {
        const doc = documents.find((d) => d.id === docDestinoId);
        workspaceBase = doc?.workspace_id ?? workspaceId;
        folderBase = doc?.folder_id ?? null;
      }

      const paginasRes = await apiFetch<{ paginas: DocumentPage[] }>(
        `/documentos/${docId}/paginas`
      );
      const position = paginasRes.paginas?.length ?? 0;
      await api.post(`/documentos/${docId}/paginas`, {
        title: tituloPagina.trim() || `Respuestas — ${formulario.name}`,
        content: markdown,
        position,
      });

      if (destino === 'nuevo') ctx.refetch();
      toast.success('Tabla migrada al documento');
      onCerrar();
      irAlDocumento(docId, workspaceBase, folderBase);
    } catch {
      toast.error('No se pudieron migrar las respuestas');
    } finally {
      setMigrando(false);
    }
  };

  const cambiarACrear = () => {
    setDestino('nuevo');
    window.setTimeout(() => nombreRef.current?.focus(), 0);
  };

  return (
    <DialogContent className="flex h-[min(92dvh,880px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:rounded-none">
      <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-4 text-left sm:px-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary ring-1 ring-primary/15">
          <Table2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-base">Migrar respuestas a documento</DialogTitle>
          <DialogDescription className="truncate text-xs">
            {formulario.name} · {respuestas.length} respuesta
            {respuestas.length === 1 ? '' : 's'}
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] max-lg:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Datos a migrar */}
        <section className="flex min-h-0 flex-col max-lg:max-h-[42dvh]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-2.5">
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {`${filasSel.length} de ${plural(filas.length, 'fila', 'filas')} · ${columnasSel.length} de ${plural(columnas.length, 'columna', 'columnas')}`}
            </p>
            <div className="ml-auto flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Filas</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                aria-label="Todas las filas"
                onClick={() => setFilasActivas(new Set(filas.map((f) => f.id)))}
                disabled={todoFilas}
              >
                Todas
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                aria-label="Ninguna fila"
                onClick={() => setFilasActivas(new Set())}
                disabled={filasActivas.size === 0}
              >
                Ninguna
              </Button>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <span className="text-muted-foreground">Columnas</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                aria-label="Todas las columnas"
                onClick={() => setColumnasActivas(new Set(columnas.map((c) => c.id)))}
                disabled={todoColumnas}
              >
                Todas
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                aria-label="Ninguna columna"
                onClick={() => setColumnasActivas(new Set())}
                disabled={columnasActivas.size === 0}
              >
                Ninguna
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table
              className="w-full border-separate border-spacing-0 text-[13px]"
              aria-label="Respuestas para migrar"
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 left-0 z-30 w-52 min-w-52 border-r border-b bg-background px-3 py-2 text-left"
                  >
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={todoFilas ? true : parteFilas ? 'indeterminate' : false}
                        onCheckedChange={() =>
                          setFilasActivas(
                            todoFilas ? new Set() : new Set(filas.map((f) => f.id))
                          )
                        }
                        aria-label="Seleccionar todas las filas"
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        Fila · {filasActivas.size}/{filas.length}
                      </span>
                    </label>
                  </th>
                  {columnas.map((c) => {
                    const activa = columnasActivas.has(c.id);
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        className={cn(
                          'sticky top-0 z-20 border-b px-3 py-2 text-left',
                          activa ? 'bg-background' : 'bg-muted'
                        )}
                      >
                        <label className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={activa}
                            onCheckedChange={() => alternarEnConjunto(setColumnasActivas, c.id)}
                            aria-label={`Columna ${c.titulo}`}
                          />
                          <span
                            className={cn(
                              'block max-w-56 truncate text-xs font-medium',
                              !activa && 'text-muted-foreground'
                            )}
                            title={c.titulo}
                          >
                            {c.titulo}
                          </span>
                        </label>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const activa = filasActivas.has(f.id);
                  return (
                    <tr
                      key={f.id}
                      onClick={(e) => {
                        if (esControlClickeado(e)) return;
                        alternarEnConjunto(setFilasActivas, f.id);
                      }}
                      className={cn(
                        'group cursor-pointer transition-colors',
                        activa ? 'bg-primary-soft' : 'hover:bg-accent'
                      )}
                    >
                      <td
                        className={cn(
                          'sticky left-0 z-10 w-52 min-w-52 border-r border-b px-3 py-1.5',
                          activa
                            ? 'bg-[color-mix(in_oklab,var(--primary)_14%,var(--background))]'
                            : 'bg-background group-hover:bg-accent'
                        )}
                      >
                        <label className="flex cursor-pointer items-center gap-2.5">
                          <Checkbox
                            checked={activa}
                            onCheckedChange={() => alternarEnConjunto(setFilasActivas, f.id)}
                            aria-label={`Fila ${f.persona} ${f.fecha}`}
                          />
                          <Avatar className="size-6">
                            <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
                              {inicialesDe(f.persona)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {f.persona}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {f.fecha}
                            </span>
                          </span>
                        </label>
                      </td>
                      {columnas.map((c) => {
                        const valor = valorColumna(f, c.id);
                        return (
                          <td
                            key={c.id}
                            className={cn(
                              'border-b px-3 py-1.5',
                              columnasActivas.has(c.id) ? '' : 'text-muted-foreground'
                            )}
                          >
                            <span
                              className="block max-w-56 truncate"
                              title={valor}
                            >
                              {valor}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Destino y vista previa */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t bg-card-2/50 p-4 lg:border-t-0 lg:border-l">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Documento destino</h3>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Documento destino">
              <label
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring',
                  destino === 'nuevo'
                    ? 'border-primary/60 bg-primary-soft'
                    : 'hover:bg-muted/60'
                )}
              >
                <input
                  type="radio"
                  name="destino-migracion"
                  className="sr-only"
                  checked={destino === 'nuevo'}
                  onChange={() => setDestino('nuevo')}
                />
                <FilePlus2
                  className={cn('size-4', destino === 'nuevo' ? 'text-primary' : 'text-muted-foreground')}
                />
                <span className="text-sm font-medium">Documento nuevo</span>
                <span className="text-xs text-muted-foreground">Se crea desde cero</span>
              </label>
              <label
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring',
                  destino === 'existente'
                    ? 'border-primary/60 bg-primary-soft'
                    : 'hover:bg-muted/60'
                )}
              >
                <input
                  type="radio"
                  name="destino-migracion"
                  className="sr-only"
                  checked={destino === 'existente'}
                  onChange={() => setDestino('existente')}
                />
                <FileText
                  className={cn('size-4', destino === 'existente' ? 'text-primary' : 'text-muted-foreground')}
                />
                <span className="text-sm font-medium">Documento existente</span>
                <span className="text-xs text-muted-foreground">Se agrega una página</span>
              </label>
            </div>
          </section>

          <div className="space-y-3 rounded-xl border bg-background p-3.5">
            {destino === 'nuevo' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="migrar-nombre">Nombre del documento</Label>
                  <Input
                    ref={nombreRef}
                    id="migrar-nombre"
                    value={nombreDoc}
                    onChange={(e) => setNombreDoc(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Espacio</Label>
                  <Select
                    value={workspaceId}
                    onValueChange={(v) => {
                      setWorkspaceId(v);
                      setFolderId(null);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elegir espacio" />
                    </SelectTrigger>
                    <SelectContent>
                      {ctx.workspaces.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Carpeta</Label>
                  <Select
                    value={folderId ?? SIN_CARPETA}
                    onValueChange={(v) => setFolderId(v === SIN_CARPETA ? null : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Raíz" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_CARPETA}>Raíz</SelectItem>
                      {carpetasDelWorkspace.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label>Documento</Label>
                {docsEditables.length === 0 ? (
                  <div className="space-y-2 rounded-lg border border-dashed p-3 text-center">
                    <p className="text-sm text-muted-foreground">
                      No tenés documentos con permiso de escritura.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={cambiarACrear}>
                      <FilePlus2 className="size-3.5" />
                      Crear documento nuevo
                    </Button>
                  </div>
                ) : (
                  <>
                    <SelectorDocumento
                      documentos={docsEditables}
                      valor={docDestinoId}
                      onSeleccion={setDocDestinoId}
                      onCrearNuevo={cambiarACrear}
                      rutaDe={rutaDoc}
                    />
                    <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                      <FilePlus2 className="size-3.5 shrink-0" />
                      Se creará una página nueva dentro del documento.
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="migrar-pagina">Título de la página</Label>
              <Input
                id="migrar-pagina"
                value={tituloPagina}
                onChange={(e) => setTituloPagina(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs">
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{wsNombre}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate">{folderNombre ?? 'Raíz'}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate font-medium">{docNombre}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate text-muted-foreground">
              {tituloPagina.trim() || 'Página nueva'}
            </span>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Vista previa</h3>
            <VistaPreviaTabla columnas={columnasSel} filas={filasSel} markdown={markdown} />
          </section>
        </aside>
      </div>

      <DialogFooter className="flex-row items-center justify-between gap-3 border-t px-5 py-4 sm:justify-between sm:px-6">
        <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
          <Badge
            variant="secondary"
            className="gap-1 font-normal"
            aria-label={`${filasSel.length} filas seleccionadas`}
          >
            <Rows3 className="size-3.5" />
            {filasSel.length}
          </Badge>
          <Badge
            variant="secondary"
            className="gap-1 font-normal"
            aria-label={`${columnasSel.length} columnas seleccionadas`}
          >
            <Columns3 className="size-3.5" />
            {columnasSel.length}
          </Badge>
          <ArrowRight className="size-3.5 shrink-0" />
          <span className="truncate font-medium text-foreground">{docNombre}</span>
        </div>
        <div className="flex w-full justify-end gap-2 sm:w-auto">
          <Button variant="outline" onClick={onCerrar} disabled={migrando}>
            Cancelar
          </Button>
          <Button
            onClick={() => void migrar()}
            disabled={migrando || !markdown || destinoIncompleto}
          >
            {migrando && <Loader2 className="size-4 animate-spin" />}
            Migrar
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
